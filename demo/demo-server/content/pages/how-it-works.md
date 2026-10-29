---
title: How FynMesh Works
description: A walk through FynMesh from build to runtime: Rollup build, registry resolver, dependency-ordered boot, semver shared modules, lifecycle, middleware, FynBus.
pageName: How it works
---

FynMesh is an open source micro frontend framework built on Module Federation and Rollup. Each app is built on its own into a federated container. A small kernel in the browser finds those containers by name and version range, loads them in dependency order and runs them.

The sections below follow one app from build to runtime.

## 1. Build

A FynApp is a normal Rollup project with one extra plugin, `rollup-plugin-federation`. You give the plugin a `name`, the modules the app `exposes` and the modules it lists under `shared`.

```js
federation({
  name: "fynapp-1",
  filename: "fynapp-entry.js",
  exposes: { "./main": "./src/main.ts" },
  shared: { react: { singleton: true, semver: "^19.0.0" } },
});
```

The plugin generates a container entry. It collects the shared modules and who imports them, then writes metadata about what the build exposes and shares. The output is ES module code in the SystemJS register format. See the [rollup-plugin-federation docs](/docs/rollup-plugin-federation).

The build also emits a manifest. It is written twice with the same content: embedded in `fynapp-entry.js` as `__FYNAPP_MANIFEST__`, and as `dist/fynapp.manifest.json`. The kernel has to fetch the entry anyway, so reading the embedded copy costs no extra request. The JSON file is a fallback.

The manifest lists the app's name and version, its exposes, what it provides and consumes as shared, and which other apps it imports from.

## 2. The registry resolver

The host page loads the kernel as a script and gets a global, `fynMeshKernel`. There is no class to construct. The host then sets a registry resolver. The resolver takes an app name and an optional semver range and returns the manifest URL.

```ts
const kernel = globalThis.fynMeshKernel;

kernel.setRegistryResolver(async (name, range) => ({
  name,
  version: range ?? "latest",
  url: `https://cdn.example.com/${name}/dist/fynapp.manifest.json`,
  distBase: `https://cdn.example.com/${name}/dist/`,
}));

await kernel.loadFynAppsByName(
  [
    { name: "fynapp-1" },
    { name: "fynapp-x1", range: "^1.0.0" },
    { name: "fynapp-x1", range: "^2.0.0" },
  ],
  { concurrency: 4, preload: 1 },
);
```

This host asks for two ranges of `fynapp-x1`. The resolver returns a distinct `version` for each, which keys the dependency graph. A real resolver would query a registry. The kernel ships a demo resolver that ignores the range.

`loadFynAppsByName` rejects if the batch cannot be planned, for example when no resolver is set. One app that fails to load does not abort the batch.

## 3. Dependency graph and boot order

The kernel reads each manifest and builds a graph. Edges come from the manifest fields `requires`, `import-exposed` and `shared-providers`. It detects cycles, then loads apps in topological batches. `concurrency` caps how many load at once, and `preload` sets how deep to preload dependencies.

An app that needs a middleware or a shared module from another app waits until that provider is ready. If a provider never arrives, the wait ends after 30 seconds with a `FYNAPP_BOOTSTRAP_TIMEOUT` event.

## 4. Shared modules and semver ranges

All containers on the page join one named share scope, `fynmesh`. Loading and initializing a container registers what it provides. No container passes a scope to another one.

Each importer declares the range it accepts. When an app imports `react`, the runtime, `federation-js`, looks for a loaded version that satisfies every range that applies. If one fits, the app reuses it. If none fits, the app loads its own copy.

`singleton: true` asks for one instance across all containers. When the constraints conflict, `federation-js` warns instead of throwing.

This is how React 18 and React 19 coexist. An app asking for `^18.0.0` and an app asking for `^19.0.0` each get a matching copy. Read [Share dependencies with semver](/guides/share-dependencies-semver) and the [federation-js docs](/docs/federation-js) for more.

## 5. The FynUnit lifecycle

An app's `main` export is a FynUnit. It can be a plain function, an object with `execute`, or a class instance with `initialize` and `execute`. The kernel validates the shape and throws if there is no `execute`.

```ts
import { useMiddleware, type FynUnit, type FynUnitRuntime } from "@fynmesh/kernel";

