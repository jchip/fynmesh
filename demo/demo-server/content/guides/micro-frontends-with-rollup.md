---
title: Build Micro Frontends with Rollup
description: Build each micro frontend with Rollup and rollup-plugin-federation, then load it by name with the FynMesh kernel. Works for React, Vue, Preact, Solid, Svelte and Marko.
pageName: Micro Frontends with Rollup
---

FynMesh builds each micro frontend with Rollup. We call one a FynApp. The `rollup-plugin-federation` plugin turns a Rollup build into a federated container, and the FynMesh kernel loads that container in the browser by name.

You do not need webpack. A FynApp is a normal Rollup project with one extra plugin and one exported object.

## What you build

A FynApp has three parts.

- `rollup.config.ts` names the app, lists what it exposes and what it shares.
- `src/main.ts` exports `main`, the entry the kernel runs.
- `dist/` holds the build: `fynapp-entry.js` and `fynapp.manifest.json`.

Each FynApp is built and deployed on its own. The host page only needs the kernel and the app's name.

## Scaffold a FynApp

Install the CLI with fyn, then create an app.

```bash
fyn global add create-fynapp
create-fynapp --name my-app --framework react
```

The `--framework` flag accepts `react`, `react18`, `preact`, `vue`, `solid`, `svelte`, `marko` and `vanilla`. These eight have full templates. Any other name gets a generic skeleton that builds as is and comes with an `AGENT-TODO.md` checklist.

The command writes `package.json`, `tsconfig.json`, `rollup.config.ts` and starter sources. Use `--skip-install` if you want the files without the install step.

## The Rollup config

Most apps use the `createFynAppRollupConfig` factory from `create-fynapp`.

```ts
import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "example-vanilla",
  framework: "vanilla",
  typescript: true,
  exposes: {
    "./main": "./src/main.ts",
  },
});
```

For `framework: "react"` the factory adds the `./main` expose for you. Every other framework must list it. The factory emits SystemJS output into `dist/` and assembles the Rollup plugins in a fixed order, with the federation plugin among them.

Under the hood this calls `rollup-plugin-federation`. Its main options are:

- `name`: the container name. Required.
- `filename`: the container entry file. It must also appear in Rollup's `input`.
- `exposes`: modules other apps can load, as `{ "./main": "./src/main.ts" }`.
- `shared`: modules shared at runtime, each with `singleton` and a `semver` range.

The Vue demo app shows the lower-level form. It exposes `./main` and shares `vue` as a singleton.

```ts
...setupFederationPlugins({
  name: "fynapp-4-vue",
  exposes: {
    "./main": "./src/main.js",
  },
  shared: {
    vue: {
      singleton: true,
      semver: "^3.3.4",
    },
  },
}),
```

See the [rollup-plugin-federation docs](/docs/rollup-plugin-federation) for every option.

## Build it

Inside a FynApp, run Rollup through the `cfa` command or the package script.

```bash
cfa build
cfa build --watch
cfa check
```

`cfa check` builds the app and confirms that `dist/fynapp-entry.js` and a valid `dist/fynapp.manifest.json` exist. The manifest lists the app's name, exposes and shared modules. The same manifest is embedded in `fynapp-entry.js`, so the kernel reads it without an extra request.

Build order matters when apps depend on each other. An app that consumes a shared module reads its provider's manifest from disk at build time. Build the provider first.

## Write the FynUnit

`src/main.ts` exports `main`. This object is a FynUnit. Only `execute` is required. `initialize` is optional and runs first.

```ts
import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

class VanillaUnit implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready", mode: "standalone" };
  }

  execute(runtime: FynUnitRuntime) {
    const target = document.createElement("div");
    target.textContent = `Hello from ${runtime.fynApp.name}`;
    document.body.appendChild(target);
  }
}

export const main = useMiddleware([], new VanillaUnit());
```

`main` can also be a plain object with `execute`, or a bare function. The kernel wraps a function as `{ execute: fn }`. The [FynApp contract](/docs/fynapp-contract) lists the other lifecycle methods: `shutdown`, `suspend` and `resume`.

## Load it in a host page

The host page loads three scripts: SystemJS, `federation-js` and the browser kernel. The kernel then loads apps by name.

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

The kernel resolves each name through a registry resolver. The demo maps a name to `/<name>/dist/fynapp.manifest.json`. You set your own mapping with `fynMeshKernel.setRegistryResolver(async (name, range) => ({ name, version, url, distBase }))`.

`loadFynAppsByName` reads the manifests, builds a dependency graph, and loads apps in dependency order. Independent apps load in parallel, four at a time by default. A failed app does not stop the others.

## React, Vue, Preact, Solid, Svelte and Marko

The Rollup setup is the same for every framework. Only the framework plugin and the shared package change.

- React: `createFynAppRollupConfig` with `framework: "react"`. React, React DOM and `react-dom/client` are shared singletons.
- Vue: `vue` shared with `^3.3.4`.
- Preact: `fynapp-5-preact` shares Preact as a singleton.
- Solid: `solid-js` shared with `^1.9.15`.
- Svelte: `fynapp-8-svelte` shares Svelte as a singleton.
- Marko: `fynapp-3-marko` shares Marko as a singleton.

The [live demo](/demo) loads all six on one page. Each app is built and loaded on its own. The source for each is under `demo/` in the repository.

## Why Rollup

Production builds run through terser and emit no sourcemaps by default. Many small chunks can be folded into fewer files with `federation-combine`, a post-build step in `rollup-plugin-federation`. The federation output format here is SystemJS, which `federation-js` loads at runtime.

## Try it

- Open the [live demo](/demo) to see six frameworks on one page.
- Try the [shell demo](/shell) to see apps composed through middleware.
- Read [Getting Started](/docs/getting-started) for the full scaffolder reference.
- Learn how loading works in the [kernel docs](/docs/kernel).
- See how federation works without webpack in [Module Federation Without Webpack](/guides/module-federation-without-webpack).
- Run two versions of one library in [Run Multiple React Versions on One Page](/guides/run-multiple-react-versions).
