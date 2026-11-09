(function () {
  'use strict';

  class FynEventTarget extends EventTarget {
    /**
     * Add an event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    on(type, handler, options) {
      this.addEventListener(type, handler, options);
    }
    /**
     * Add a one-time event listener
     * @param type The event type to listen for
     * @param handler The event handler
     * @param options Optional addEventListener options
     */
    once(type, handler, options) {
      const xh = (evt) => {
        this.removeEventListener(type, xh);
        return typeof handler === "function" ? handler(evt) : handler.handleEvent(evt);
      };
      this.addEventListener(type, xh, options);
    }
  }

  const fynMeshShareScope = "fynmesh";

  function urlJoin(baseUrl, urlPath) {
    const fillSlash = urlPath.startsWith("/") || baseUrl.endsWith("/") ? "" : "/";
    return `${baseUrl}${fillSlash}${urlPath}`;
  }
  function getFederation() {
    const Federation = globalThis.Federation;
    if (!Federation) {
      throw new Error("Federation.js is not loaded.");
    }
    return Federation;
  }

  function captureEvent(tel, name, data) {
    tel.capture({ type: "event", name, data });
  }
  function forwardTelemetry(sink, prefix = "") {
    const named = (name) => prefix ? `${prefix}.${name}` : name;
    return {
      capture: (entry) => sink().capture({ ...entry, name: named(entry.name) }),
      capErr: (name, data, error) => sink().capErr(named(name), data, error),
      scope: (sub) => forwardTelemetry(sink, named(sub)),
      flush: () => sink().flush()
    };
  }
  const noOpTelemetry = {
    capture() {
    },
    capErr() {
    },
    scope() {
      return noOpTelemetry;
    },
    flush() {
    }
  };

  const ManifestResolver = function(telemetry) {
    const tel = telemetry ?? noOpTelemetry;
    const manifestCache = /* @__PURE__ */ new Map();
    const nodeMeta = /* @__PURE__ */ new Map();
    const preloadedEntries = /* @__PURE__ */ new Map();
    let registryResolver;
    let preloadCallback;
    const calculateDistBase = (res) => res.distBase || new URL(res.url, location.href).pathname.replace(/\/[^/]*$/, "/");
    const preloadEntryFile = (distBase, depth) => {
      const entryUrl = `${distBase}fynapp-entry.js`;
      if (preloadedEntries.has(entryUrl)) {
        return;
      }
      preloadedEntries.set(entryUrl, depth);
      if (preloadCallback) {
        console.debug(`\u26A1 Preloading entry file: ${entryUrl} (depth: ${depth})`);
        preloadCallback(entryUrl, depth);
      }
    };
    const updateNodeMeta = (key, res, manifest) => {
      nodeMeta.set(key, {
        name: res.name,
        version: manifest.version || res.version,
        url: res.url,
        distBase: calculateDistBase(res)
      });
    };
    const reportResolved = (t0, name, version) => {
      tel.capture({ type: "metric", name: "resolve.duration", value: Date.now() - t0, data: { name } });
      captureEvent(tel, "resolved", { name, version });
    };
    const cacheResolved = (t0, name, res, manifest) => {
      const version = manifest.version || res.version;
      const key = `${res.name}@${version}`;
      manifestCache.set(key, manifest);
      updateNodeMeta(key, res, manifest);
      reportResolved(t0, name, version);
      return { key, res, manifest };
    };
    const fetchJson = async (url) => {
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    };
    const resolveAndFetch = async (name, range) => {
      const t0 = Date.now();
      if (!registryResolver) {
        throw new Error("No registry resolver configured");
      }
      const res = await registryResolver(name, range);
      const resolvedVersion = res.version;
      const cacheKey = `${res.name}@${resolvedVersion}`;
      const cached = manifestCache.get(cacheKey);
      if (cached) {
        updateNodeMeta(cacheKey, { ...res, version: resolvedVersion }, cached);
        reportResolved(t0, name, cached.version || resolvedVersion);
        return { key: cacheKey, res, manifest: cached };
      }
      try {
        const entryUrl = res.url.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
        const entryModule = await getFederation().import(entryUrl);
        if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
          return cacheResolved(t0, name, res, entryModule.__FYNAPP_MANIFEST__);
        }
      } catch (embeddedErr) {
      }
      let manifest;
      try {
        manifest = await fetchJson(res.url);
      } catch (err1) {
        try {
          manifest = await fetchJson(
            res.url.replace(/fynapp\.manifest\.json$/, "federation.json")
          );
        } catch (err2) {
          manifest = { name, version: res.version, requires: [] };
        }
      }
      return cacheResolved(t0, name, res, manifest);
    };
    const buildGraph = async (requests) => {
      const adj = /* @__PURE__ */ new Map();
      const indegree = /* @__PURE__ */ new Map();
      const nodes = /* @__PURE__ */ new Set();
      const visit = async (name, range, parentKey, depth = 0) => {
        const { key, manifest } = await resolveAndFetch(name, range);
        const isNewNode = !nodes.has(key);
        if (isNewNode) {
          nodes.add(key);
          indegree.set(key, indegree.get(key) ?? 0);
        }
        if (parentKey) {
          const set = adj.get(key) || /* @__PURE__ */ new Set();
          if (!set.has(parentKey)) {
            set.add(parentKey);
            adj.set(key, set);
            indegree.set(parentKey, (indegree.get(parentKey) ?? 0) + 1);
          }
        }
        if (!isNewNode) {
          return key;
        }
        const deps = [];
        for (const req of manifest.requires || []) {
          deps.push([req.name, req.range]);
        }
        const importExposed = manifest["import-exposed"];
        if (importExposed && typeof importExposed === "object") {
          for (const [packageName, modules] of Object.entries(importExposed)) {
            let semver;
            if (modules && typeof modules === "object") {
              for (const moduleInfo of Object.values(modules)) {
                if (moduleInfo && typeof moduleInfo === "object" && "semver" in moduleInfo) {
                  semver = moduleInfo.semver;
                  break;
                }
              }
            }
            deps.push([packageName, semver]);
          }
        }
        const sharedProviders = manifest["shared-providers"];
        if (sharedProviders && typeof sharedProviders === "object") {
          console.debug(`\u{1F4E6} Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
          for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
            let semver;
            if (providerInfo && typeof providerInfo === "object" && "semver" in providerInfo) {
              semver = providerInfo.semver;
            }
            console.debug(`  \u2192 Loading shared provider: ${packageName}@${semver || "latest"}`);
            deps.push([packageName, semver]);
          }
        }
        await Promise.all(
          deps.map(async ([depName, semver]) => {
            preloadEntryFile(calculateDistBase(await registryResolver(depName, semver)), depth + 1);
            await visit(depName, semver, key, depth + 1);
          })
        );
        return key;
      };
      await Promise.all(requests.map((r) => visit(r.name, r.range)));
      console.debug("buildGraph completed, nodes:", Array.from(nodes));
      captureEvent(tel, "graph.built", { nodes: nodes.size });
      return { nodes, adj, indegree };
    };
    const topoBatches = (graph) => {
      const { nodes, adj } = graph;
      const indegree = new Map(graph.indegree);
      const q = [];
      for (const n of nodes) {
        if ((indegree.get(n) ?? 0) === 0) q.push(n);
      }
      const order = [];
      const batches = [];
      while (q.length) {
        const batch = q.splice(0, q.length);
        batches.push(batch);
        for (const u of batch) {
          order.push(u);
          for (const v of adj.get(u) ?? []) {
            indegree.set(v, (indegree.get(v) ?? 0) - 1);
            if ((indegree.get(v) ?? 0) === 0) q.push(v);
          }
        }
      }
      if (order.length < nodes.size) {
        const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
        console.warn(`\u26A0\uFE0F Dependency cycle detected among: ${cyclic.join(", ")} - proceeding with best-effort loading`);
        batches.push(cyclic);
      }
      return batches;
    };
    return {
      // Exposed because the manifest-resolution tests seed and assert them
      // directly; they are the caching behaviour those tests exist to cover.
      manifestCache,
      nodeMeta,
      setRegistryResolver: (resolver) => {
        registryResolver = resolver;
      },
      setPreloadCallback: (callback) => {
        preloadCallback = callback;
      },
      async warmPreload(requests) {
        if (!preloadCallback || !registryResolver) return;
        for (const r of requests) {
          preloadEntryFile(calculateDistBase(await registryResolver(r.name, r.range)), 0);
        }
      },
      getDistBase: calculateDistBase,
      resolveAndFetch,
      buildGraph,
      topoBatches
    };
  };

  const DEFAULT_BOOTSTRAP_TIMEOUT = 3e4;
  const BootstrapCoordinator = function(events, timeoutMs, telemetry) {
    const tel = telemetry ?? noOpTelemetry;
    const deferredBootstraps = [];
    const fynAppBootstrapStatus = /* @__PURE__ */ new Map();
    const fynAppProviderModes = /* @__PURE__ */ new Map();
    let bootstrappingApp = null;
    let timeout = timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT;
    const findProviderForMiddleware = (middlewareName, excludeFynApp) => {
      for (const [fynAppName, modes] of fynAppProviderModes.entries()) {
        if (fynAppName === excludeFynApp) continue;
        if (modes.get(middlewareName) === "provider") {
          return fynAppName;
        }
      }
      return null;
    };
    const areBootstrapDependenciesSatisfied = (fynApp) => {
      let modes = fynAppProviderModes.get(fynApp.name);
      if (!modes) {
        return true;
      }
      for (const [middlewareName, mode] of modes.entries()) {
        if (mode === "consumer") {
          const providerName = findProviderForMiddleware(middlewareName, fynApp.name);
          if (providerName && !fynAppBootstrapStatus.has(providerName)) {
            console.debug(
              `\u23F3 ${fynApp.name} waiting for provider ${providerName} to bootstrap (mw: ${middlewareName})`
            );
            return false;
          }
        }
      }
      return true;
    };
    const finishBootstrapAndResumeNext = () => {
      bootstrappingApp = null;
      const nextIndex = deferredBootstraps.findIndex(
        (d) => areBootstrapDependenciesSatisfied(d.fynApp)
      );
      if (nextIndex >= 0) {
        const next = deferredBootstraps.splice(nextIndex, 1)[0];
        console.debug(`\u{1F504} Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
        captureEvent(tel, "resumed", { app: next.fynApp.name });
        next.resolve();
      } else if (deferredBootstraps.length > 0) {
        console.debug(`\u23F8\uFE0F ${deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`);
      }
    };
    events.on("FYNAPP_BOOTSTRAPPED", (event) => {
      const { name } = event.detail;
      console.debug(`\u2705 FynApp ${name} bootstrap complete, checking deferred bootstraps`);
      captureEvent(tel, "completed", { app: name });
      fynAppBootstrapStatus.set(name, "bootstrapped");
      finishBootstrapAndResumeNext();
    });
    events.on("FYNAPP_BOOTSTRAP_FAILED", (event) => {
      const { name, error } = event.detail;
      console.debug(`\u274C FynApp ${name} bootstrap failed, checking deferred bootstraps`);
      if (error) {
        tel.capErr("failed", { app: name }, error);
      } else {
        tel.capture({ type: "error", name: "failed", data: { app: name } });
      }
      finishBootstrapAndResumeNext();
    });
    return {
      events,
      deferredBootstraps,
      fynAppBootstrapStatus,
      fynAppProviderModes,
      areBootstrapDependenciesSatisfied,
      findProviderForMiddleware,
      get bootstrappingApp() {
        return bootstrappingApp;
      },
      set bootstrappingApp(value) {
        bootstrappingApp = value;
      },
      setTimeout(value) {
        timeout = value;
      },
      canBootstrap: (fynApp) => bootstrappingApp === null && areBootstrapDependenciesSatisfied(fynApp),
      acquireBootstrapLock(fynAppName) {
        if (bootstrappingApp !== null) {
          return false;
        }
        bootstrappingApp = fynAppName;
        console.debug(`\u{1F512} ${fynAppName} acquired bootstrap lock`);
        captureEvent(tel, "lock.acquired", { app: fynAppName });
        return true;
      },
      releaseBootstrapLock() {
        bootstrappingApp = null;
      },
      /**
       * Defer a bootstrap until dependencies are ready.
       * If timeout is reached, the FynApp is skipped with an error.
       */
      deferBootstrap(fynApp) {
        const reason = bootstrappingApp !== null ? `${bootstrappingApp} is currently bootstrapping` : `waiting for provider dependencies`;
        console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name} (${reason})`);
        captureEvent(tel, "deferred", { app: fynApp.name, reason });
        return new Promise((resolve) => {
          const deferred = {
            fynApp,
            resolve: () => {
              if (deferred.timeoutId) {
                clearTimeout(deferred.timeoutId);
              }
              resolve();
            }
          };
          deferred.timeoutId = setTimeout(() => {
            const idx = deferredBootstraps.indexOf(deferred);
            if (idx >= 0) {
              deferredBootstraps.splice(idx, 1);
            }
            const message = `Bootstrap timeout (${timeout}ms): ${fynApp.name} timed out waiting for ${reason}`;
            console.error(`\u23F0 ${message}. Skipping this FynApp - the party goes on!`);
            tel.capErr(
              "timeout",
              { app: fynApp.name, timeout, reason },
              new Error(message)
            );
            events.dispatchEvent(
              new CustomEvent("FYNAPP_BOOTSTRAP_TIMEOUT", {
                detail: { name: fynApp.name, version: fynApp.version, reason, timeout }
              })
            );
            resolve();
          }, timeout);
          deferredBootstraps.push(deferred);
        });
      },
      registerProviderMode(fynAppName, middlewareName, mode) {
        let modes = fynAppProviderModes.get(fynAppName);
        if (!modes) {
          modes = /* @__PURE__ */ new Map();
          fynAppProviderModes.set(fynAppName, modes);
        }
        modes.set(middlewareName, mode);
        console.debug(`\u{1F4DD} ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
      },
      clear() {
        bootstrappingApp = null;
        for (const deferred of deferredBootstraps) {
          if (deferred.timeoutId) {
            clearTimeout(deferred.timeoutId);
          }
        }
        deferredBootstraps.length = 0;
        fynAppBootstrapStatus.clear();
        fynAppProviderModes.clear();
      }
    };
  };

  var __defProp$1 = Object.defineProperty;
  var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
  const KernelErrorCode = {
    EXPOSE_MODULE_NOT_FOUND: 1003};
  class KernelError extends Error {
    constructor(code, message, options) {
      super(message);
      __publicField$1(this, "code");
      __publicField$1(this, "context");
      __publicField$1(this, "cause");
      this.name = "KernelError";
      this.code = code;
      this.context = options?.context;
      this.cause = options?.cause;
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }
    /**
     * Get a formatted error message with context
     */
    toDetailedString() {
      let result = `[${this.name}:${this.code}] ${this.message}`;
      if (this.context) {
        result += `
Context: ${JSON.stringify(this.context, null, 2)}`;
      }
      if (this.cause) {
        result += `
Caused by: ${this.cause.message}`;
      }
      return result;
    }
  }
  function defineErrorClass(name) {
    return class extends KernelError {
      constructor(code, message, options) {
        const { cause, ...context } = options ?? {};
        super(code, message, { context, cause });
        this.name = name;
      }
    };
  }
  const ModuleLoadError = defineErrorClass("ModuleLoadError");
  function ok(value) {
    return { success: true, value };
  }
  function err(error) {
    return { success: false, error };
  }

  const ModuleLoader = function(telemetry, hooks) {
    const tel = telemetry ?? noOpTelemetry;
    const loadExposeModule = async (fynApp, exposeName, record, onExpose) => {
      const container = fynApp.entry.container;
      if (!container?.$E[exposeName]) {
        const error = new ModuleLoadError(
          KernelErrorCode.EXPOSE_MODULE_NOT_FOUND,
          `No expose module '${exposeName}' found for ${fynApp.name}@${fynApp.version}`,
          {
            fynAppName: fynApp.name,
            fynAppVersion: fynApp.version,
            exposeName
          }
        );
        tel.capErr(
          "expose.not_found",
          { app: fynApp.name, expose: exposeName },
          error
        );
        console.debug(`\u274C ${error.message}`);
        return err(error);
      }
      const factory = await fynApp.entry.get(exposeName);
      const exposedModule = typeof factory === "function" ? factory() : void 0;
      if (record && exposedModule && typeof exposedModule === "object") {
        onExpose?.(fynApp, exposeName, exposedModule);
        fynApp.exposes[exposeName] = exposedModule;
        if (exposedModule.__name) {
          fynApp.exposes[exposedModule.__name] = exposedModule;
        }
        return ok(exposedModule);
      }
      return ok(exposedModule);
    };
    const loadFynAppBasics = async (fynAppEntry, apps, onExpose) => {
      const container = fynAppEntry.container;
      if (!container?.name || !container?.version) {
        throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
      }
      if (container.$SS) {
        console.debug("\u{1F680} FynApp entry already initialized", container.name, container.version);
      } else {
        console.debug("\u{1F680} Initializing FynApp entry", container.name, container.version);
        fynAppEntry.init();
      }
      captureEvent(tel, "fynapp.init", { app: container.name, version: container.version });
      console.debug("\u{1F680} Loading FynApp basics for", container.name, container.version);
      const fynApp = {
        name: container.name,
        version: container.version || "1.0.0",
        packageName: container.name,
        entry: fynAppEntry,
        middlewareContext: /* @__PURE__ */ new Map(),
        exposes: {}
      };
      if (container && container.$E["./config"]) {
        const factory = await fynAppEntry.get("./config");
        fynApp.config = factory();
      }
      if (fynAppEntry.setup) {
        console.debug("\u{1F680} Invoking entry.setup for", fynApp.name, fynApp.version);
        await fynAppEntry.setup();
      }
      const mainResult = await loadExposeModule(fynApp, "./main", true, onExpose);
      if (!mainResult.success) {
        console.debug(`\u26A0\uFE0F Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
      }
      for (const h of hooks?.basicsLoaded ?? []) {
        await h(fynApp);
      }
      console.debug("\u2705 FynApp basics loaded for", fynApp.name, fynApp.version);
      captureEvent(tel, "fynapp.basics_loaded", { app: fynApp.name, version: fynApp.version });
      apps.add(fynApp);
      return fynApp;
    };
    const mkRuntime = (fynApp) => {
      const runtime = {
        fynApp,
        // Reuse the FynApp's middlewareContext to maintain consistency
        // This is critical for deferred loading scenarios where middlewares are resumed
        middlewareContext: fynApp.middlewareContext || /* @__PURE__ */ new Map()
      };
      for (const h of hooks?.runtime ?? []) {
        h(fynApp, runtime);
      }
      return runtime;
    };
    const invokeFynUnit = async (fynUnit, fynApp) => {
      const runtime = mkRuntime(fynApp);
      if (fynUnit.initialize) {
        console.debug("\u{1F680} Invoking unit.initialize for", fynApp.name, fynApp.version);
        const initResult = await fynUnit.initialize(runtime);
        console.debug("\u{1F680} Initialize result:", initResult);
      }
      if (fynUnit.execute) {
        console.debug("\u{1F680} Invoking unit.execute for", fynApp.name, fynApp.version);
        captureEvent(tel, "fynunit.execute", { app: fynApp.name });
        const executeResult = await fynUnit.execute(runtime);
        if (executeResult) {
          console.debug(`\u{1F4E6} FynUnit returned result:`, typeof executeResult === "object" ? executeResult.type : typeof executeResult);
        }
      }
    };
    return { loadExposeModule, loadFynAppBasics, mkRuntime, invokeFynUnit };
  };

  const keysOf = (fynApp) => [`${fynApp.name}@${fynApp.version}`, fynApp.name];
  const FynAppRegistry = function(initial) {
    let apps = initial || {};
    return {
      initialize(next) {
        apps = next;
      },
      add(fynApp) {
        for (const key of keysOf(fynApp)) apps[key] = fynApp;
      },
      get: (key) => apps[key],
      has: (key) => !!apps[key],
      remove(fynApp, lookupName) {
        if (lookupName) delete apps[lookupName];
        for (const key of keysOf(fynApp)) delete apps[key];
      }
    };
  };

  const FynAppLifecycle = function() {
    const states = /* @__PURE__ */ new Map();
    const key = (name, version) => `${name}@${version}`;
    return {
      set(name, version, status, error) {
        const k = key(name, version);
        const now = Date.now();
        const state = {
          name,
          version,
          status,
          error: status === "failed" ? error : void 0,
          updatedAt: now,
          mountedAt: status === "mounted" ? now : states.get(k)?.mountedAt
        };
        states.set(k, state);
        return state;
      },
      get: (name, version) => states.get(key(name, version)),
      find(nameOrKey) {
        const direct = states.get(nameOrKey);
        if (direct) return direct;
        let match;
        for (const state of states.values()) {
          if (state.name === nameOrKey && (!match || state.updatedAt >= match.updatedAt)) {
            match = state;
          }
        }
        return match;
      },
      list: () => [...states.values()],
      remove(name, version) {
        states.delete(key(name, version));
      }
    };
  };

  const KERNEL_VERSION = "1.1.5";

  var __defProp = Object.defineProperty;
  var __typeError$1 = (msg) => {
    throw TypeError(msg);
  };
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  var __accessCheck$1 = (obj, member, msg) => member.has(obj) || __typeError$1("Cannot " + msg);
  var __privateGet$1 = (obj, member, getter) => (__accessCheck$1(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd$1 = (obj, member, value) => member.has(obj) ? __typeError$1("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet$1 = (obj, member, value, setter) => (__accessCheck$1(obj, member, "write to private field"), member.set(obj, value), value);
  var __privateMethod$1 = (obj, member, method) => (__accessCheck$1(obj, member, "access private method"), method);
  var _telSink, _addons, _onExpose, _FynMeshKernelCore_instances, runtimeFor_fn, appData_fn, appGone_fn, callUnitHook_fn, emitLifecycle_fn, transitionLifecycle_fn;
  class FynMeshKernelCore {
    constructor() {
      __privateAdd$1(this, _FynMeshKernelCore_instances);
      __publicField(this, "events");
      __publicField(this, "version", KERNEL_VERSION);
      __publicField(this, "shareScopeName", fynMeshShareScope);
      __publicField(this, "runTime");
      // Telemetry: forwards to a sink the telemetry add-on can swap in
      __privateAdd$1(this, _telSink, noOpTelemetry);
      __publicField(this, "tel", forwardTelemetry(() => __privateGet$1(this, _telSink)));
      // Add-ons
      __privateAdd$1(this, _addons, /* @__PURE__ */ new Set());
      __publicField(this, "hooks");
      // Extracted modules
      __publicField(this, "manifestResolver");
      __publicField(this, "bootstrapCoordinator");
      __publicField(this, "loader");
      __publicField(this, "fynAppRegistry");
      __publicField(this, "fynAppLifecycle");
      /** Runs the `exposeLoaded` hooks for each recorded expose module. */
      __privateAdd$1(this, _onExpose, (fynApp, exposeName, exposedModule) => {
        for (const h of this.hooks.exposeLoaded) {
          h(fynApp, exposeName, exposedModule);
        }
      });
      this.events = new FynEventTarget();
      this.runTime = {
        apps: {},
        middlewares: {}
      };
      this.fynAppRegistry = new FynAppRegistry(this.runTime.apps);
      this.fynAppLifecycle = new FynAppLifecycle();
      this.hooks = {
        tel: this.tel,
        setTel: (sink) => {
          __privateSet$1(this, _telSink, sink);
        },
        rt: () => this.runTime,
        findApp: (name) => this.fynAppRegistry.get(name),
        loadExpose: (fynApp, exposeName) => this.loader.loadExposeModule(fynApp, exposeName, true, __privateGet$1(this, _onExpose)),
        runtimeFor: (fynApp) => __privateMethod$1(this, _FynMeshKernelCore_instances, runtimeFor_fn).call(this, fynApp),
        providerMode: (fynAppName, name, mode) => this.bootstrapCoordinator.registerProviderMode(fynAppName, name, mode),
        init: [],
        exposeLoaded: [],
        basicsLoaded: [],
        beforeMain: [],
        runUnit: [],
        runtime: [],
        appGone: []
      };
      this.manifestResolver = new ManifestResolver(this.tel.scope("manifest"));
      this.bootstrapCoordinator = new BootstrapCoordinator(this.events, void 0, this.tel.scope("bootstrap"));
      this.loader = new ModuleLoader(this.tel.scope("loader"), this.hooks);
    }
    /**
     * Install an add-on. A name already installed is skipped, so loading the
     * same add-on bundle twice is harmless.
     */
    use(addon) {
      if (__privateGet$1(this, _addons).has(addon.name)) {
        return;
      }
      __privateGet$1(this, _addons).add(addon.name);
      addon.install(this, this.hooks);
    }
    /**
     * Send an event to the kernel
     */
    async emitAsync(event) {
      return this.events.dispatchEvent(event);
    }
    /**
     * Install a registry resolver (browser: demo server paths)
     */
    setRegistryResolver(resolver) {
      this.manifestResolver.setRegistryResolver(resolver);
    }
    /**
     * Set callback for preloading entry files
     */
    setPreloadCallback(callback) {
      this.manifestResolver.setPreloadCallback(callback);
    }
    /**
     * Load FynApps by name using manifests and a dependency graph.
     *
     * Throws on structural errors (no registry resolver configured, dependency
     * graph build failures). Per-app load failures are isolated — a `null` result
     * from `loadFynApp` does not abort the batch. See
     * `FynMeshKernel.loadFynAppsByName` for the full error contract.
     */
    async loadFynAppsByName(requests, options) {
      captureEvent(this.tel, "load_batch.started", { count: requests.length });
      await this.manifestResolver.warmPreload(requests);
      const graph = await this.manifestResolver.buildGraph(requests);
      const batches = this.manifestResolver.topoBatches(graph);
      const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
      const allMeta = this.manifestResolver.nodeMeta;
      const requestedBy = requests.map((r) => r.name);
      const emitLoad = (type, key, ok) => {
        const { name, version } = allMeta.get(key);
        const detail = { name, version, requestedBy, ...ok !== void 0 && { ok } };
        this.events.dispatchEvent(new CustomEvent(type, { detail }));
      };
      const toLoad = new Set(batches.flat().filter((key) => !this.fynAppRegistry.has(key)));
      for (const key of toLoad) emitLoad("FYNAPP_LOADING", key);
      for (const batch of batches) {
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
            while (next < batch.length) {
              const key = batch[next++];
              const meta = allMeta.get(key);
              const baseUrl = meta.distBase || meta.url.replace(/\/[^/]*$/, "/");
              console.debug(`\u{1F4E6} Loading ${meta.name}@${meta.version} from ${baseUrl}`);
              const fynApp = await this.loadFynApp(baseUrl);
              if (toLoad.has(key)) emitLoad("FYNAPP_LOADED", key, fynApp !== null);
            }
          })
        );
      }
      this.tel.capture({ type: "event", name: "load_batch.completed" });
    }
    /**
     * Initialize the kernel runtime data
     */
    initRunTime(data) {
      this.runTime = { ...data };
      this.fynAppRegistry.initialize(this.runTime.apps);
      for (const h of this.hooks.init) {
        h(data);
      }
      return this.runTime;
    }
    /**
     * Load FynApp basics
     */
    async loadFynAppBasics(fynAppEntry) {
      return this.loader.loadFynAppBasics(fynAppEntry, this.fynAppRegistry, __privateGet$1(this, _onExpose));
    }
    /**
     * Check if a FynApp is already loaded by examining the registry
     * Returns the existing FynApp instance if found, null otherwise
     */
    checkAlreadyLoaded(fynAppEntry) {
      const fynAppName = fynAppEntry.container?.name;
      const fynAppVersion = fynAppEntry.container?.version;
      const fynAppKey = fynAppName && fynAppVersion ? `${fynAppName}@${fynAppVersion}` : fynAppName;
      if (fynAppKey && this.fynAppRegistry.has(fynAppKey)) {
        console.debug(`\u2705 FynApp ${fynAppKey} already loaded, returning existing instance`);
        return this.fynAppRegistry.get(fynAppKey);
      }
      return null;
    }
    /**
     * Validate and normalize a main export into a FynUnit
     * - Functions are wrapped as { execute: fn }
     * - Objects with execute method pass through
     * - Invalid exports throw descriptive errors
     */
    validateFynUnit(mainExport, fynAppName) {
      if (typeof mainExport === "function") {
        return { execute: mainExport };
      }
      if (mainExport && typeof mainExport.execute === "function") {
        return mainExport;
      }
      throw new Error(
        `${fynAppName}: main export must be a function or have an execute method. Got: ${typeof mainExport}${mainExport ? ` with keys: ${Object.keys(mainExport).join(", ")}` : ""}`
      );
    }
    /**
     * Check bootstrap readiness and handle deferral if needed
     * Returns true if bootstrap should proceed, false if it should be skipped
     */
    async checkBootstrapReadiness(fynApp) {
      if (!this.bootstrapCoordinator.canBootstrap(fynApp)) {
        console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name}`);
        await this.bootstrapCoordinator.deferBootstrap(fynApp);
        console.debug(`\u25B6\uFE0F Resuming bootstrap of ${fynApp.name}`);
      }
      if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
        console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name} (bootstrap lock busy)`);
        await this.bootstrapCoordinator.deferBootstrap(fynApp);
        console.debug(`\u25B6\uFE0F Resuming bootstrap of ${fynApp.name} (retry lock acquisition)`);
        if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
          console.error(`\u23F0 ${fynApp.name} unable to acquire bootstrap lock after deferral; skipping bootstrap`);
          return false;
        }
      }
      return true;
    }
    /**
     * Run the main FynUnit. An add-on's `runUnit` hook may take it over (the
     * middleware add-on does); otherwise the kernel initializes and executes it.
     */
    async runMainUnit(fynApp, fynUnit) {
      for (const h of this.hooks.runUnit) {
        if (await h(fynApp, fynUnit)) {
          return;
        }
      }
      if (fynUnit.__middlewareMeta?.length && this.hooks.runUnit.length === 0) {
        console.warn(`\u26A0\uFE0F ${fynApp.name} declares middleware, but the middleware add-on is not installed`);
      }
      await this.loader.invokeFynUnit(fynUnit, fynApp);
    }
    /**
     * Bootstrap a fynapp
     */
    async bootstrapFynApp(fynApp) {
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "bootstrapping");
      if (!await this.checkBootstrapReadiness(fynApp)) {
        return;
      }
      captureEvent(this.tel, "bootstrap.started", __privateMethod$1(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
      try {
        for (const h of this.hooks.beforeMain) {
          await h(fynApp);
        }
        const mainExport = fynApp.exposes["./main"]?.main;
        if (mainExport) {
          console.debug("\u{1F680} Bootstrapping FynApp", fynApp.name, fynApp.version);
          await this.runMainUnit(fynApp, this.validateFynUnit(mainExport, fynApp.name));
        }
        console.debug("\u2705 FynApp bootstrapped", fynApp.name, fynApp.version);
        this.fynAppLifecycle.set(fynApp.name, fynApp.version, "mounted");
        captureEvent(this.tel, "bootstrap.completed", __privateMethod$1(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
        await __privateMethod$1(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_BOOTSTRAPPED", fynApp);
      } catch (error) {
        this.tel.capErr("bootstrap.failed", { app: fynApp.name }, error);
        this.fynAppLifecycle.set(fynApp.name, fynApp.version, "failed", error);
        console.error(`\u274C Bootstrap failed for ${fynApp.name}:`, error);
        __privateMethod$1(this, _FynMeshKernelCore_instances, appGone_fn).call(this, fynApp);
        await __privateMethod$1(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_BOOTSTRAP_FAILED", fynApp, { error });
        this.bootstrapCoordinator.releaseBootstrapLock();
      }
    }
    /**
     * Shutdown a FynApp - calls shutdown() on its FynUnits and removes from registry
     * @param name - Can be either "name" or "name@version" format
     */
    async shutdownFynApp(name) {
      const fynApp = this.fynAppRegistry.get(name);
      if (!fynApp) {
        console.debug(`\u26A0\uFE0F shutdownFynApp: FynApp "${name}" not found`);
        return false;
      }
      console.debug(`\u{1F6D1} Shutting down FynApp ${name}`);
      captureEvent(this.tel, "shutdown.started", { app: name });
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "shutdown");
      try {
        await __privateMethod$1(this, _FynMeshKernelCore_instances, callUnitHook_fn).call(this, fynApp, "shutdown");
        this.removeFromRegistry(fynApp, name);
        __privateMethod$1(this, _FynMeshKernelCore_instances, appGone_fn).call(this, fynApp);
        await __privateMethod$1(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_SHUTDOWN", fynApp);
        captureEvent(this.tel, "shutdown.completed", __privateMethod$1(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
        console.debug(`\u2705 FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
        return true;
      } catch (error) {
        this.tel.capErr("shutdown.failed", { app: name }, error);
        console.error(`\u274C Error during shutdown of ${name}:`, error);
        this.removeFromRegistry(fynApp, name);
        __privateMethod$1(this, _FynMeshKernelCore_instances, appGone_fn).call(this, fynApp);
        return false;
      }
    }
    /**
     * Suspend a mounted FynApp (only mounted -> suspended is valid).
     */
    async suspendFynApp(name) {
      return __privateMethod$1(this, _FynMeshKernelCore_instances, transitionLifecycle_fn).call(this, name, {
        from: "mounted",
        to: "suspended",
        hook: "suspend",
        event: "FYNAPP_SUSPENDED"
      });
    }
    /**
     * Resume a suspended FynApp (only suspended -> mounted is valid).
     */
    async resumeFynApp(name) {
      return __privateMethod$1(this, _FynMeshKernelCore_instances, transitionLifecycle_fn).call(this, name, {
        from: "suspended",
        to: "mounted",
        hook: "resume",
        event: "FYNAPP_RESUMED"
      });
    }
    /**
     * Remove a FynApp from the registry by all its keys
     * - the lookup name (could be name or name@version)
     * - the versioned key (name@version)
     * - the canonical name (fynApp.name)
     */
    removeFromRegistry(fynApp, name) {
      this.fynAppRegistry.remove(fynApp, name);
      this.fynAppLifecycle.remove(fynApp.name, fynApp.version);
    }
    /**
     * Get the current lifecycle state of a FynApp (mount tracking).
     */
    getFynAppState(name) {
      return this.fynAppLifecycle.find(name);
    }
    /**
     * List the lifecycle state of every tracked FynApp.
     */
    listFynAppStates() {
      return this.fynAppLifecycle.list();
    }
    /**
     * ***Debug snapshot*** -- `kernel.__I()`.
     *
     * Named after `Federation.__I()`, and a hatch for the same reason: the
     * production kernel mangles property names, and `bootstrapCoordinator` is
     * one of the five fields `build/reserved-names.mjs` deliberately leaves
     * manglable, because reaching for kernel-internal wiring from a host page is
     * unsupported. The cost of that was a reader who could not tell a bootstrap
     * queue that is *idle* from one it cannot *read* -- opposite states that
     * both render as an empty panel. This returns the queue, and only the queue:
     * everything else a tool wants off the kernel is already declared in
     * `types.ts` and therefore already survives.
     *
     * Two things keep it readable in the shipped bundle, and both are load-
     * bearing:
     *
     * - `__I` is held back by `EXTERNAL_CONTRACT` in `build/reserved-names.mjs`,
     *   pinned by `tests/debug-snapshot.test.ts`. Deliberately *not* declared on
     *   `FynMeshKernel` in `types.ts`: that would reserve it by derivation, but
     *   it would also make a debugging hatch part of the kernel's public API,
     *   and it would drag every name in the return type into the reserved list
     *   along with it.
     * - every key below is **quoted**. The kernel's terser config mangles
     *   properties by default and `keep_quoted: true` is the documented escape
     *   hatch for names no declaration describes. Unquote one and the shipped
     *   snapshot carries a one-letter key nothing can read.
     *
     * `v` is an envelope version, stamped from the first commit so a consumer
     * keys off the shape rather than guessing at it.
     *
     * Plain data throughout -- strings, arrays and object literals, no live
     * kernel objects and no functions -- so it survives `structuredClone` and
     * can cross a message boundary into a devtools panel. `holder` is `null`,
     * never absent, when nobody holds the lock: that is the kernel's own way of
     * writing "free", and it is a state, not a gap.
     */
    __I() {
      const bc = this.bootstrapCoordinator;
      return {
        "v": 1,
        "bootstrap": {
          "holder": bc.bootstrappingApp,
          "deferred": bc.deferredBootstraps.map((d) => ({
            "name": d.fynApp.name,
            "version": d.fynApp.version
          })),
          "bootstrapped": [...bc.fynAppBootstrapStatus.keys()],
          "modes": [...bc.fynAppProviderModes.entries()].map(([app, roles]) => ({
            "app": app,
            "roles": [...roles.entries()].map(([middleware, mode]) => ({
              "middleware": middleware,
              "mode": mode
            }))
          }))
        }
      };
    }
    /**
     * Protected helper to build fynapp URL
     */
    buildFynAppUrl(baseUrl, entryFile = "fynapp-entry.js") {
      return urlJoin(baseUrl, entryFile);
    }
  }
  _telSink = new WeakMap();
  _addons = new WeakMap();
  _onExpose = new WeakMap();
  _FynMeshKernelCore_instances = new WeakSet();
  /** Fresh FynUnit runtime for a FynApp. */
  runtimeFor_fn = function(fynApp) {
    return this.loader.mkRuntime(fynApp);
  };
  /** Telemetry payload identifying a FynApp. */
  appData_fn = function(fynApp) {
    return { app: fynApp.name, version: fynApp.version };
  };
  /** Let add-ons drop what they hold for an app that is gone. */
  appGone_fn = function(fynApp) {
    for (const h of this.hooks.appGone) {
      h(fynApp);
    }
  };
  callUnitHook_fn = async function(fynApp, hook) {
    for (const exposeName of Object.keys(fynApp.exposes)) {
      const fynUnit = fynApp.exposes[exposeName]?.main;
      const fn = fynUnit?.[hook];
      if (typeof fn === "function") {
        await fn.call(fynUnit, __privateMethod$1(this, _FynMeshKernelCore_instances, runtimeFor_fn).call(this, fynApp));
      }
    }
  };
  /**
   * Emit a FynApp lifecycle event. Every one of them identifies the app the
   * same way — by name and version — so only the event type and any extra
   * detail vary.
   */
  emitLifecycle_fn = function(type, fynApp, extra) {
    return this.emitAsync(
      new CustomEvent(type, {
        detail: { name: fynApp.name, version: fynApp.version, ...extra }
      })
    );
  };
  transitionLifecycle_fn = async function(name, opts) {
    const fynApp = this.fynAppRegistry.get(name);
    if (!fynApp) {
      console.debug(`\u26A0\uFE0F ${opts.hook}FynApp: FynApp "${name}" not found`);
      return false;
    }
    const state = this.fynAppLifecycle.get(fynApp.name, fynApp.version);
    if (state?.status !== opts.from) {
      console.debug(
        `\u26A0\uFE0F ${opts.hook}FynApp: "${name}" is ${state?.status ?? "untracked"}, expected ${opts.from}`
      );
      return false;
    }
    captureEvent(this.tel, `${opts.hook}.started`, __privateMethod$1(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
    try {
      await __privateMethod$1(this, _FynMeshKernelCore_instances, callUnitHook_fn).call(this, fynApp, opts.hook);
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, opts.to);
      await __privateMethod$1(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, opts.event, fynApp);
      captureEvent(this.tel, `${opts.hook}.completed`, __privateMethod$1(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
      return true;
    } catch (error) {
      this.tel.capErr(`${opts.hook}.failed`, { app: name }, error);
      console.error(`\u274C Error during ${opts.hook} of ${name}:`, error);
      return false;
    }
  };

  const PreloadPriority = {
    /** Critical: modulepreload with fetchpriority="high" */
    CRITICAL: "critical",
    /** Important: modulepreload with fetchpriority="auto" */
    IMPORTANT: "important",
    /** Deferred: prefetch (idle time only) */
    DEFERRED: "deferred"};

  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), member.set(obj, value), value);
  var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
  var _preloadStrategy, _BrowserKernel_instances, resolvePreloadStrategy_fn, _hinted, preloadTarget_fn, injectPreloadLink_fn;
  class BrowserKernel extends FynMeshKernelCore {
    constructor() {
      super(...arguments);
      __privateAdd(this, _BrowserKernel_instances);
      __privateAdd(this, _preloadStrategy, {
        depth: 1,
        // Default: requested + immediate dependencies
        priority: "static",
        priorityByDepth: {
          0: PreloadPriority.CRITICAL,
          1: PreloadPriority.IMPORTANT,
          2: PreloadPriority.DEFERRED
        },
        disabled: false
      });
      /** urls already hinted, so N members of one combined file cost one link tag */
      __privateAdd(this, _hinted, /* @__PURE__ */ new Set());
    }
    /**
     * Try to preload a URL based on current preload strategy
     * This is the public API for preload functionality
     * @param url - The URL to preload
     * @param depth - The dependency depth (0 = direct request, 1+ = transitive)
     */
    tryPreload(url, depth) {
      if (__privateGet(this, _preloadStrategy).disabled) {
        console.debug(`\u23ED\uFE0F  Preload disabled, skipping: ${url} (depth: ${depth})`);
        return;
      }
      if (depth > __privateGet(this, _preloadStrategy).depth) {
        console.debug(`\u23ED\uFE0F  Depth ${depth} > max ${__privateGet(this, _preloadStrategy).depth}, skipping: ${url}`);
        return;
      }
      __privateMethod(this, _BrowserKernel_instances, injectPreloadLink_fn).call(this, url);
    }
    /**
     * Override loadFynAppsByName to handle preload strategy
     */
    async loadFynAppsByName(requests, options) {
      const strategy = __privateMethod(this, _BrowserKernel_instances, resolvePreloadStrategy_fn).call(this, options);
      const previousStrategy = __privateGet(this, _preloadStrategy);
      __privateSet(this, _preloadStrategy, strategy);
      try {
        await super.loadFynAppsByName(requests, options);
      } finally {
        __privateSet(this, _preloadStrategy, previousStrategy);
      }
    }
    /**
     * Load a remote FynApp through Federation.js (browser-specific).
     *
     * Throws if the Federation.js runtime is absent (an environment precondition,
     * via `getFederation()` — note this check is intentionally outside the
     * try/catch below). Once Federation is available, any per-app load failure
     * (import / basics / bootstrap) is isolated and resolves to `null` rather than
     * throwing. See `FynMeshKernel.loadFynApp` for the full error contract.
     *
     * @returns the loaded FynApp after bootstrapping, or null on load failure
     */
    async loadFynApp(baseUrl, loadId) {
      const Federation = getFederation();
      try {
        loadId = loadId || baseUrl;
        captureEvent(this.tel, "fynapp.load_started", { url: baseUrl });
        const urlPath = this.buildFynAppUrl(baseUrl);
        console.debug("\u{1F680} Loading FynApp from", urlPath);
        const fynAppEntry = await Federation.import(urlPath);
        const existing = this.checkAlreadyLoaded(fynAppEntry);
        if (existing) {
          return existing;
        }
        const fynApp = await this.loadFynAppBasics(fynAppEntry);
        await this.bootstrapFynApp(fynApp);
        captureEvent(this.tel, "fynapp.loaded", { app: fynApp.name, version: fynApp.version });
        return fynApp;
      } catch (err) {
        this.tel.capErr("fynapp.load_failed", { url: baseUrl }, err);
        console.error(`Failed to load FynApp from ${baseUrl}:`, err);
        return null;
      }
    }
  }
  _preloadStrategy = new WeakMap();
  _BrowserKernel_instances = new WeakSet();
  /**
   * Resolve preload strategy from options: instance defaults, overlaid with
   * whatever the caller specified. `preload` may be a bare number, meaning depth.
   */
  resolvePreloadStrategy_fn = function(options) {
    const preload = options?.preload;
    const defaults = __privateGet(this, _preloadStrategy);
    if (!preload) {
      return defaults;
    }
    if (typeof preload === "number") {
      return { ...defaults, depth: preload };
    }
    return {
      ...defaults,
      ...Object.fromEntries(Object.entries(preload).filter(([, v]) => v !== void 0))
    };
  };
  _hinted = new WeakMap();
  /**
   * The url the runtime will actually request for a module.
   *
   * A module the build folded into a combined file is never fetched under its
   * own url — federation's `instantiate` hook pulls the file carrying it
   * instead — so hinting the module's own url wastes the hint and leaves the
   * file that is really needed to be fetched cold.
   *
   * Fails safe in every direction: no Federation yet, a Federation without the
   * lookup, or a throw all mean "hint what you were given". A preload is an
   * optimization, and must never be the thing that breaks a load.
   */
  preloadTarget_fn = function(url) {
    try {
      return globalThis.Federation?.bundleUrlFor?.(url) || url;
    } catch {
      return url;
    }
  };
  /**
   * Inject a preload link tag into the document head
   * @private
   */
  injectPreloadLink_fn = function(url) {
    if (typeof document === "undefined" || !document.head) {
      return;
    }
    const target = __privateMethod(this, _BrowserKernel_instances, preloadTarget_fn).call(this, url);
    if (target !== url) {
      console.debug(`\u{1F4E6} Preloading ${target}, the file carrying ${url}`);
    }
    if (__privateGet(this, _hinted).has(target)) {
      return;
    }
    __privateGet(this, _hinted).add(target);
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = target;
    link.as = "script";
    document.head.appendChild(link);
  };
  function createBrowserKernel() {
    const kernel = new BrowserKernel();
    kernel.initRunTime({
      apps: {},
      middlewares: {}
    });
    kernel.setRegistryResolver(async (name, range) => {
      return {
        name,
        version: "0.0.0",
        // version not critical for demo resolver; keying by name is fine
        url: `/${name}/dist/fynapp.manifest.json`,
        distBase: `/${name}/dist/`
      };
    });
    kernel.setPreloadCallback((url, depth) => {
      kernel.tryPreload(url, depth);
    });
    return kernel;
  }

  globalThis.fynMeshKernel = createBrowserKernel();

})();
