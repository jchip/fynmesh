# Legacy AMD bridge: serving federation libs to RequireJS components

Status: prototype, working. Code in `demo-legacy-amd/`.

## Problem

Older micro-frontends were built with webpack before Module Federation. Each
component is an AMD bundle loaded by RequireJS. Common libs (React, a UI kit)
are webpack `externals`, so every bundle starts with
`define(["react", "react-dom", "ui-kit"], ...)`. A platform team ships those libs
in a common web package, the CWP. Its `package.json` pins exact lib versions, and
its build turns them into AMD bundles. A page loads one CWP version, and every
component on it is locked to that CWP. A React major upgrade means rebuilding and
retesting all components at once.

Module Federation fixes version negotiation but does not load AMD bundles. The
question: can federation supply the libs that the legacy components already
`define`-depend on, with no rebuild of those components?

## Answer: yes, with the CWP as a FynApp and a kernel add-on

Two pieces:

- **CWP FynApp** (`fynapp-cwp`). The CWP rebuilt as a FynApp. It installs the
  libs from npm at the same pinned versions. It provides each lib as a federation
  share and exposes one module per AMD id, `./amd/<id>`. Its build also emits
  `amd-meta.js`, which tells RequireJS pages which ids it serves.
- **AMD kernel add-on** (`kernel-addon-amd/addon-amd.js`). It wraps
  `requirejs.load`, the hook RequireJS calls for every dep it has not seen yet.
  RequireJS source marks it as meant to be overridden.

Legacy code on a page sees one version of each lib, the one its CWP release pins.

### The contract: webpack externals

The legacy build's webpack `externals` is the interface between the two worlds.
Each external becomes an id in the bundle's `define([...])`, here `react`,
`react-dom` and `ui-kit`. The old CWP bundle used to provide those ids.
Federation has to provide the same ids, with the same export shape, and nothing
more. Component files and anything else the page loads stay with RequireJS.

The CWP's `cwp.json` is that list of externals. Each entry maps an AMD id to the
npm specifier behind it:

```json
{
  "externals": {
    "react": "esm-react",
    "react-dom": "esm-react-dom",
    "react-dom/client": "esm-react-dom",
    "ui-kit": "ui-kit"
  }
}
```

`kernel-addon-amd/tests/contract.test.ts` checks both sides of that contract:

- It runs each built legacy bundle against a stub `define` and checks that every
  dep is in each CWP's `cwp.json`. A new external in a legacy build fails that
  test instead of failing at runtime.
- It reads each CWP's built `amd-meta.js`. Every external must have its
  expose, and a subpath must use its package's share.

## The CWP FynApp

The CWP keeps its shape. It is a package whose `package.json` pins the libs as
npm deps. The FynApp's own version is the CWP release.

| Dir                      | `version` | pins                                         |
| ------------------------ | --------- | -------------------------------------------- |
| `fynapp-cwp-3/`          | `3.2.0`   | `esm-react` and `esm-react-dom` `18.3.1`, `ui-kit` `1.4.0` |
| `fynapp-cwp-4/`          | `4.0.0`   | `esm-react` and `esm-react-dom` `19.2.8`, `ui-kit` `1.4.0` |

Both are named `fynapp-cwp`. They stand in for two releases of one package, so
the demo can switch between them. `fynapp-cwp-4/rollup.config.ts` re-exports
CWP 3's config, which reads `package.json` and `cwp.json` from the dir it runs in.
The build derives four things from them:

- **Shares.** Each package in `cwp.json` is a share, provided from
  `node_modules` at its installed version. A subpath specifier shares its
  package's share.
- **Exposes.** `./amd/<id>` per external, each from a generated file in
  `src/amd-gen/` that does `import * as ns from "<specifier>"; export { ns }`.
- **Exact pin.** Each share is consumed with `semver` set to the installed
  version, such as `18.3.1`.
- **`amd-meta.js`** in `dist/`: the RequireJS config call the add-on reads.

### Versions: exact pin

federation-js only picks a provider whose version satisfies the consumer's
`semver`. With the exact pin, legacy code gets the CWP's own copy, or another
copy of the identical version. That keeps the guarantee the CWP gives today:
legacy code runs on the exact versions the CWP was tested with.

A modern FynApp asks for its own range, such as `^18.0.0`. When it finds the
CWP's copy first, it shares that copy with legacy code. When it finds a newer
18.x provider, it gets that one, and React has two instances on the page. That
is the cost of the exact pin, and the same split a page has today.

Verified on the demo page with CWP 3: `fynapp-react18-user` (`^18.0.0`) runs on
the CWP's React 18.3.1. The `fynapp-react-18` provider's entry loads, but its
React share file is never fetched. With CWP 4, `fynapp-react19-user` shares the
CWP's 19.2.8 the same way.