const unit: FynUnit = {
  initialize(runtime: FynUnitRuntime) {
    return { status: "ready" };
  },
  execute(runtime: FynUnitRuntime) {
    const tokens = runtime.middlewareContext.get("design-tokens");
    console.log(`${runtime.fynApp.name} theme:`, tokens?.theme);
  },
  shutdown(runtime: FynUnitRuntime) {
    console.log(`${runtime.fynApp.name} shutting down`);
  },
};

export const main = useMiddleware(
  {
    mw: import("fynapp-design-tokens/middleware/design-tokens/design-tokens", {
      with: { type: "fynapp-middleware" },
    }),
    config: { theme: "fynmesh-default", cssCustomProperties: true },
  },
  unit,
);
```

The kernel calls `initialize`, then `execute`, then signals `FYNAPP_BOOTSTRAPPED`. A mounted app can also implement `suspend`, `resume` and `shutdown`. The kernel calls them from `suspendFynApp`, `resumeFynApp` and `shutdownFynApp`.

Each app has a state you can read with `getFynAppState` or `listFynAppStates`. A failure in one app emits `FYNAPP_BOOTSTRAP_FAILED` and does not stop the others.

## 6. Middleware

Middleware covers concerns that cross apps. A provider is a FynApp that exposes a `./middleware*` module and exports objects whose names start with `__middleware__`. A consumer declares what it needs with `useMiddleware`, as in the sample above.

For each middleware the kernel runs `setup`, then `apply`. `apply` puts an API into `runtime.middlewareContext`. A middleware marked for auto-apply can also override how a unit executes. The first one that says yes wins.

The build turns the `import()` in a declaration into an id string, so the middleware is resolved through the same manifest and graph as everything else.

## 7. FynBus

FynBus is the messaging layer. Apps emit and subscribe to events, and they can send a request to a handler. The platform stamps the sender of each message. A request waits for a handler that has not loaded yet. An app's subscriptions are cleaned up when the app shuts down.

An app reaches the bus as `runtime.bus`, and the host reaches it as `kernel.bus`.

## 8. Kernel add-ons

The core kernel resolves manifests, builds the graph, loads, bootstraps and manages lifecycle and events. Everything else is an add-on bundle.

- The middleware add-on holds the middleware registry, auto-apply and overrides.
- The bus add-on provides FynBus.
- The telemetry add-on adds `kernel.setTelemetry`.
- The dev-overlay add-on shows bootstrap failures on the page, in development only.
- The AMD add-on serves federated modules to legacy RequireJS bundles under the ids they already ask for. It is a working prototype, shown in the [legacy RequireJS demo](/legacy-amd) and the [guide](/guides/legacy-requirejs-on-module-federation).

Load core first, then any add-ons. Each add-on installs itself into `fynMeshKernel` and throws if core is missing. Without the middleware add-on, a unit runs as plain `initialize` then `execute`, and a unit that declares middleware gets a console warning. The README for the [kernel](/docs/kernel) lists the bundle files, and the [kernel API](/api/) covers the types.

## 9. Inspection

`Federation.__I()` returns a snapshot of shared-module resolution. For each chunk and share key it shows the ranges the importers declared, the ranges resolution applied and the versions available. The Federation Inspector draws this in a panel on the page, with modules, graph, shares, issues, middleware and FynApps views. See the [inspector docs](/docs/federation-inspector).

## Next steps

Follow [Getting started](/docs/getting-started) to build a first app. The [FynApp contract](/docs/fynapp-contract) describes what the kernel expects from one. The [live demo](/demo) shows the pieces running together.
