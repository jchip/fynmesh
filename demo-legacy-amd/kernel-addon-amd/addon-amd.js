/**
 * Kernel add-on: RequireJS loads legacy AMD deps from FynMesh federation on demand.
 *
 * The contract is the legacy build's webpack `externals`. Each external becomes a
 * `define([...deps])` id that a common RequireJS bundle used to provide. Federation
 * provides those ids and nothing else.
 *
 * RequireJS calls `requirejs.load` for each dep it has not seen. This add-on
 * wraps that hook. It looks the id up in the FynMesh AMD meta, which lives in
 * RequireJS module config:
 *
 *   requirejs.config({ config: { fynmesh: { modules: {
 *     "react": { fynapp: "fynapp-cwp", version: "3.2.0", expose: "./amd/react" }
 *   } } } });
 *
 * A CWP build emits that call as `amd-meta.js`, the way r.js emits a
 * `bundles` config. `version` names the release, which the kernel keys as
 * `name@version`. An entry without it loads the FynApp by name. RequireJS deep-merges `config`, so several meta files add up,
 * and each RequireJS context has its own. A listed id loads its FynApp, then the
 * expose. Every other id goes straight to the normal script load. Ids reach the
 * hook after RequireJS applies `map`, so `map` picks the version per consumer.
 *
 * Load order: require.js, the kernel, this script, then the meta, all before the
 * first `require()`.
 *
 * Metrics, for generating preload meta, go to kernel telemetry (recorded once
 * `kernel.setTelemetry` is called):
 * - `amd.module`: one per defined module. `value` is ms from request to defined.
 *   `data` is { id, route: "bridge" | "legacy" | "inline", url, deps }. The deps
 *   give the graph, and route plus url say where each module comes from.
 * - `amd.bridge`: one per FynApp load. `value` is ms, `data` is { name, ok }.
 */
(function () {
  // webpack AMD externals expect a CommonJS-style exports object: no __esModule,
  // so `import X from "x"` resolves to the object itself.
  function toAmdExports(ns) {
    var base = ns.default && typeof ns.default === "object" ? ns.default : {};
    var out = Object.assign({}, base, ns);
    delete out.default;
    delete out.__esModule;
    return out;
  }

  function lookup(context, id) {
    var meta = context.config.config.fynmesh;
    return meta && meta.modules && meta.modules[id];
  }

  globalThis.fynMeshKernel.use({
    name: "amd",
    install: function (kernel, hooks) {
      var req = globalThis.requirejs;
      if (typeof req !== "function" || !globalThis.define || !globalThis.define.amd) {
        throw new Error("addon-amd: load RequireJS before the add-on");
      }

      var tel = hooks.tel.scope("amd");

      // Each FynApp loads once, on its first id. A failed one resolves to null.
      var apps = {};
      function loadApp(name, version) {
        var key = version ? name + "@" + version : name;
        if (apps[key]) return apps[key];
        var t0 = Date.now();
        var done = function (app) {
          tel.capture({ type: "metric", name: "bridge", value: Date.now() - t0, data: { name: key, ok: !!app } });
          return app;
        };
        return (apps[key] = kernel.loadFynAppsByName([{ name: name, range: version }]).then(
          function () {
            return done(hooks.findApp(key) || null);
          },
          function (e) {
            console.error("addon-amd: " + key + " failed to load", e);
            return done(null);
          }
        ));
      }

      // id -> { t0, route } for modules requested but not yet defined
      var pending = {};

      // RequireJS reports each defined module with its resolved deps.
      var origOnResourceLoad = req.onResourceLoad;
      req.onResourceLoad = function (context, map, depMaps) {
        var p = pending[map.id];
        delete pending[map.id];
        var route = p ? p.route : "inline";
        tel.capture({
          type: "metric",
          name: "module",
          value: p ? Date.now() - p.t0 : undefined,
          data: {
            id: map.id,
            route: route,
            url: route === "legacy" ? new URL(map.url, document.baseURI).href : undefined,
            deps: depMaps.map(function (d) {
              return d.id;
            }),
          },
        });
        if (origOnResourceLoad) origOnResourceLoad.apply(this, arguments);
      };

      var origLoad = req.load;
      req.load = function (context, id, url) {
        var self = this;
        var args = arguments;
        var m = lookup(context, id);
        if (!m) {
          pending[id] = { t0: Date.now(), route: "legacy" };
          return origLoad.apply(self, args);
        }
        pending[id] = { t0: Date.now(), route: "bridge" };
        // A `bundles` entry gives its ids one url, and RequireJS calls load once
        // per url. Free it so the bundle's other ids reach this hook too.
        delete context.urlFetched[url];
        loadApp(m.fynapp, m.version)
          .then(function (app) {
            if (!app) throw new Error("FynApp " + m.fynapp + " not loaded");
            return hooks.loadExpose(app, m.expose);
          })
          .then(function (r) {
            if (!r.success) throw r.error;
            var exports = toAmdExports(r.value.ns);
            // completeLoad binds any anonymous define still queued to this id. A
            // script's anonymous define waits in that queue until its load event,
            // and microtasks can run in between. A browser runs a script and fires
            // its load event in one task, so a new task never lands in that gap.
            setTimeout(function () {
              globalThis.define(id, [], function () {
                return exports;
              });
              context.completeLoad(id);
            });
          })
          .catch(function (e) {
            // Fall back to the page's own config. paths fallbacks and errbacks then work as usual.
            tel.capErr("load", { id: id }, e);
            pending[id].route = "legacy";
            context.urlFetched[url] = true;
            origLoad.apply(self, args);
          });
      };
    },
  });
})();