### Libs inside the CWP

A lib that imports another lib must go through the share too, with the range
the lib itself declares. `ui-kit` imports `esm-react` and declares
`peerDependencies: { "esm-react": "^18.0.0 || ^19.0.0" }`. The CWP's exact pin
covers only the CWP's own code. rollup-plugin-federation records each
importer's declared range, and the entry carries it per importer dir:

```js
_S("esm-react", { semver: "19.2.8" }, [[[surface, "19.2.8"],
  ["src/amd-gen", "19.2.8"], ["%nm/ui-kit/dist", "^18.0.0 || ^19.0.0"]]]);
```

`ui-kit` then renders with the same React as the legacy widgets. Its share
chunk is 2KB and holds no React.

`ui-kit` is its own package in `demo-legacy-amd/ui-kit/`. Like an npm lib, it
ships compiled ESM (`dist/index.js`, built with esbuild). The legacy webpack
build bundles the same package into `dist/ui-kit.js`, the old CWP's AMD bundle. Its webpack
externals map `esm-react` to the `react` id, so that bundle is still
`define(["react"], ...)`.

### Subpath externals

An external such as `react-dom/client` is its own AMD id. It gets its own
`cwp.json` entry and its own `./amd/<id>` expose. Its share is its package's
share: the build takes the package name from the specifier (`@scope/pkg` for a
scoped one) for the share key and the installed version.

Where the subpath's code ends up depends on the package:

- **The subpath is the main entry.** `esm-react-dom`'s main entry is the client
  build, so `react-dom/client` maps to `esm-react-dom`. Both ids are served from
  the one `esm-react-dom` share. Widget C imports `createRoot` from
  `react-dom/client`. On its click, the page fetches only `widget-c.js`. Both
  exposes sit in one chunk, already loaded for `react-dom`.
- **The subpath is its own file**, such as `preact/hooks`. A scratch build put
  the hooks code in the expose chunk, which imports `options` from the shared
  `preact` chunk. Legacy code gets one hooks copy, on the one shared preact. The
  plugin only pulls modules from the same package dir into a share chunk, and
  `preact/hooks` has its own `package.json`. So a modern FynApp that imports
  `preact/hooks` bundles its own copy. That is fine for a subpath that only
  re-exports from the main entry. It is a risk for one that keeps module state.

Two exposes that import only the same share are code-free modules, and Rollup
merges them into one chunk. The container entry then loads that chunk with
`.then(n => n.m1)` to pick one module's exports. federation keeps that pick:
the entry's `_f` stub returns it to `_E`, and `get()` applies it to the chunk's
namespace.

On UMD pages there is no CWP. RequireJS `map` sends `react-dom/client` to the
one UMD react-dom, which has the client API in React 18.

### The AMD meta

A legacy page tells RequireJS where the common bundle is with its config.
`paths` maps an id to a file. `bundles` maps several ids to one bundle file, and
r.js can write that config out for you. `map` rewrites an id per consumer before
either one applies. The CWP works the same way. Its build emits `amd-meta.js`,
a RequireJS config call that lists the externals it serves:

```js
requirejs.config({ context: "_", config: { fynmesh: { modules: {
  "react": {
    "fynapp": "fynapp-cwp", "version": "3.2.0", "expose": "./amd/react",
    "share": "esm-react", "shareVersion": "18.3.1"
  },
  ...
} } } });
```

`version` tells the add-on which release to load. The add-on passes it to the
kernel as the range, then finds the app by its `name@version` key, which the
kernel registers for every FynApp. An entry without `version` loads the FynApp
by name. `share` and `shareVersion` record what each external resolves to. The
add-on does not read them, but they make the meta a full record of what a page
runs.

The meta sits in RequireJS module config (`config`) for two reasons. RequireJS
deep-merges that key, so several meta files add up. Each RequireJS context also
keeps its own copy. The add-on reads it on each `requirejs.load` call, with no
wait. A `data-context` attribute on the meta's script tag names the context it
configures. Without one it configures the default context, `_`.

### One CWP per context

A RequireJS context loads one `amd-meta.js`, so it runs one CWP release.
Upgrading means pointing it at another CWP's meta. No legacy component is
rebuilt. The page's registry resolver maps `fynapp-cwp` and a version to that
release's manifest. A page runs one release of the CWP. A context with no meta
stays plain RequireJS on the legacy CWP, so contexts can move to the federated
CWP one at a time. Two contexts on the release share one FynApp load and one
copy of each lib. Each legacy context loads its own copy of every file it
fetches, so two legacy contexts run two Reacts.

