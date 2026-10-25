/**
 * Kernel add-on: RequireJS loads legacy AMD deps from a FynMesh bridge on demand.
 *
 * RequireJS reads a module's `define([...deps])` and calls `requirejs.load` for
 * each dep it has not seen. This add-on wraps that hook. When the bridge FynApp
 * exposes `./amd/<id>`, the dep comes from federation. Every other id falls
 * through to the normal script load. Nothing is preloaded.
 *
 * Load order: require.js, the kernel, then this script. Set the bridge name with
 * `data-bridge` on the script tag (default "fynapp-amd-bridge").
 *
 * Metrics, for generating preload meta, go to kernel telemetry (recorded once
 * `kernel.setTelemetry` is called):
 * - `amd.module`: one per defined module. `value` is ms from request to defined.
 *   `data` is { id, route: "bridge" | "legacy" | "inline", url, deps }. The deps
 *   give the graph, and route plus url say where each module comes from.
 * - `amd.bridge`: the bridge load. `value` is ms, `data` is { name, ok }.
 */
(function () {
  var bridgeName = (document.currentScript && document.currentScript.dataset.bridge) || "fynapp-amd-bridge";

  // webpack AMD externals expect a CommonJS-style exports object: no __esModule,
  // so `import X from "x"` resolves to the object itself.
  function toAmdExports(ns) {
    var base = ns.default && typeof ns.default === "object" ? ns.default : {};
    var out = Object.assign({}, base, ns);
    delete out.default;
    delete out.__esModule;
    return out;
  }

  globalThis.fynMeshKernel.use({
    name: "amd",
    install: function (kernel, hooks) {
      var req = globalThis.requirejs;
      if (typeof req !== "function" || !globalThis.define || !globalThis.define.amd) {
        throw new Error("addon-amd: load RequireJS before the add-on");
      }

      var tel = hooks.tel.scope("amd");

      // Loaded once, on the first AMD request. A failed bridge leaves legacy loading as it was.
      var bridge;
      function loadBridge() {
        if (bridge) return bridge;
        var t0 = Date.now();
        var done = function (app) {
          tel.capture({ type: "metric", name: "bridge", value: Date.now() - t0, data: { name: bridgeName, ok: !!app } });
          return app;
        };
        return (bridge = kernel.loadFynAppsByName([{ name: bridgeName }]).then(
          function () {
            return done(hooks.findApp(bridgeName) || null);
          },
          function (e) {
            console.error("addon-amd: bridge failed to load, using RequireJS paths", e);
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
        var p = (pending[id] = { t0: Date.now(), route: "legacy" });
        loadBridge()
          .then(function (app) {
            var expose = "./amd/" + id;
            if (!app || !app.entry.container.$E[expose]) {
              return origLoad.call(self, context, id, url);
            }
            p.route = "bridge";
            return hooks.loadExpose(app, expose).then(function (r) {
              if (!r.success) throw r.error;
              var exports = toAmdExports(r.value.ns);
              globalThis.define(id, [], function () {
                return exports;
              });
              context.completeLoad(id);
            });
          })
          .catch(function (e) {
            tel.capErr("load", { id: id }, e);
            context.onError(e);
          });
      };
    },
  });
})();
