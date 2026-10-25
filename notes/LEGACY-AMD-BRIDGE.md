# Legacy AMD bridge: serving federation libs to RequireJS components

Status: triage prototype, working. Code in `demo-legacy-amd/`.

## Problem

Older micro-frontends were built with webpack before Module Federation. Each
component is an AMD bundle loaded by RequireJS. Common libs (React, a UI kit)
are webpack `externals`, so every bundle starts with
`define(["react", "react-dom", "ui-kit"], ...)` and the page supplies one copy of
each lib from a common bundle. Every component is then locked to that one copy. A
React major upgrade means rebuilding and retesting all components at once.

Module Federation fixes version negotiation but does not load AMD bundles. The
question: can federation supply the libs that the legacy components already
`define`-depend on, with no rebuild of those components?

## Answer: yes, with a bridge FynApp and a kernel add-on

Two pieces:

- **Bridge FynApp** (`fynapp-amd-bridge`). Built from a mapping file. It exposes
  one module per AMD id, `./amd/<id>`, and each one re-exports a federation share.
- **AMD kernel add-on** (`kernel-addon-amd/addon-amd.js`). It wraps
  `requirejs.load`, the hook RequireJS calls for every dep it has not seen yet.
  RequireJS source marks it as meant to be overridden.

Legacy code on a page sees one version of each lib, the one the bridge exposes.

### Loading on demand

The page preloads nothing and awaits nothing. It keeps its plain `require()`:

1. Legacy code calls `require(["widget-a"])`. RequireJS fetches `widget-a.js`.
2. Its `define(["react", "react-dom", "ui-kit"], ...)` names deps. RequireJS
   calls `requirejs.load` for each one.
3. On the first call, the add-on loads the bridge FynApp. That fetches only the
   bridge entry and the provider entry, not the libs.
4. If the bridge exposes `./amd/<id>`, the add-on loads that expose through
   `hooks.loadExpose`. Federation fetches that one share. The add-on then calls
   `define(id, ...)` and `context.completeLoad(id)`.
5. Any other id, or any id when the bridge failed to load, goes to the original
   `requirejs.load`, which follows the page's `paths`.

Verified: a page that requires only `ui-kit` fetches the `esm-react` share and
never fetches `esm-react-dom`.

Page setup is script order only:

```html
<script src="libs/require.js"></script>
<script>requirejs.config({ paths: { "widget-a": "dist/widget-a", ... } })</script>
<script src="/system.min.js"></script>
<script src="/federation-js/dist/federation-js.min.js"></script>
<script src="/kernel/dist/fynmesh-browser-kernel.min.js"></script>
<script>fynMeshKernel.setRegistryResolver(...)</script>
<script src="addon-amd.js" data-bridge="fynapp-amd-bridge"></script>
<script>require(["widget-a", "widget-b"], ...)</script>
```

The add-on uses only the public add-on protocol: `kernel.use`,
`kernel.loadFynAppsByName`, `hooks.findApp`, `hooks.loadExpose` and `hooks.tel`.
It can stay a standalone script or move into `core/kernel` as a bundled add-on.

### Metrics for preload meta

Preloading is not built. The add-on records what a later preload generator
needs. Entries go to kernel telemetry, so they cost nothing until a page calls
`kernel.setTelemetry({ transport })`. A collector picks them up by name.

| Entry        | `value`                     | `data`                                    |
| ------------ | --------------------------- | ----------------------------------------- |
| `amd.module` | ms from request to defined  | `{ id, route, url, deps }`                |
| `amd.bridge` | ms to load the bridge       | `{ name, ok }`                            |

- **`deps`** comes from `requirejs.onResourceLoad`, which RequireJS calls for
  every defined module with its resolved deps. The entries together form the
  dependency graph.
- **`route`** is `bridge` (served from `./amd/<id>`), `legacy` (fetched by
  RequireJS) or `inline` (defined without a request).
- **`url`** is the absolute file URL for `legacy` modules.
- The time includes waiting for deps, so a component's time covers its libs.

A run of the demo page records:

```
amd.bridge  3ms  fynapp-amd-bridge ok
amd.module  4ms  react      bridge  deps []
amd.module  9ms  ui-kit     bridge  deps []
amd.module 10ms  react-dom  bridge  deps []
amd.module 16ms  widget-a   legacy  deps [react, react-dom, ui-kit]   .../dist/widget-a.js
amd.module 16ms  widget-b   legacy  deps [react, react-dom, ui-kit]   .../dist/widget-b.js
```

Roots are the ids no recorded module depends on. Each entry also carries the
telemetry `ts`. A generator can use it to separate startup loads from later
`require()` calls made inside component code.

## The mapping file

`fynapp-amd-bridge/amd-bridge.json` plays the role of the legacy common-bundle
build config. It is the one place that says which libs legacy code gets and at
what version:

```json
{
  "providers": {
    "fynapp-react-lib": "^19.0.0",
    "fynapp-ui-kit": "^1.4.0"
  },
  "modules": {
    "react": { "share": "esm-react", "semver": "^19.0.0", "provider": "fynapp-react-lib" },
    "react-dom": { "share": "esm-react-dom", "semver": "^19.0.0", "provider": "fynapp-react-lib" },
    "ui-kit": { "share": "ui-kit", "semver": "^1.4.0", "provider": "fynapp-ui-kit" }
  }
}
```

The bridge's `rollup.config.ts` reads it and derives three things:

- **`exposes`**: `./amd/<id>` per module, each from a generated file in
  `src/amd-gen/` that does `import * as ns from "<share>"; export { ns }`.