The add-on refuses a second release of the same FynApp name. It logs an error
naming both versions, records `amd.bridge` with `ok: false`, and sends the ids
to the normal script load. Two releases ship the same libs. A lib that imports
React binds to one copy of it, so a context on the second release could get the
first release's instance. Fixing that means one instance of each lib per React
it bound to. That is Node's nested dependencies rebuilt at run time, and we
chose not to take it on. [`PEER-SHARE-RESOLUTION-DESIGN.md`](./PEER-SHARE-RESOLUTION-DESIGN.md)
sets out what supporting it would take.

### Loading on demand

The page preloads nothing and awaits nothing. It keeps its plain `require()`:

1. Legacy code calls `require(["widget-a"])`. RequireJS fetches `widget-a.js`.
2. Its `define(["react", "react-dom", "ui-kit"], ...)` names deps. RequireJS
   applies `map` and `packages`, then calls `requirejs.load` for each one.
3. The add-on looks the id up in the meta. An id that is not listed goes
   straight to the original `requirejs.load`, which follows the page's `paths`.
   No federation code runs for it.
4. A listed id loads its FynApp release, once per release. That fetches only
   the FynApp entry, not the libs.
5. The add-on loads the expose through `hooks.loadExpose`. Federation fetches
   that one share. In a new task, the add-on then calls `define(id, ...)` and
   `context.completeLoad(id)`.
6. If the FynApp or the expose fails, the id goes to the original
   `requirejs.load`. `paths` fallbacks and errbacks then work as usual.

Step 5 uses a new task because `completeLoad` binds any anonymous `define` still
queued to its id. A legacy script's anonymous `define` waits in that queue until
the script's load event. Microtasks can run between the two, so a `completeLoad`
from a promise callback can take the widget's `define`. A browser runs a script
and fires its load event in one task, so a `setTimeout` never lands in that gap.

Page setup is script order only:

```html
<script src="libs/require.js"></script>
<script>requirejs.config({ paths: { "widget-a": "dist/widget-a", ... } })</script>
<script src="/system.min.js"></script>
<script src="/federation-js/dist/federation-js.min.js"></script>
<script src="/kernel/dist/fynmesh-browser-kernel.min.js"></script>
<script>fynMeshKernel.setRegistryResolver(...)</script>
<script src="addon-amd.js"></script>
<script src="/fynapp-cwp-4/dist/amd-meta.js"></script>
<script>require(["widget-a", "widget-b"], ...)</script>
```

### RequireJS scenarios

`kernel-addon-amd/tests/` runs RequireJS 2.3.8 in jsdom, with real `<script>`
loads from disk. `requirejs.test.ts` pins down how a page's config turns an
external id into the common bundle file. `addon.test.ts` runs the add-on
through the same scenarios, against a fake kernel that implements the add-on
protocol. Run them with `fyn test` in `kernel-addon-amd`.

| Scenario | RequireJS | The add-on |
| --- | --- | --- |
| `paths` | longest id prefix picks the path | meta wins over `paths`; ids not in the meta keep `paths` |
| `bundles` | `load` runs once per bundle url, for the first id only | frees the url for listed ids, so each id of the bundle is served; the bundle file is never fetched |
| `map` | rewrites ids per consumer before `load` | meta entries for `react@18` and `react@19` give each consumer its own version, from its own FynApp |
| `version` | not involved | loads the release the meta names and finds it as `name@version` |
| `paths` fallback array, errback, `undef` | retry on script error; errback gets `requireModules` | a failed FynApp or expose falls back to the file load, so all three still work |
| `shim` | a global script is wrapped as a module | not involved: shimmed ids are not in the meta |
| contexts | all contexts share the one global `requirejs.load` | each context reads its own meta |

Without the url fix, a page whose legacy config lists the CWP's libs in a
`bundles` entry times out on every id after the first.

### Metrics for preload meta

Preloading is not built. The add-on records what a later preload generator
needs. Entries go to kernel telemetry, so they cost nothing until a page calls
`kernel.setTelemetry({ transport })`. A collector picks them up by name.

| Entry        | `value`                     | `data`                                    |
| ------------ | --------------------------- | ----------------------------------------- |
| `amd.module` | ms from request to defined  | `{ context, id, route, url, deps }`       |
| `amd.bridge` | ms to load a FynApp         | `{ name, ok }`, `name` is `name@version`  |

- **`deps`** comes from `requirejs.onResourceLoad`, which RequireJS calls for
  every defined module with its resolved deps. The entries together form the
  dependency graph.
- **`route`** is `bridge` (served from `./amd/<id>`), `legacy` (fetched by
  RequireJS) or `inline` (defined without a request).
