---
title: Why FynMesh
description: Why pick FynMesh for micro frontends: apps join a page without wiring, ask for other apps by version range, cooperate through the kernel, and show up in an inspector.
pageName: Why FynMesh
---

FynMesh is an open source micro frontend framework built on Module Federation and Rollup. A team picks it when several apps, built and deployed separately, have to live on one page and cooperate. This page lists what FynMesh does differently and where it does not fit.

## Apps join the page without wiring

When a FynApp loads, it joins the page's shared scope. The scope is one named scope, called `fynmesh`, and loading plus initializing the app is the whole act of joining. No app passes a scope to another app.

Nobody keeps a list of who shares with whom. If app A and app B both ship React and both ask for a compatible range, the loader hands both the same copy. Add a third app and nothing in A or B changes.

This matters most when different teams release on different days. A team ships its app and the page picks it up. There is no host config to edit and no remote map to keep in sync.

## Apps ask for apps by version range

Most tools let a package ask for a library as `react@^19`. FynMesh lets a page ask for an app the same way: `fynapp-x1@^2`. The host supplies a registry resolver that maps a name and a range to a manifest URL.

The consumer states the range once. The host decides which deployment satisfies it, and it can change that decision without rebuilding any consumer.

A side effect is that releases of one app can share a name on the same page. One consumer can ask for `^1.0.0` while another asks for `^2.0.0`, and each gets a matching release. Teams can move consumers over one at a time. The guide [Upgrade React incrementally](/guides/upgrade-react-incrementally) shows a case of this.

You do need a real resolver for this. The default resolver that ships with the kernel maps a name to `/<name>/dist/fynapp.manifest.json` and does not look at the range. See [How FynMesh works](/how-it-works) for the host code.

## Apps that cooperate

It reads each app's manifest and builds a dependency graph. Apps boot in dependency order, so a provider is ready before its consumers run. The kernel also detects cycles in the graph.

Every app follows the FynUnit lifecycle. An app can implement `initialize`, `execute`, `suspend`, `resume` and `shutdown`. The kernel calls `suspendFynApp`, `resumeFynApp` and `shutdownFynApp` and tracks each app's state. A failed bootstrap is isolated, so siblings keep running.

Middleware handles concerns that cross apps, such as a shared theme or a page layout. One FynApp provides a middleware and others declare it with `useMiddleware`. A middleware can also take over how an app executes, which is how the [shell demo](/shell) builds its layout.

FynBus handles messaging. Apps publish and subscribe, and they can send a request that waits for a handler that has not loaded yet. The platform stamps the sender of each message, and an app's subscriptions are dropped when it shuts down.

Middleware and FynBus are add-on bundles. A page that does not need them can load the core kernel alone.

## Frameworks mix without a bridge

Each FynApp is a plain federated container. The kernel runs its `main` export and does not care what renders the UI. The demo runs React 18, React 19, Vue, Preact, Solid, Svelte and Marko on the same loader.

There is no per-framework bridge package and no adapter to install when you add a framework. The scaffolding tool, `create-fynapp`, has templates for eight frameworks and accepts any other name.

## You can see what happened

The Federation Inspector is an in-page panel. It shows each shared module, who supplied it and which ranges asked for it. It reads the loader's state directly, so the apps need no instrumentation.

It also lists named issues, such as a range that nothing satisfies or a singleton loaded in several copies. When a page picks an unexpected React version, you can see why. Under the panel, `Federation.__I()` returns the same data to your own code. Details are in the [Federation Inspector docs](/docs/federation-inspector).

## Built on Rollup

You build each FynApp with Rollup and `rollup-plugin-federation`. The plugin emits the container entry and embeds the app's manifest in it. The kernel reads that manifest without an extra request. FynMesh does not need webpack. The guide [Micro frontends with Rollup](/guides/micro-frontends-with-rollup) walks through a build.

## When FynMesh may not fit

Be aware of these limits today.

- There is no server-side rendering integration. FynApps render in the browser. The kernel has a Node stub that does not run federation.
- There is no federated TypeScript types feature. A consumer declares each provider with one `declare module` line, which types its imports as `any`, or writes precise declarations by hand.
- Routing is not part of the kernel. A shell app owns routing.
- The Federation Inspector is an in-page panel. There is no browser extension.

If your pages must render on the server, or you need typed contracts across apps with no hand-written declarations, weigh those limits first.

## Where to go next

- [Features](/features) shows each capability with a diagram.
- [Live demos](/demos) lists the demo pages.
- [Getting started](/docs/getting-started) creates your first FynApp.
- [FAQ](/faq) answers common questions.