- **`shared`**: one consume-only entry per share, with its semver.
- **`shared-providers` in the manifest**: one entry per provider, listing the
  shares it provides. The kernel uses it to load the provider FynApps. This
  overrides create-fynapp's usual detection from `devDependencies`, so the
  bridge has no lib packages installed.

### A federated UI kit

`fynapp-ui-kit` builds the same `legacy-components/src/ui-kit.jsx` the webpack
build bundles, and shares it as `ui-kit`. Its `react` import is aliased to the
`esm-react` share, so the UI kit renders with the same React as the widgets.
Its `shared-providers` names the React provider for its build variant, the
same way the bridge does. Its share chunk carries the version from its own
`package.json`, 1.4.0.

The UI kit has to run on the one React the legacy page runs. So it builds two
variants, like the bridge: `dist/` on React `^19` and `dist-react18/` on `^18`
(`UI_KIT_REACT=18`).

A shared module that re-exports with `export * from` builds an empty share
chunk with no error. `src/index.js` names its exports instead.

To change what legacy code gets, edit the mapping and rebuild only the bridge.
Verified: switching `^19.0.0` to `^18.0.0` moves the unchanged page from React
19.2.8 (`fynapp-react-19`) to 18.3.1 (`fynapp-react-18`).

### Interop detail

webpack AMD externals expect a CommonJS-style exports object. `import React from
"react"` compiles to `__webpack_require__.n(mod)`, which returns `mod.default`
only when `mod.__esModule` is set. The add-on's `toAmdExports` flattens the ES
namespace into a plain object with no `__esModule` and no `default`. Default and
named imports then both work.

## Demo

On the site at `/legacy-amd`, listed on `/demos`. Under the dev server it is
`http://localhost:<port>/legacy-amd.html`. The page is a site template, and its
packages are served flat as `/<package>/`, like every other FynApp. Same webpack
bundles throughout: `ui-kit` and three team widgets, built against React 18.3.1.

- **Version switch.** `?source=umd` uses the UMD files through RequireJS
  `paths`, with the webpack-built `ui-kit.js`. `?source=react18` and
  `?source=react19` use the bridge built from `amd-bridge.react18.json` or
  `amd-bridge.json`, and take `ui-kit` from the matching `fynapp-ui-kit`
  variant. One version per page load.
- **On-demand load.** Team C loads only on a button click, through
  `require(["widget-c"])`. Only `widget-c.js` is fetched; React is reused.
- **FynApps alongside.** After the widgets mount, two ordinary FynApps load:
  `fynapp-react19-user` (`esm-react ^19`) and `fynapp-react18-user` (`^18`). The
  one whose major matches the bridge gets the same React share as the legacy
  widgets. The other gets its own React from the other provider. A table lists
  each React instance, who uses it, and how many times its share file was
  fetched. One fetch per instance shows the sharing.
- **Files fetched.** Resource timings for legacy bundles, UMD libs, bridge,
  React provider and FynApp files, with a divider at the click.
- **Metrics and graph.** The `amd.*` telemetry entries and a dependency graph
  drawn from their `deps`.

The bridge's `build` script builds both variants: `dist/` from
`amd-bridge.json` and `dist-react18/` from `amd-bridge.react18.json`
(`AMD_BRIDGE=react18`). The variant exists only for the demo's switch. A real
deployment has one mapping.

Simpler test pages stay in `legacy-components/public/`: `legacy.html` (UMD
baseline) and `bridged.html` (add-on, React 19).

## Caveats and open items

- **The bridge sits in front of the first load.** The add-on waits for the
  bridge entry before it answers any `requirejs.load`, including legacy
  components' own files. That costs one small fetch, once. Skipping ids that
  have an explicit `paths` entry would remove it, but `paths` would then win
  over the mapping.
- **React 19 removals.** `ReactDOM.render`, `findDOMNode`, string refs and
  `propTypes` are gone in 19. A legacy component that uses them breaks when the
  mapping moves to 19. The widgets here use `createRoot`, so they run on both.
- **Global `define`.** RequireJS sets a global `define.amd`. The kernel,
  federation-js and SystemJS bundles are IIFEs with no AMD detection, so they
  coexist. Any UMD script added after RequireJS would still hit "mismatched
  anonymous define". That hazard already exists on legacy pages.
- **Only the default RequireJS context is hooked.** `requirejs.load` is global,
  so other contexts would pass through it too, but none was tested.
- **Not yet checked:** a FynApp and a legacy widget on one page sharing one React
  instance and its context. It should hold, because both resolve the same share
  module, but no test covers it yet.
- **Not explored:** the reverse direction, where FynApps consume legacy AMD libs.

## Layout

| Path                                  | What                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `demo/demo-server/templates/pages/legacy-amd.html` | the demo page, a site template              |
| `demo-legacy-amd/legacy-components/`  | webpack 5 AMD build, UMD React 18 libs, test pages       |
| `demo-legacy-amd/fynapp-amd-bridge/`  | bridge: `amd-bridge.json` and the generator in `rollup.config.ts` |
| `demo-legacy-amd/fynapp-ui-kit/`      | the legacy ui-kit source built as a FynApp that shares `ui-kit` |
| `demo-legacy-amd/fynapp-react1[89]-user/` | the two plain FynApps on the demo page               |
| `demo-legacy-amd/kernel-addon-amd/`   | `addon-amd.js`: the `requirejs.load` hook and metrics    |
| `demo/demo-server/src/dev-proxy.ts`   | flat `/<package>` routes into `demo-legacy-amd/`         |
| `demo/demo-server/scripts/build-demo-site.mts` | copies the packages into the site, flat       |