- **`url`** is the absolute file URL for `legacy` modules.
- The time includes waiting for deps, so a component's time covers its libs.

Roots are the ids no recorded module depends on. Each entry also carries the
telemetry `ts`. A generator can use it to separate startup loads from later
`require()` calls made inside component code.

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

- **Two sets.** The same widgets mount twice, each set in its own RequireJS
  context, `set1` and `set2`. `?set1=` and `?set2=` each take `legacy` or
  `federated`, and `?cwp=` takes `cwp3` or `cwp4`. The default is `legacy`,
  `federated` and `cwp4`. A legacy set uses the UMD files through RequireJS
  `paths`, with the webpack-built `ui-kit.js`. A federated set loads the page's
  release's `amd-meta.js` into its context, and the CWP serves React and
  `ui-kit`. Each context sets `urlArgs: "set=<name>"`, so every file it
  fetches is tagged with its set.
- **On-demand load.** Each set's Team C loads only on a button click, through
  that context's `require(["widget-c"])`. Its new dep, `react-dom/client`, is
  served then. Only `widget-c.js` is fetched; React is reused.
- **FynApps alongside.** After both sets mount, two ordinary FynApps load:
  `fynapp-react19-user` (`esm-react ^19`) and `fynapp-react18-user` (`^18`). The
  one whose major matches a set's CWP gets that CWP's React. The other gets its
  own React from a React provider FynApp. A table lists each React instance, who
  uses it, and how many times its file was fetched. One fetch per instance shows
  the sharing.
- **Files fetched.** Resource timings for legacy bundles, UMD libs, CWP,
  React provider and FynApp files, with a divider at the click.
- **Metrics and graph.** The `amd.*` telemetry entries, and one dependency graph
  per set drawn from their `deps`. The add-on runs on every page load. A UMD set
  has no meta, so all its modules show as `legacy`.

Simpler test pages stay in `legacy-components/public/`: `legacy.html` (UMD
baseline) and `bridged.html` (add-on, CWP 4).

## Caveats and open items

- **One federated CWP release per page.** Not supported beyond that, and the
  add-on refuses a second one. See "One CWP per context".
- **The meta must load before the first `require()`.** It is a plain script,
  so script order does it. An id requested before the meta goes to `paths`.
- **Subpath sharing with modern FynApps.** A subpath with its own file is
  shared among legacy code but not with modern FynApps. Making a subpath a share
  of its own is untested.
- **Export shape.** `toAmdExports` makes each id look like the old UMD object. A
  lib whose old CWP bundle had a different shape needs a small adapter in its
  expose.
- **CWP release flow.** A CWP release is a FynApp build plus its meta. The
  page's registry resolver decides which release a name and version resolve to.
- **React 19 removals.** `ReactDOM.render`, `findDOMNode`, string refs and
  `propTypes` are gone in 19. A legacy component that uses them breaks on CWP 4.
  The widgets here use `createRoot`, so they run on both.
- **Global `define`.** RequireJS sets a global `define.amd`. The kernel,
  federation-js and SystemJS bundles are IIFEs with no AMD detection, so they
  coexist. Any UMD script added after RequireJS would still hit "mismatched
  anonymous define". That hazard already exists on legacy pages.
- **Not yet checked:** a FynApp and a legacy widget sharing React context,
  such as one provider wrapping both. They run on one React module, so it should
  hold, but no test covers it.
- **Not explored:** the reverse direction, where FynApps consume legacy AMD libs.

## Layout

| Path                                  | What                                                     |
| ------------------------------------- | -------------------------------------------------------- |
| `demo/demo-server/templates/pages/legacy-amd.html` | the demo page, a site template              |
| `demo-legacy-amd/legacy-components/`  | webpack 5 AMD build, UMD React 18 libs, test pages       |
| `demo-legacy-amd/ui-kit/`             | the UI kit package, compiled ESM                         |
| `demo-legacy-amd/fynapp-cwp-3/`       | CWP 3.2.0: `cwp.json`, pinned deps, the CWP build in `rollup.config.ts` |
| `demo-legacy-amd/fynapp-cwp-4/`       | CWP 4.0.0: same `cwp.json`, React 19 pins, CWP 3's config |
| `demo-legacy-amd/fynapp-react1[89]-user/` | the two plain FynApps on the demo page               |
| `demo-legacy-amd/kernel-addon-amd/`   | `addon-amd.js`: the `requirejs.load` hook and metrics; `tests/`: RequireJS, add-on and contract tests |
| `demo/demo-server/src/dev-proxy.ts`   | flat `/<package>` routes into `demo-legacy-amd/`         |
| `demo/demo-server/scripts/build-demo-site.mts` | copies the packages into the site, flat       |
