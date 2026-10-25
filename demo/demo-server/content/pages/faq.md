---
title: FynMesh FAQ
description: Answers about FynMesh: what a FynApp is, how React versions and shared dependencies resolve, how apps talk, how to debug a page, and what is not supported yet.
pageName: FAQ
---

FynMesh is an open source micro frontend framework built on Module Federation and Rollup. These answers cover what it is, how versions and sharing work, how to build an app and how to debug a page. Each answer links to a longer page when there is one.

## Basics

### What is FynMesh?

FynMesh is an open source micro frontend framework built on Module Federation and Rollup. It lets you build one page from several apps that are built and deployed on their own.

It provides a build plugin, a loader that shares dependencies by semver range, and a kernel that boots apps in dependency order. See [Why FynMesh](/why-fynmesh) and [How FynMesh works](/how-it-works).

### What is a FynApp?

A FynApp is one independently built and deployed app. It is a Rollup project that produces a federated container and a manifest.

Its `main` export is a FynUnit, which the kernel runs. The [FynApp contract](/docs/fynapp-contract) describes what the kernel expects.

### Does FynMesh need webpack?

No. FynMesh builds with Rollup and `rollup-plugin-federation`, and the runtime loads SystemJS modules. The guide [Module Federation without webpack](/guides/module-federation-without-webpack) shows the setup.

### Which frameworks work?

React 18 and 19, Vue, Preact, Solid, Svelte and Marko all run in the demo. Each app is a plain federated container, so no bridge or adapter is needed.

`create-fynapp` has templates for eight frameworks: `react`, `react18`, `preact`, `vue`, `solid`, `svelte`, `marko` and `vanilla`. Any other name gets a generic skeleton that builds as is.

### Is FynMesh free and open source?

Yes. The code is on GitHub under the Apache-2.0 license, and the packages are on npm. You can use, modify and ship it under the terms of that license.

### Do I need a shell app?

No. The kernel can load FynApps on any page. A shell is one pattern, built with middleware, and the [shell demo](/shell) shows it.

### Does FynMesh handle routing?

No. The kernel has no routing. A shell app owns routing, if you need it. The [shell demo](/shell) shows a layout built that way.

## Versions and sharing

### Can two React versions run on one page?

Yes. An app that asks for `^18.0.0` gets React 18, and an app that asks for `^19.0.0` gets React 19. The loader keeps each loaded version as a separate provider.

The [live demo](/demo) runs both. The guide [Run multiple React versions](/guides/run-multiple-react-versions) explains the setup.

### How are shared dependencies resolved?

Each app declares what it shares and the semver range it accepts. At runtime the loader picks a loaded version that satisfies the ranges that apply to the import and reuses it.

If no loaded version fits, the app loads its own copy. The guide [Share dependencies with semver](/guides/share-dependencies-semver) goes through examples.

### What does singleton do?

`singleton: true` asks for one instance of a module across all containers. Use it for libraries that break when two copies exist.

When the ranges conflict, `federation-js` warns instead of throwing. The Federation Inspector reports a singleton that loaded in several copies.

### Does every app have to use the same version of a shared library?

No. Each app lists a semver range. Apps whose ranges agree share one copy, and a range that needs a different major gets its own.

### Can two versions of the same app run together?

Yes. A page can ask for `fynapp-x1@^1.0.0` and `fynapp-x1@^2.0.0`, and each request gets a matching release. The resolver must return a distinct `version` for each one.

This needs a registry resolver that reads the range. The default resolver that comes with the kernel ignores it. See the host code in [How FynMesh works](/how-it-works), and the guide [Upgrade React incrementally](/guides/upgrade-react-incrementally).

### Do apps need to know about each other to share?

No. An app joins the shared scope, named `fynmesh`, when it loads. Nobody keeps a list of who shares with whom.

An app that imports a module from another app, such as a middleware, does name that app. The kernel uses that to load the provider first.

## Building FynApps

### How do I start a new FynApp?

Install the scaffolding tool with `fyn global add create-fynapp`, then run `create-fynapp --name my-app --framework react`. It creates `package.json`, `tsconfig.json`, `rollup.config.ts` and starter source files.

The [getting started guide](/docs/getting-started) covers the rest.

### What does a build produce?

A build produces `fynapp-entry.js` and `fynapp.manifest.json` in `dist/`. The manifest is also embedded in the entry file.

The kernel reads the embedded copy first, because it has to fetch the entry anyway. The JSON file is a fallback.

### How do apps talk to each other?

Through middleware APIs and FynBus. FynBus lets apps publish and subscribe to events and send requests to handlers. The platform stamps the sender of each message.

A request waits for a handler that has not loaded yet. An app's subscriptions are dropped when it shuts down.

### What is middleware?

Middleware is code that one FynApp provides and other apps use. It handles cross-app concerns such as a shared theme or a page layout.

A consumer declares it with `useMiddleware`. The kernel runs the middleware's `setup` and `apply` steps before the app's `execute`, and `apply` puts an API into `runtime.middlewareContext`. A middleware can also take over how an app executes, which the shell demo uses for its layout.

### Can I use FynMesh without the middleware or the bus?

Yes. Both are add-on bundles. Load `fynmesh-kernel-core` alone and a unit runs as plain `initialize` then `execute`.

A unit that declares middleware gets a console warning when the middleware add-on is missing. The [kernel docs](/docs/kernel) list the bundles.

### Does FynMesh share TypeScript types across apps?

No. There is no federated type generation today. A consuming app types its remote imports with one `declare module "fynapp-design-tokens/*";` line per provider, which gives them the type `any`.

You can write precise declarations by hand, or share a contract package between teams. The kernel exports its own types from `@fynmesh/kernel`, including `FynUnit` and `FynUnitRuntime`.

## Running and debugging

### How do I see which version an app got?

Call `Federation.__I()` in the console or open the in-page Federation Inspector. Both list each shared module, its providers and the ranges that asked for it.

For FynApps, `kernel.listFynAppStates()` returns the name, version and status of each. The [inspector docs](/docs/federation-inspector) describe the panels.

### What happens when a FynApp fails to load?

The rest of the batch carries on. `loadFynAppsByName` does not abort when one app fails, and the kernel emits `FYNAPP_LOADED` with `detail.ok` set to false.

A failure while running an app emits `FYNAPP_BOOTSTRAP_FAILED` and leaves the other apps running. An app that waits for a dependency that never arrives emits `FYNAPP_BOOTSTRAP_TIMEOUT` after 30 seconds. The dev-overlay add-on shows bootstrap failures on the page in development.

### Does FynMesh support server-side rendering?

No. There is no server-side rendering integration today. FynApps render in the browser.

If you need server rendering, plan for that before you pick FynMesh. The kernel has a Node stub, but it does not run federation, so it is not a path to server rendering.
