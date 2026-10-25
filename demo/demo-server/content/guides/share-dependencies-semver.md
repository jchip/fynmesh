---
title: Share Dependencies Across Micro Frontends by Semver
description: Declare shared modules with a semver range in each FynApp. The runtime picks a loaded version that fits, or loads its own copy when none does.
pageName: Share Dependencies by Semver
---

Each FynApp declares the shared modules it uses and the semver range it accepts. At runtime `federation-js` picks a loaded version that satisfies that range. If none fits, it falls back to loading a copy of its own.

This guide covers the config, how a range picks a version, what `singleton` changes, and how to see the result.

## Declare a shared module

Sharing is configured in the Rollup build through `rollup-plugin-federation`. The `shared` option maps a module name to its config:

```js
import federation from "rollup-plugin-federation";

federation({
  name: "plugin_1",
  filename: "federation-entry.js",
  exposes: { "./bootstrap": "./src/bootstrap.js" },
  shared: {
    react: { singleton: true, semver: "^19.0.0" },
  },
});
```

The fields that matter:

- `semver` is the range this container accepts.
- `singleton` asks for one instance across all containers.
- `import` says whether to bundle a copy, or treat the module as external.

A module used only through another package still has to appear in `shared` with its range. Listing it as an external is not enough. The failure shows up at runtime as a duplicate instance, not as a build error.

In a FynApp you rarely call the plugin directly. The `create-fynapp` helpers wrap it. This is the React 18 config of `fynapp-2-react18` in the demo:

```ts
...setupFederationPlugins({
  name: "fynapp-2-react18",
  exposes: {
    "./main": "./src/main.ts",
    "./App": "./src/App.tsx",
    "./component": "./src/component.ts",
  },
  shared: {
    "esm-react": { singleton: false, semver: "^18.0.0" },
    "esm-react-dom": { singleton: false, semver: "^18.0.0" },
  },
}),
```

## What the build records

The build writes `dist/fynapp.manifest.json`. It is embedded in the entry file too, so the kernel reads it without an extra request. Two fields describe sharing.

An app that provides a module lists it under `provide-shared`:

```json
"provide-shared": {
  "esm-react": { "singleton": false, "semver": "^18.0.0" }
}
```

An app that needs a module lists it under `consume-shared`, and names which FynApp provides it under `shared-providers`:

```json
"consume-shared": { "esm-react": { "semver": "^19.0.0" } },
"shared-providers": {
  "fynapp-react-lib": { "semver": "^19.0.0", "provides": ["esm-react", "esm-react-dom"] }
}
```

The provider comes from the consumer's `package.json` dependency. In `fynapp-1`, that is `"fynapp-react-lib": "^19.0.0"`. Build order matters here. The consumer's build reads the provider's manifest off disk, so build providers first.

## How a range picks a version

When code imports a shared module, the runtime resolves it in this order:

1. Look for a version that is already loaded and satisfies the consumer's range.
2. If none is loaded, look for a registered but not yet loaded version that satisfies it.
3. If nothing in the share scope fits, resolve the import the ordinary way, which loads the copy the consumer ships.

Take three apps in one scope. Two ask for `^19.0.0` and one asks for `^18.0.0`. The first two get one shared React 19 copy. The third gets a React 18 copy. Nobody had to coordinate.

You can also pick a version of an exposed module. A consumer writes the range in the import itself:

```ts
import("fynapp-x1/main", { with: { type: "mf-expose", semver: "^2.0.0" } })
```

The page then picks the loaded `fynapp-x1` version that fits. This is how `fynapp-x1` 1.0.0 and 2.0.0 live on one demo page.

## Singleton and non-singleton

The two modes answer different needs.

A non-singleton share (`singleton: false`) follows the rules above. Different ranges can produce different copies. Use it when two majors must coexist, such as React 18 and 19.

A singleton share means one copy for the whole scope. Once any version is in play, every consumer gets that version. A consumer whose range excludes it still gets it, and the runtime logs a warning that names the container. It does not throw. Refusing the import would break a page that otherwise works, and the fix belongs in the app's declared range.

Use a singleton when two copies would be a bug. Libraries that keep global state or a registry fit here. Two copies of a library like that cause failures such as an invalid hook call.

Pick by asking one question. Can two versions of this module safely run side by side? If yes, use `false`. If no, use `true`.

The scaffold for a new React FynApp from `create-fynapp` uses singleton shares for `react`, `react-dom` and `react-dom/client`. That suits a page with one React major. For two majors, set `singleton: false` as the demo providers do.

## When no compatible version exists

For a non-singleton share, the consumer falls back to its own copy. That keeps the page working. The cost is a second copy of the module.

For a singleton share, there is no second copy once a version has loaded. The loaded version wins, and you get the warning. Watch the browser console for the line that says the module "is declared singleton".

Both outcomes are visible in the inspector. Fix them by widening the consumer's range, or by upgrading the app that is behind.

## See it in the federation inspector

The federation inspector is a script tag that adds a badge to the page. Click it to open a panel. It answers the questions that browser devtools cannot:

- Who shares `esm-react`, at which versions, and from where?
- Which copy did each app get, and does its range allow that copy?
- Are there two copies of a singleton in play?

Use the Shares tab to see each share key with its versions. Use the Issues tab to find duplicate singletons and failed loads. Setup is in the [federation inspector docs](/docs/federation-inspector).

For a minified page, `Federation.__I()` returns a snapshot of the resolution decisions. It lists the declared ranges and the ranges that were applied. The [federation-js docs](/docs/federation-js) describe it.

## Next steps

- Watch semver sharing on the [live demo](/demo) and read the [features page](/features#shared).
- Read how [two React versions share a page](/guides/run-multiple-react-versions).
- Read [how to upgrade React one micro frontend at a time](/guides/upgrade-react-incrementally).
- Read the options table in the [rollup-plugin-federation docs](/docs/rollup-plugin-federation).
