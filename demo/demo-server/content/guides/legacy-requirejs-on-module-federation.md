---
title: Serve Shared Libraries to Legacy RequireJS Bundles from Module Federation
description: Legacy webpack AMD micro frontends loaded by RequireJS can get React and other shared libraries from Module Federation with no rebuild, and move to a new React major in stages.
pageName: Legacy RequireJS Bundles
---

Before Module Federation, many micro frontends were built on RequireJS. Each widget is an AMD bundle. Shared libraries are built into a common web package (CWP), and widgets consume it through webpack externals. FynMesh can serve the CWP's libraries to those widgets from federation, under the ids they already ask for, with no rebuild. A codebase can then move to federation progressively.

This guide explains the setup, what changes, and what you get. The working code is in the [live demo](/legacy-amd).

## The legacy setup

In a RequireJS micro frontend, each widget is built with webpack as an AMD bundle. A platform team builds the shared libraries, like React and the UI kit, into a common web package (CWP). Widgets list those libraries as webpack externals. In the built file, each external becomes a RequireJS dependency that the CWP provides:

```js
define(["react", "react-dom", "ui-kit"], function (React, ReactDOM, UIKit) { ... });
```

## The problem

A large enterprise builds up many widgets from many teams over time, and they all depend on the same CWP. Updating a library version or adding a variant means every team must move together. At that scale it is near impossible.

Module Federation solves version sharing, but legacy AMD widgets cannot use it. A large codebase also cannot migrate all its widgets in one shot. It needs a way to introduce federation progressively. The bridge below gives it one: legacy widgets and FynApps run on the same page, and the codebase moves over one piece at a time.

## What changes

Two pieces connect the legacy bundles to federation:

- **The CWP becomes a FynApp.** It installs the same libraries at the same pinned versions. It shares them through federation, and it publishes which RequireJS ids it serves.
- **A kernel add-on routes RequireJS to it.** When a bundle asks for `react` or `ui-kit`, the add-on loads it from the CWP FynApp. Every other id, such as the bundles themselves, loads through RequireJS as before.

The legacy bundles and the page's RequireJS setup stay as they are. The add-on and the CWP's id list are added to the page before the first `require()`.

## What you get

- **No rebuild.** The same bundle files run on the federated libraries.
- **Upgrades in stages.** Each RequireJS context chooses the legacy CWP or the federated one. One group of widgets can move to a CWP release with React 19 while another stays on the legacy CWP with React 18.
- **One React for old and new apps.** New FynApps on the same page share the CWP's React when their version range matches. A FynApp that needs another major loads its own.
- **On-demand loading.** A bundle loaded later reuses the libraries its context already has.

## Moving to a new React major

1. Release a CWP FynApp that pins the libraries the legacy CWP had. Point one RequireJS context at it and check that its widgets behave the same.
2. Move the other contexts over one at a time. A context you have not moved stays on the legacy CWP.
3. Release a CWP with the new React major, and point the federated contexts at it. The widgets are not rebuilt.
4. Retire the legacy CWP once no context uses it.

React 19 removed `ReactDOM.render`, `findDOMNode`, string refs and `propTypes`. A legacy widget that uses them needs a code change before it can run on React 19. Widgets that use `createRoot` run on both majors.

## Limits

- A page runs one federated CWP release. Every federated context on the page uses it. Other contexts stay on the legacy CWP.
- The CWP's id list must load before the first `require()`.
- The AMD add-on is a working prototype in the FynMesh repo, in `demo-legacy-amd/`. It is not a published package yet.

## Try it

- Open the [legacy RequireJS demo](/legacy-amd). Put each set of widgets on the legacy or the federated CWP, with React 18 or React 19.
- Read [Upgrade React one micro frontend at a time](/guides/upgrade-react-incrementally) for the same plan with FynApps.
- Read [how kernel add-ons work](/how-it-works#8-kernel-add-ons).
