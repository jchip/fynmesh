---
title: Run Multiple React Versions on One Page
description: Yes, React 18 and React 19 micro frontends can share one page. In FynMesh each app declares its React range and gets a copy that fits it.
pageName: Multiple React Versions
---

Yes, you can run React 18 and React 19 micro frontends on the same page. In FynMesh each FynApp declares the React range it accepts. The federation runtime shares one copy per compatible range, so apps that agree share a copy and a new major gets its own.

This is the main thing FynMesh does differently. Most setups force one React for the whole page. FynMesh lets each app keep the version it was built for.

## How it works

A FynApp is an independently built and deployed micro frontend. Its build writes a manifest that lists what it provides and what it consumes. The kernel reads that manifest before it runs the app.

Two pieces do the sharing:

- `rollup-plugin-federation` builds a container for each FynApp. The container declares each shared module and the semver range it accepts.
- `federation-js` runs in the browser. It picks a loaded version that satisfies the range, and loads another copy when nothing fits.

All FynApps on a page join one share scope named `fynmesh`. Nobody lists their peers. Apps that land on the page together share code automatically.

## The provider side

A provider is a FynApp that ships a shared module. The demo has two React providers. Both are named `fynapp-react-lib`. They differ only in version and range.

The React 19 provider, from `demo/fynapp-react-19/rollup.config.ts`:

```ts
...setupFederationPlugins({
  name: "fynapp-react-lib",
  exposes: {},
  shared: {
    "esm-react": { singleton: false, semver: "^19.0.0" },
    "esm-react-dom": { singleton: false, semver: "^19.0.0" },
  },
}),
```

The React 18 provider in `demo/fynapp-react-18` is the same file with `^18.0.0`. The demo uses the `esm-react` and `esm-react-dom` packages, which are ESM builds of React. A project of your own uses the standard `react` and `react-dom` packages instead.

`setupFederationPlugins` comes from the `create-fynapp` package. It wraps `rollup-plugin-federation` and sets the share scope, entry file name and manifest hooks for you.

## The consumer side

A consumer is a FynApp that uses React but does not bundle it. The app `fynapp-1` runs React 19. Its `package.json` depends on the provider range:

```json
"dependencies": {
  "fynapp-react-lib": "^19.0.0"
}
```

Its build then records the need in `dist/fynapp.manifest.json`:

```json
"consume-shared": {
  "esm-react": { "semver": "^19.0.0" },
  "esm-react-dom": { "semver": "^19.0.0" }
},
"shared-providers": {
  "fynapp-react-lib": {
    "semver": "^19.0.0",
    "provides": ["esm-react", "esm-react-dom"]
  }
}
```

The kernel reads `shared-providers` to know which provider to load first. The consumer then resolves `esm-react` against the range `^19.0.0`.

The app `fynapp-2-react18` is different. It provides its own React 18 through the shared config, with `semver: "^18.0.0"`. So the page ends up with a React 18 copy from that app and a React 19 copy from `fynapp-react-lib`.

## What is shared and what is not

The share scope holds one module instance per resolved copy. That has clear consequences.

Shared, when ranges agree:

- Three React 19 apps load one `react` 19 copy. They share its hooks dispatcher and its context.
- The download happens once.

Not shared, across versions:

- React 18 and React 19 are separate module instances. They do not see each other's state.
- A React context created in a 19 app is invisible to a component rendered by 18.
- A component tree must not mix elements from the two copies.

Treat each version as a separate island. Pass data between islands as plain values, through the kernel's middleware or through a small store that does not depend on React.

## Why `singleton` is false

Look again at the provider config. Both providers set `singleton: false`. This matters.

A singleton share means one copy for the whole scope. Once any version is in play, every consumer resolves to it, even a consumer whose range excludes it. The runtime only prints a warning. That is the right choice for libraries that must be unique. It is the wrong choice when you want React 18 and React 19 side by side.

So for React, `singleton: false` is what allows two majors to coexist. The next guide, [share dependencies by semver range](/guides/share-dependencies-semver), covers the rules in more detail.

## Two versions of the same app

The same idea works for your own FynApps, not only for React. The demo has `fynapp-x1` in two versions, built from `demo/fynapp-x1-v1` and `demo/fynapp-x1-v2`. Both have the name `fynapp-x1`. They have versions 1.0.0 and 2.0.0.

The v1 build shares React 18 and does not bundle it:

```ts
shared: {
  "esm-react": { import: false, singleton: false, semver: "^18.3.0" },
  "esm-react-dom": { import: false, singleton: false, semver: "^18.3.0" },
},
```

The v2 build uses the React 19 helper. Consumers pick a version with a range in the import:

```ts
import("fynapp-x1/main", { with: { type: "mf-expose", semver: "^2.0.0" } })
```

In the demo, `fynapp-2-react18` asks for `^1.0.0`. The apps `fynapp-1` and `fynapp-1-b` ask for `^2.0.0`. All three run on one page. Each gets the version that fits its range. The same page loads one name at two majors.

## Check what the page decided

The federation inspector shows which copy each app got. Open its Shares tab and look for the two `esm-react` entries. The Issues tab flags two copies of a singleton. See the [federation inspector docs](/docs/federation-inspector) for setup.

## Try it

- Open the [live demo](/demo) and find `fynapp-1` (React 19) and `fynapp-2-react18` (React 18) on the same page.
- Read the [same app, multiple versions section](/features#versions) and the [semver sharing section](/features#shared) on the features page.
- Read how the loader resolves ranges in the [federation-js docs](/docs/federation-js).
- Read [how to upgrade React one micro frontend at a time](/guides/upgrade-react-incrementally).
