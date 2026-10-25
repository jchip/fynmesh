---
title: Module Federation Without Webpack
description: FynMesh brings Module Federation to Rollup with rollup-plugin-federation and a SystemJS based runtime, so you can share code between apps without webpack.
pageName: Module Federation Without Webpack
---

FynMesh provides Module Federation for Rollup builds. The `rollup-plugin-federation` plugin builds the containers, and the `federation-js` runtime wires them together in the browser. It is based on SystemJS, so you do not need webpack.

On top of that, the FynMesh kernel loads apps by name and version, boots them in dependency order, and can run several versions of the same app on one page.

## The pieces

There are four pieces. Each has one job.

- Build plugin: `rollup-plugin-federation` generates a container for your build.
- Container entry: the file the plugin emits. It lists what the build exposes and shares.
- Runtime: `federation-js` loads containers and resolves shared modules in the browser.
- Share scope: a named namespace where containers register what they share.

The build and the runtime are separate packages. Build output does not need the build tool at runtime.

## The build plugin

Add the plugin to a Rollup config. `filename` names the container entry, and it must also be listed in `input`.

```js
import federation from "rollup-plugin-federation";

export default {
  input: ["src/index.js", "federation-entry.js"],
  output: { dir: "dist", format: "esm" },
  plugins: [
    federation({
      name: "plugin_1",
      filename: "federation-entry.js",
      exposes: {
        "./bootstrap": "./src/bootstrap.js",
      },
      shared: {
        react: { singleton: true, semver: "^19.0.0" },
      },
    }),
  ],
};
```

The plugin collects shared modules and their importers. It emits the container code and a `federation.json` file that records exposes, chunks and share config. The runtime does not need `federation.json`, because the entry file carries the container.

Each `shared` entry takes a semver range and a few flags: `singleton`, `eager` and `import`. A dependency used only through another package still needs a `shared` entry with its range. Otherwise a mismatch shows up at runtime as a duplicate instance, not as a build error.

When a build has many small exposes, `federation-combine` folds the small chunks into fewer files after the build.

## The runtime

`federation-js` expects a `System` global. It must be the SystemJS fork that ships in the same package, not stock SystemJS. Load the loader first, then the runtime.

```html
<script src="/node_modules/federation-js/dist/system.min.js"></script>
<script src="/node_modules/federation-js/dist/federation-js.min.js"></script>
```

Importing the runtime installs a global `Federation` object. You can load a container and ask it for an exposed module.

```js
Federation.import("__mf_container_plugin_1")
  .then((container) => container.get("./bootstrap"))
  .then((getModule) => console.log("module", getModule()));
```

A shared module is fetched the same way, by the name it was shared under.

```js
Federation.import("__mf_container_plugin_1")
  .then((container) => container.get("react"));
```

## Output format

The plugin example above uses ESM output to stay short. FynApps built with `create-fynapp` emit SystemJS output instead, because `federation-js` registers modules through the SystemJS loader. The `createFynAppRollupConfig` factory sets this for you, along with the share scope name `fynmesh`.

## How a container is loaded

A container is a script. When it runs, it registers its name, its version, its exposes and its shared modules with the runtime. Asking for an expose runs the module's code once, on first import.

Several modules can also ship in one physical file. Each still registers under its own name, so importing it looks the same. The runtime fetches the file once, however many members ask for it.

## How sharing works at runtime

Each container declares the semver range it accepts for every shared module. The runtime looks at the versions already loaded in the share scope and picks one that satisfies the range. If nothing matches, the container loads its own copy.

A container that only consumes a shared module can still resolve it, as long as a container that shares it has already loaded. Singletons keep one instance across containers.

`Federation.__I()` returns a snapshot of what the runtime decided for each share key. It is the main tool for debugging a minified page. The [federation inspector](/docs/federation-inspector) reads this kind of information for you.

## What FynMesh adds on top

The plugin and runtime are the Module Federation layer. The kernel is the layer above it.

- Load by name and semver. `fynMeshKernel.loadFynAppsByName([{ name: "fynapp-x1", range: "^2.0.0" }])` resolves the name through a registry resolver you provide.
- Dependency ordered boot. The kernel reads each app's manifest, builds a graph from `requires`, `import-exposed` and `shared-providers`, and loads providers before their consumers.
- Middleware. An app can use middleware published by another app, such as a shared layout or design tokens.
- Several versions of the same app. The demo ships `fynapp-react-lib` as both a React 18 and a React 19 app. It also ships `fynapp-x1` in two versions. The kernel keeps them apart and gives each consumer the one its range asks for.
- Error isolation. A failed app emits an event and does not crash the others.

Here is a host page that loads two apps by name.

```html
<script src="/system.min.js"></script>
<script src="/federation-js/dist/federation-js.min.js"></script>
<script src="/kernel/dist/fynmesh-browser-kernel.min.js"></script>
<script>
  fynMeshKernel.loadFynAppsByName([
    { name: "fynapp-1" },
    { name: "fynapp-4-vue" },
  ]);
</script>
```

## Compared with webpack

Webpack ships its own Module Federation plugin and its own runtime, tied to the webpack build. FynMesh keeps the same idea but moves it to Rollup. The runtime is `federation-js` on a SystemJS style registry, not the webpack runtime. Pick based on the bundler your apps already use.

## Try it

- Watch the [live demo](/demo) load six frameworks on one page.
- Read the [rollup-plugin-federation docs](/docs/rollup-plugin-federation) for all plugin options.
- Read the [federation-js docs](/docs/federation-js) for the runtime.
- Read the [kernel docs](/docs/kernel) for loading, middleware and lifecycle.
- Follow [Build Micro Frontends with Rollup](/guides/micro-frontends-with-rollup) to build your first app.
- See [Share Dependencies with Semver](/guides/share-dependencies-semver) for share rules in depth.
- See [Run Multiple React Versions on One Page](/guides/run-multiple-react-versions) for the multi-version case.
