---
title: Upgrade React One Micro Frontend at a Time
description: Move micro frontends from React 18 to 19 one at a time. FynMesh runs both versions side by side, so each team ships its own upgrade.
pageName: Upgrade React Incrementally
---

You can upgrade React one micro frontend at a time. FynMesh runs React 18 and React 19 apps on the same page, so old apps stay on 18 while new ones move to 19. Each team changes its own app and ships when it is ready. There is no big-bang upgrade day.

This guide gives a step-by-step plan and the pitfalls to watch for.

## Why a big-bang upgrade hurts

With one shared React, every app on the page must move together. One blocked team blocks everyone. A rollback means reverting every app.

FynMesh removes that coupling. Each FynApp declares the React range it accepts. The runtime shares one copy per compatible range. The [first guide](/guides/run-multiple-react-versions) explains how that works.

## The plan

### 1. Set a baseline

List your FynApps and note the React range each one uses. Open the page with the [federation inspector](/docs/federation-inspector) and look at the Shares tab. You should see one `react` entry per major.

### 2. Add a React 19 provider

A provider is a FynApp that ships React for others to consume. The demo has one per major, both named `fynapp-react-lib`. The React 19 one declares:

```ts
shared: {
  "esm-react": { singleton: false, semver: "^19.0.0" },
  "esm-react-dom": { singleton: false, semver: "^19.0.0" },
},
```

Your existing React 18 provider stays as it is. Both providers can be live on the page at once. The demo uses `esm-react` packages. In your own project the names are `react` and `react-dom`.

### 3. Keep the shares non-singleton

Set `singleton: false` on React in every provider. A singleton React forces every consumer onto one copy and only warns when a range does not fit. That defeats the point. The [semver guide](/guides/share-dependencies-semver) covers the rules.

### 4. Upgrade the leaf apps first

Pick an app that nobody else imports from. Change its dependency to the new provider:

```json
"dependencies": {
  "fynapp-react-lib": "^19.0.0"
}
```

Update its React types and code, then build it. Its manifest now says `consume-shared` with `^19.0.0`, and `shared-providers` points at the 19 provider. The other apps do not change.

In the demo, `fynapp-1` is a React 19 app next to `fynapp-2-react18`, which stays on React 18. They share a page and ship separately.

### 5. Check the page

Load the page and open the inspector. You should see two React copies, one per major. The Issues tab should show no duplicate singletons. Watch the console for singleton warnings.

### 6. Deploy that one app

Ship the upgraded app on its own. The other apps are untouched. If something breaks, roll back that one app.

### 7. Repeat, then retire the old provider

Move the next app. When no app consumes the React 18 provider, remove it. The page then loads one React copy again, and nothing else changed.

## Shared FynApps need versions too

Some FynApps are shared between apps, like a component library. Upgrading them is a two version job. The demo's `fynapp-x1` ships 1.0.0 on React 18 and 2.0.0 on React 19. Both are live.

Consumers pick with a range:

```ts
import("fynapp-x1/main", { with: { type: "mf-expose", semver: "^2.0.0" } })
```

In the demo, `fynapp-2-react18` asks for `^1.0.0`. The apps `fynapp-1` and `fynapp-1-b` ask for `^2.0.0`. A library team can ship 2.0.0 and let consumers move when they choose.

## Legacy RequireJS bundles

Older micro frontends built as webpack AMD bundles can follow the same plan. They get React from federation through a FynApp that serves their common libraries, with no rebuild, and move to a new major one RequireJS context at a time. See [Serve shared libraries to legacy RequireJS bundles](/guides/legacy-requirejs-on-module-federation).

## Pitfalls

### State and context do not cross versions

React 18 and 19 are separate module instances. A context made in a 19 app is invisible to an 18 component. Hooks from one copy do not work in a tree rendered by the other.

Do not pass React elements or hooks across the boundary. Pass plain data. Use middleware or a store that does not depend on React for cross-app state.

### Singleton libraries

A library that must be unique, such as a store or a router with global state, should be a singleton share. If two apps on different React majors both use it, the singleton keeps one copy. Check that this one copy works with both React versions. If it does not, upgrade or isolate it first.

### Ranges that do not match

If a consumer's range excludes every loaded version and the share is a singleton, the loaded version wins and the runtime logs a warning. The app may then run against a React it was not built for. Fix the range, not the warning.

### Build order

A consumer's build reads its provider's manifest from disk. Build providers before consumers. If you build in the wrong order, the consumer's `shared-providers` field comes out empty.

### The scaffold defaults

The `create-fynapp` scaffold for React uses singleton shares for `react`, `react-dom` and `react-dom/client`. That suits a page with one React major. Set `singleton: false` on the providers when you want two majors during a migration.

## Rollout summary

| Step | Who | Result |
| --- | --- | --- |
| Add React 19 provider | Platform team | Two providers live |
| Upgrade one leaf app | App team | One app on 19 |
| Check in inspector | App team | Two copies, no issues |
| Deploy that app | App team | Others untouched |
| Repeat | Each team | Old provider unused |
| Remove React 18 provider | Platform team | One copy again |

## Try it

- Open the [live demo](/demo) to see `fynapp-1` on React 19 and `fynapp-2-react18` on React 18.
- Read [how multiple React versions run on one page](/guides/run-multiple-react-versions).
- Read [how legacy RequireJS bundles get React from federation](/guides/legacy-requirejs-on-module-federation).
- Read [how semver ranges choose a version](/guides/share-dependencies-semver).
- Read the [FynApp contract](/docs/fynapp-contract) and the [kernel docs](/docs/kernel).
