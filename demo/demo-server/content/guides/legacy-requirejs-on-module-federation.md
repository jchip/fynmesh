---
title: Serve Shared Libraries to Legacy RequireJS Bundles from Module Federation
description: Legacy webpack AMD micro frontends loaded by RequireJS can get React and other shared libraries from Module Federation with no rebuild, and move to a new React major in stages.
pageName: Legacy RequireJS Bundles
---

Many micro frontends were built with webpack before Module Federation existed. Each one is an AMD bundle that RequireJS loads. FynMesh can serve federated modules to those bundles as RequireJS modules, under the ids they already ask for. The bundles are not rebuilt. They get React and the UI kit from federation, and they can move to a new React major in stages.

This guide explains the setup, what changes, and what you get. The working code is in the [live demo](/legacy-amd).

## The legacy setup

A legacy bundle lists its shared libraries as webpack externals. In the built file, each external becomes a RequireJS dependency:

```js
define(["react", "react-dom", "ui-kit"], function (React, ReactDOM, UIKit) { ... });
```

A platform team ships those libraries in one common bundle, often called the common web package (CWP). The page loads one CWP, so every bundle on it runs on the same React. A React major upgrade means updating, rebuilding and releasing every team's bundle at once.

Module Federation handles version sharing for new apps, but it does not load AMD bundles.

## What changes

Two pieces connect the legacy bundles to federation:

- **The CWP becomes a FynApp.** It installs the same libraries at the same pinned versions. It shares them through federation, and it publishes which RequireJS ids it serves.
- **A kernel add-on routes RequireJS to it.** When a bundle asks for `react` or `ui-kit`, the add-on loads it from the CWP FynApp. Every other id, such as the bundles themselves, loads through RequireJS as before.

The legacy bundles and the page's RequireJS setup stay as they are. The add-on and the CWP's id list are added to the page before the first `require()`.

## What you get

- **No rebuild.** The same bundle files run on the federated libraries.
- **Upgrades in stages.** Each RequireJS context chooses the old common bundle or the federated CWP. One group of widgets can move to a CWP release with React 19 while another stays on the old React 18 bundle.
- **One React for old and new apps.** New FynApps on the same page share the CWP's React when their version range matches. A FynApp that needs another major loads its own.
- **On-demand loading.** A bundle loaded later reuses the libraries its context already has.

## Moving to a new React major

1. Release a CWP FynApp that pins the libraries the old common bundle had. Point one RequireJS context at it and check that its widgets behave the same.
2. Move the other contexts over one at a time. A context you have not moved stays on the old bundle.
3. Release a CWP with the new React major, and point the federated contexts at it. The widgets are not rebuilt.
4. Retire the old common bundle once no context uses it.

React 19 removed `ReactDOM.render`, `findDOMNode`, string refs and `propTypes`. A legacy widget that uses them needs a code change before it can run on React 19. Widgets that use `createRoot` run on both majors.

## Limits

- A page runs one federated CWP release. Every federated context on the page uses it. Other contexts stay on the old common bundle.
- The CWP's id list must load before the first `require()`.
- The AMD add-on is a working prototype in the FynMesh repo, in `demo-legacy-amd/`. It is not a published package yet.

## Try it

- Open the [legacy RequireJS demo](/legacy-amd). Put each set of widgets on the legacy or the federated CWP, with React 18 or React 19.
- Read [Upgrade React one micro frontend at a time](/guides/upgrade-react-incrementally) for the same plan with FynApps.
- Read [how kernel add-ons work](/how-it-works#8-kernel-add-ons).
