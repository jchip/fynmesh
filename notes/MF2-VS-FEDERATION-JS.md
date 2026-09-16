# Module Federation 2.0 vs FynMesh `federation-js`

A feature-by-feature comparison of **Module Federation 2.0** and **FynMesh's SystemJS-based
federation stack**, written from both codebases rather than from marketing pages.

| | Module Federation 2.0 | FynMesh |
| --- | --- | --- |
| Versions compared | `@module-federation/*` **2.9.0** (`module-federation/core` @ `c38c4c0e4`, 2026-09-07) | `federation-js@1.1.3`, `rollup-plugin-federation@1.1.2`, `@fynmesh/kernel@1.1.3`, `create-fynapp@1.1.5` |
| Origin | ByteDance Web Infra + Zack Jackson; began as a webpack bundler feature, extracted into a standalone runtime for MF 2.0 (announced 2024-04-26) | `jchip`, `github.com/jchip/rollup-federation`; developed privately for ~2 years before its public repo, predating any adoptable MF runtime library |
| Runtime substrate | Bundler runtime (`__webpack_require__.federation`) + extracted `@module-federation/runtime` SDK | Forked SystemJS 6.15.1 (`@fynmesh/systemjs`) with a mutable module registry |
| Distribution | 43 packages on npm, ~43M downloads/mo (`@module-federation/runtime`) | **Published** since 2026-08-12: `federation-js`, `@fynmesh/kernel`, `rollup-plugin-federation`, `create-fynapp`, all at the versions above; ~500–900 downloads/mo each |
| License | MIT | Apache 2.0 |

Off-cycle MF versions worth knowing: `@module-federation/vite` **1.21.6**, `node` **2.7.50**,
`nextjs-mf` **8.8.74** (deprecated), `observability-plugin` **2.6.0**, `esbuild` **0.0.114**
(experimental), `nuxt` **0.1.0**.

**Companion doc:** this file scores capabilities. [`MF2-DETAILS.md`](./MF2-DETAILS.md) records
*mechanism* for MF features traced line-by-line through the checkout, so a claim here can be checked
or costed before we consider building an equivalent. Currently covers shared tree-shaking.

---

## The one-paragraph answer

**FynMesh and MF attack the same problem from opposite substrates: MF from the bundler's module
runtime, FynMesh from a mutable loader registry.** FynMesh is not a re-implementation of MF, and
reading it as one inverts the history — see [Why `federation-js` exists](#why-federation-js-exists)
below. The capabilities that distinguish it — per-importer semver resolution, self-sufficient
containers that federate when co-loaded without declaring each other as remotes, two versions of one
share key inside one container, versioned containers selected by range, a runtime resolver for apps
not yet loaded — are not by-products of the registry choice; they are what the registry was chosen
to deliver. The costs are equally direct, and all trace to *not* being a first-party bundler
feature: ESM output, SSR, federated types, a runtime plugin API, multi-bundler reach. MF 2.0,
meanwhile, has spent its 2.x cycle turning federation into a *platform*: a published manifest
protocol, an extracted
bundler-free runtime, a 40-hook plugin system, generated cross-app types, a Chrome extension, and
shared tree-shaking. On raw federation semantics FynMesh is ahead in the places that matter for
genuinely independent deployment; on everything surrounding federation, MF is several years ahead.

## Why `federation-js` exists

The comparison below is between two mature things, which makes it easy to read FynMesh as a late
alternative to an established standard. It was not built that way.

`federation-js` was designed and developed privately for roughly two years before its public
repository existed, so the public commit history marks when it surfaced, not when it began. At
inception, "Module Federation" was not a library anyone could adopt: it was a webpack feature,
emitted tightly coupled into the `.js` bundles webpack produced. There was no extracted runtime, no
bundler-free SDK, no manifest protocol — adopting MF meant adopting webpack's output format
wholesale. The bundler-independent MF that this document compares against arrived considerably
later, and is itself the result of MF moving in the direction of being a runtime rather than an
emission format.

So the unique capabilities in §17 are not incidental wins discovered after the fact — they are the
motivation. A loader-level registry was chosen precisely because per-importer resolution and
multiple concurrent versions of a share key are not reachable from inside a bundler runtime that
resolves one `requiredVersion` per key per container. Had that been achievable with what existed,
there would have been no reason to write `federation-js`.

**Read the rest of this document with that asymmetry in mind.** Where MF leads, it is usually
because a large team invested in surface area around a solved core. Where FynMesh leads, it is
usually the thing it was built to do.

---

## 1. Architectural premise

This is the root of nearly every difference below, so it's worth stating precisely.

### MF 2.0 — federation as a bundler capability, with the runtime extracted

A webpack/Rspack build emits a **container entry** exporting exactly `{ get, init }`
(`packages/enhanced/src/lib/container/ContainerEntryModule.ts:278-322`):

```js
var get  = (module, getScope) => { /* ensureChunk + factory from moduleMap */ };
var init = (shareScope, initScope, remoteEntryInitOptions) =>
  __webpack_require__.federation.bundlerRuntime.initContainerEntry({ ... });
__webpack_require__.d(exports, { get: () => get, init: () => init });
```

The bundler's own module runtime is the execution engine; `__webpack_require__.federation`
(`packages/enhanced/src/lib/container/runtime/utils.ts:36-40`) is the seam where MF's logic plugs in.
MF 2.0's headline change over MF 1.0 is that *the logic behind that seam was lifted out of webpack*
into `@module-federation/runtime` / `runtime-core`, so bundlers become thin adapters and the runtime
can be used with no bundler at all (even on webpack 4, or in plain Node).

### FynMesh — federation as a loader capability

Every chunk is `System.register` output. The fork of SystemJS adds a **record-exposure API**
(`systemjs/src/system-core.ts:47,251-344`): `System.registrations`, `System.records`,
`System.aliases`, `System.stageOf`, typed `System.hook`. `federation-js` installs a singleton on
`globalThis.Federation` and hooks exactly two SystemJS prototype methods — `resolve`
(share resolution, `federation-js.ts:292-313`) and `instantiate` (combined-bundle pulling, `:330-362`).

Because the registry is mutable and inspectable *after* load, resolution decisions can be made per
import site rather than per build. That is the whole trade.

**Federation is therefore a property of module resolution, not a relationship configured between
containers.** A normal container is expected to be self-sufficient: it can run with the modules it
ships. When several containers are loaded into one application, their module records enter the same
registry and compatible imports resolve across them by semver. They become federated by coexisting;
none has to pre-declare the others as remotes. A consume-only share (`import: false`) is the explicit
exception: because that container omitted its own implementation, the application, kernel, or other
composition layer must ensure a satisfying producer is loaded.

### Runtime delivery: embedded per artifact vs loaded once

The two substrates deliver their runtime differently, and the difference shows up as bytes on the
wire.

**MF has no runtime to load first — it compiles the runtime into every build.** The generated entry
module opens with a static import (`FederationRuntimePlugin.ts:202`):

```js
import federation from '@module-federation/webpack-bundler-runtime/bundler';
```

resolved through ordinary node_modules resolution (`:100-105`), so the runtime enters webpack's
module graph like any dependency. `EmbedFederationRuntimePlugin` — "Plugin that embeds Module
Federation runtime code into chunks" (`:26`) — then attaches it to every chunk where
`chunk.hasRuntime()` (`:43-46`). A host and each independently-built remote therefore each ship
their own copy. Because copies arrive in unpredictable order, the emitted code reconciles them at a
global (`FederationRuntimePlugin.ts:186-201`): the first to execute populates it, later ones merge
and skip re-init. **Only one instance runs — but all N copies are downloaded, parsed, and executed
to reach that guard.**

**FynMesh loads its runtime exactly once, and requires it explicitly.** SystemJS + `federation-js`
must be present before anything else, because they *are* the loader — every FynApp is
`System.register` output against an already-present registry.

This is a deliberate stance, not a tax to apologise for. **Federation is a capability an application
opts into and initializes, at a defined point, once** — not ambient behaviour that arrives welded
into whatever bundle happens to load first. MF's self-contained artifacts are what force the
reconciliation above: because no one initializes federation deliberately, every copy must assume it
might be the first, and the winner is decided by execution order. FynMesh has no such guard because
there is nothing to reconcile — the capability was established before any app ran. The O(1) payload
below is a consequence of that choice, not its justification.

Measured from built artifacts, both sides minified with esbuild `--minify`, gzip at level 9:

| artifact | raw | gzip |
| --- | ---: | ---: |
| **MF** embedded runtime (`webpack-bundler-runtime` + `runtime-core` + `sdk`, bundled) | 84,396 | **26,006** |
| **FynMesh** `system.min.js` | 10,145 | 3,779 |
| **FynMesh** `federation-js.min.js` | 12,189 | 4,926 |
| **FynMesh federation layer — total** | **22,334** | **8,705** |
| *(app layer, not federation — see below)* `fynmesh-browser-kernel.min.js` | 26,470 | 9,731 |
| *calibration:* `react-esm-19.production.js` | 18,592 | 4,658 |

The constant favours FynMesh — 8.7 KB gz against 26 KB gz, roughly 3× — but the scaling is the
real difference:

| page with N independently-built apps | MF | FynMesh |
| --- | --- | --- |
| N = 1 | 26 KB gz | 8.7 KB gz |
| N = 6 | ~156 KB gz | 8.7 KB gz |
| N = 20 | ~520 KB gz | 8.7 KB gz |

**MF pays per artifact; FynMesh pays once.** FynMesh is ahead at N = 1 and the gap widens linearly.

**What is being compared:** SystemJS + `federation-js` is the federation layer, and that is the only
fair counterpart to MF's runtime. The **kernel is not part of it** — it is the micro-frontend
*application* layer (lifecycle, middleware, FynBus, the dependency graph), for which MF has no
counterpart at all. Counting it anyway still lands under one MF copy: 18.4 KB gz vs 26 KB.

Three caveats, so the MF figure is not overstated: it was bundled with esbuild rather than webpack,
whose tree-shaking against one app's actual feature use could trim further;
`@module-federation/sdk/dist/node.js` (4,464 raw) landed in the browser bundle even under
`--conditions=browser`, worth perhaps 1–2 KB gz of unfairness; and discounting generously to ~20 KB
gz changes none of the scaling, which is structural rather than a matter of the constant.

**Consequence to keep in mind while reading:** MF's design questions are "what does the bundler emit,
and how do runtimes negotiate?" FynMesh's are "what does the loader know, and when?"

---

## 2. Capability matrix

Legend: ✅ shipped · 🟡 partial / caveated · ❌ absent · n/a not applicable

### Core federation

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Runtime delivery | embedded into **every** build (~26 KB gz per artifact), initialization settled by execution order | initialized **once**, explicitly, before any app runs (~8.7 KB gz, flat) | Federation as a deliberate capability vs ambient bundle content; O(1) vs O(N) (§1) |
| Expose modules from a build | ✅ `exposes` | ✅ `exposes` | Equivalent |
| Consume remote modules | ✅ `remotes` + `loadRemote` | ✅ import attributes + `_importExpose` | Different binding model (§6) |
| Container protocol | `{ get, init }` | `{ init, get, container, __FYNAPP_MANIFEST__ }` | FynMesh also exposes a live container object |
| Bidirectional host/remote | ✅ | ✅ | |
| Build-time `remotes` declaration | ✅ | ❌ **by design** | FynMesh resolves remotes at runtime (§6) |
| Runtime remote resolution | ✅ `registerRemotes(..., {force})` — a name→URL **table** | ✅ `setRegistryResolver((name, range) => …)` — a resolution **policy** | Not a gap: a resolver subsumes a table. No consumer-authored remote table is needed (§6) |
| Semver-range remote selection | ❌ | ✅ `_mfGetContainer(name, "^2.0.0")` | Unique to FynMesh |
| Same container name at two versions in one page | ❌ names are unique globals | ✅ `$C[name][version]` | Unique to FynMesh |
| Per-chunk binding metadata | ❌ | ✅ `_mfBind({n,f,c,s,e,v,b}, [importerDirs])` | Every non-entry chunk is bound |

### Shared dependencies

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| `singleton` | ✅ | ✅ warn-not-throw (`federation-js.ts:945-961`) | Pinned by tests `:630-720` |
| `strictVersion` | ✅ upgrades warn → error | ❌ | |
| `eager` | ✅ | ❌ accepted, read by nothing (`types.ts:97-108` says so verbatim) | |
| `requiredVersion` / range | ✅ | ✅ `semver` (alias `requiredVersion`) | |
| `import: false` (consume-only) | ✅ | ✅ (`share-collection.mts:74`) | |
| `shareKey` / `request` split | ✅ | ❌ | MF separates build-time interception from runtime negotiation |
| Per-share `shareScope` | ✅ `string \| string[]` | ❌ accepted then **silently dropped** (`constants.mts:28-34`) | Container-level scope works |
| Multiple share scopes | ✅ documented pattern | 🟡 flat string scopes only | |
| `layer` | ✅ | ❌ | |
| Subpath sharing (`react-dom/`) | ✅ trailing-slash prefix match | ❌ must declare each key | FynMesh trap documented at `rollup-plugin-federation/README.md:73-75` |
| `shareStrategy` (version-first / loaded-first) | ✅ | ❌ hard-coded | FynMesh is effectively loaded-first (§5) |
| Selection rule | **highest satisfying**, loaded copy sticky | **first registered satisfying** (load order) | Real semantic difference |
| Multi-version coexistence across containers | ✅ | ✅ | |
| **Two versions of one share key inside one container** | ❌ structurally impossible | ✅ | **Unique to FynMesh** |
| **Per-importer declared ranges (`rvm`)** | ❌ one `requiredVersion` per key | ✅ all applicable ranges must hold | **Unique to FynMesh** |
| Shared tree-shaking | ✅ opt-in per share; ~75% reported on antd | ❌ | webpack is the reference implementation, Rspack the recommended one (§13) |

### Runtime & extensibility

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Bundler-free runtime SDK | ✅ `createInstance()` | 🟡 global singleton, not importable (`src/index.ts:1-9` exports only `Container` + types) | |
| Runtime plugin hooks | ✅ **~40 hooks** across 4 PluginSystems | ❌ **none** | Biggest extensibility gap |
| Global plugins | ✅ `registerGlobalPlugins` (deduped by name) | ❌ | |
| Build plugin hooks | ✅ webpack/Rspack plugin API | ✅ 4 own hooks (`enrichManifest`, `emitMeta`, `emitFederationMeta`, `renderDynamicImport`) | |
| User-extensible import protocol | ❌ | ✅ `renderDynamicImport` + build-time guard (`index.mts:785-795`) | Unique to FynMesh |
| Application middleware layer | ❌ nothing comparable | ✅ (§7) | **Unique to FynMesh** |
| App lifecycle contract | ❌ modules only | ✅ `FynUnit` init/execute/shutdown/suspend/resume | **Unique to FynMesh** |
| Inter-app messaging | ❌ | ✅ FynBus pub/sub + request/response + channels | **Unique to FynMesh** |
| Cross-app dependency graph + topological load | ❌ on-demand only | ✅ (`manifest-resolver.ts:194-266`) | **Unique to FynMesh** |
| Config system | ✅ extensive | ❌ `KernelConfig` is entirely dead code | |

### Tooling, types, delivery

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Published manifest schema | ✅ `mf-manifest.json` + `mf-stats.json`, typed in `packages/sdk` | 🟡 4 JSON artifacts, **unversioned** | §4 |
| Manifest embedded in entry (zero extra request) | ❌ | ✅ `__FYNAPP_MANIFEST__` | Unique to FynMesh |
| Federated TypeScript types | ✅ `dts-plugin`, `@mf-types.zip`, live WS reload | ❌ every cross-app import is `any` | Widest DX gap |
| Chrome extension | ✅ shipped, store id `aeoilchhomapofiopejjlecddfldpeom` | ❌ **deliberately cancelled** (FYM-31 `wont_do`) | |
| In-page inspector | ❌ | ✅ 16,462 LOC, 8 views, 24 diagnostics | **Unique to FynMesh** |
| Observability / telemetry | ✅ `observability-plugin`, exportable trace reports | 🟡 `KernelTelemetry` built but **inert by default** | |
| SSR | ✅ Modern.js (stream), `@module-federation/node`, Rsbuild | ❌ does not exist; `NodeKernel` bypasses federation | **Widest single gap** |
| Preloading | ✅ `preloadRemote` w/ filters, deps, asset categories | 🟡 depth-bounded only; **priority system unimplemented** | §13 |
| Data prefetch | ✅ `*.data.ts` + `instance.prefetch()` | ❌ | |
| Retry / failover | ✅ `retry-plugin` (domains, backoff, cache-bust) | ❌ | |
| Error taxonomy | ✅ `RUNTIME-*`/`BUILD-*`/`TYPE-*` codes | ✅ 19 kernel codes; ⚠️ all diagnostics dropped in prod (`drop_console: true`) | |
| Bundlers | webpack, Rspack, Rsbuild, Rslib, Vite, Rollup/Rolldown, Metro, esbuild(exp) | **Rollup only**, SystemJS output only | |
| Framework bridges | ✅ React 16–19, Vue 3 | ❌ (but demo covers React/Vue/Marko/Preact/Solid/Svelte) | |
| SRI / CSP / sandboxing | ❌ none (explicitly) | ❌ none | Tie — see §15 |

---

## 3. Container protocol and build output

### MF 2.0

| | |
| --- | --- |
| Entry filename | `filename` option, conventionally `remoteEntry.js` |
| Exports | `{ get(id) => () => Promise<Module>, init(shareScope, initScope, opts) }` (`runtime-core/src/type/config.ts:169-176`) |
| Output shapes | `library.type` — full webpack `LibraryType` union; **default changed `var` → `global`** in 2.0 stable. `'module'` = real ESM (needs `experiments.outputModule`) |
| Remote loading type | `remoteType`, default `'script'`; `RemoteEntryType` is an **open union ending in `\| string`**, which is how `'esm'` flows through (`sdk/src/types/stats.ts:3-22`) |
| Async entry problem | Solved by `experiments.asyncStartup: true` (Rust-rewritten in 2.0 stable) — no more `import('./bootstrap')` dance, no more *"Shared module is not available for eager consumption"* |
| Config surface | **28 top-level plugin options**, and that count is provable: `packages/enhanced/src/schemas/container/ModuleFederationPlugin.json` sets `additionalProperties: false` |

### FynMesh

| | |
| --- | --- |
| Entry filename | **fixed** `fynapp-entry.js` |
| Output format | `format: "systemjs"` — required in practice |
| Exports | `init`, `get`, `container`, `__FYNAPP_MANIFEST__` (`demo/fynapp-1/dist/fynapp-entry.js:17-149`) |
| Non-entry chunks | **also bound**, via `_mfBind({n,f,c,s,e,v,b}, [importerDirs])` — no MF equivalent |
| Deferred registration | A chunk registering before its container exists queues in `$pC`, replayed on container arrival (`federation-js.ts:1975-1991`) |
| Native ESM | **not required, not produced** — everything is `System.register` loaded by injected classic `<script>` |

Two consequences of the SystemJS choice:

1. **You always ship the loader.** `system.js` + `federation-js.dev.js` must be paired
   (`federation-js/README.md:40-41`). MF's remotes need no shim.
2. **You get a mutable registry in return.** This is what makes §5's resolution model, the inspector,
   and `federation-combine` possible.

There is also a build-timing hazard on the FynMesh side worth flagging: entry generation waits on a
**wall-clock heuristic** — `makeAlarm` polls every 250 ms until only the entry module is unresolved
(`utils/timing.mts:21-72,81-100`), plus two hard `sleep(50)` calls (`index.mts:446,449`).
Webpack/Rspack MF has no equivalent timing dependency.

**One invariant FynMesh enforces that MF does not:** *"One File, One Address."* A module that
registered from its own file is filed under its URL with the specifier as a redirect, so both
spellings join a single record (`federation-js.ts:57-127`, `addIdUrlMap:1343-1444`,
`tests/one-file-one-address.test.ts`). This closes a duplicate-instance route that a code-split entry
otherwise walks into every time.

---

## 4. The manifest

Both projects concluded that `remoteEntry.js` alone is not enough for a host to plan. They landed in
different places.

### MF 2.0 — a typed, published protocol

`manifest: boolean | { filePath?, fileName?, disableAssetsAnalyze? }` emits **two** files:

- **`mf-manifest.json`** — runtime-facing, compact, stable. Schema in `packages/sdk/src/types/manifest.ts`:
  ```ts
  interface Manifest { id; name; metaData: StatsMetaData; shared: ManifestShared[];
                       remotes: ManifestRemote[]; exposes: ManifestExpose[]; }
  interface ManifestShared { id; name; version; singleton: boolean; requiredVersion: string;
                             hash; assets: StatsAssets; fallback?; fallbackName?; fallbackType?; }
  ```
  `metaData` carries `remoteEntry`, optional `ssrRemoteEntry`, `types: {path,name,api,zip}`,
  `buildInfo`, and a **mutually exclusive union** of `getPublicPath` vs `publicPath`/`ssrPublicPath`
  (`sdk/src/types/stats.ts:59-70`).
- **`mf-stats.json`** — full build stats: per-shared `deps/usedIn/usedExports`, per-remote
  `consumingFederationContainerName`, per-expose `file/requires/hash`.

The runtime converts a Manifest into a **Snapshot** (its pre-resolved form), and a deployment
platform can pre-generate Snapshots server-side to skip the manifest round trip entirely.

Downstream, the manifest is a **hard requirement** for: Chrome DevTools, resource preloading,
dynamic type hints, local proxying, and Next.js `flushChunks()`. `disableAssetsAnalyze: true` drops
`shared`/`exposes` and **disables preloading**.

### FynMesh — four artifacts, one embedded

See [`BUILD-ARTIFACTS.md`](./BUILD-ARTIFACTS.md) for the full reference.

| Artifact | Role |
| --- | --- |
| `fynapp.manifest.json` | Public contract: `name`, `version`, `exposes`, `consume-shared`, `provide-shared`, `import-exposed`, `shared-providers` |
| `__FYNAPP_MANIFEST__` | **The same manifest, spliced into `fynapp-entry.js`** |
| `federation.json` | Build/serving plumbing — chunk→expose map, share config. Nothing requires it |
| `federation.bundles.json` | Combined-bundle map, readable without executing anything |
| `__collected_shares.json` | Debug dump; nothing reads it |

**The embedded copy is the genuinely better idea here.** The kernel has to load the entry anyway to
get the container, so tier 1 of its four-tier resolution chain (`manifest-resolver.ts:152-191`) costs
**zero additional requests** — versus one extra round trip per app in MF, multiplied across the
dependency graph. MF has no equivalent; its manifest is always a separate fetch.

**Where FynMesh is behind:**

- **No versioned schema.** MF's is typed in a published SDK package and evolves under semver.
  FynMesh's is implicit — the emitted JSON carries no schema version, so a consumer has no way to
  tell which shape it is holding. (`FynAppManifest.exposes` in `core/kernel/src/types.ts:329-337`
  used to be declared wrong relative to what the build emits; that is now fixed and documented
  in-source, but nothing *versions* the shape.)
- **One consumer with no fallback.** `module-loader.ts:254-265` reads `__FYNAPP_MANIFEST__` straight
  off the container with optional chaining and no fetch fallback — if it's absent, middleware
  pre-loading is skipped **in silence**. The build-side risk here has been closed since
  `BUILD-ARTIFACTS.md` was written: a chunk whose placeholder can't be spliced is now a **hard build
  error** (`rollup-plugin-federation/src/index.mts:580-585`), not a `console.warn`. So the stub can no
  longer ship unnoticed. What remains is that `cfa check` still inspects the emitted *file*, never the
  embedded export.
- **Declared-but-never-produced fields.** `requires` is only ever set by the tier-4 *synthesized*
  manifest, and `middlewares` is walked nowhere in the kernel — the real middleware channel is
  `import-exposed` entries with `type: "middleware"`. `consume-shared` is read by nothing, and `sites`
  leaks absolute local paths.

---

## 5. Shared dependencies — the deepest divergence

This is the section that most justifies FynMesh's existence, and also where it has the sharpest
rough edges.

### 5.1 MF 2.0's algorithm

From `packages/runtime-core/src/utils/share.ts:355-477`:

1. Iterate `scopes` (from `shareInfo.scope`, default `DEFAULT_SCOPE`).
2. Pick a comparator by `shareStrategy`:
   - **`version-first`** (default, `:233`) — *highest version wins, but an already-loaded copy is sticky*.
   - **`loaded-first`** (`:284`) — loaded/loading copies win first; `versionLt` breaks ties.
3. `defaultResolver` (`:393`):
   - **singleton**: take the winner. If `requiredVersion` is a string and unsatisfied →
     `error()` when `strictVersion`, else `warn()`. **Returns the winner either way** — non-strict
     never falls back.
   - **non-singleton**: winner if it satisfies; else scan *all* registered versions for the first
     that does; else `undefined` → the consumer loads its own copy.
4. Fire the `resolveShare` waterfall. **Overriding `args.resolver` is the only way to change the
   outcome** — mutating `scope`/`version` does nothing.

`shareStrategy` has a second, under-appreciated effect (`runtime-core/src/shared/index.ts:576-586`):
**`version-first` eagerly loads *every* remote entry during `initializeSharing()`.** One offline
remote fires `errorLoadRemote({lifecycle:'beforeLoadShare'})` at startup and can hang
initialization. The source comment says version-first is slated for removal.

### 5.2 FynMesh's algorithm

From `federation-js.ts:645-1022`:

1. **Attribute the importer** — `parentURL` → container, or via the chunk's `_mfBind` binding
   (`:718-731`), which also yields `rvmMapData`: the importer directories bundled into that chunk.
2. **Scope isolation** (FYM-172) — the search is confined to the asking container's own scope
   (`:468-472`). A scope is a boundary, not a hint.
3. **Collect declared ranges — `matchRvm`** (`:1082-1147`). `rvm` maps *importer directory* → the
   range **that importer's own `package.json` declared**. A chunk bundles several importers, so
   **several ranges can apply to one import**.
4. **`satisfiesAll`** (`:1158-1165`) — a version is usable only if it satisfies **every** applicable range.
5. **`semverMatch`** (`:1175-1212`) — a `loadedOnly` pass first, then a pass allowing unloaded;
   **insertion order decides within each pass**.
6. **Singleton override** (`:944-961`).
7. **`pickShareSource`** (`:1239-1249`) — **first source wins, and the choice is memoised**.

### 5.3 The two things FynMesh can express that MF cannot

**(a) Per-importer version resolution.** MF resolves a share against *one* `requiredVersion` per
share key per container — the range the host build declared. FynMesh resolves against **the actual
declared constraints of the code doing the importing**, including transitive `node_modules`
importers, and requires all of them to hold simultaneously.

The `share-a-*` fixtures isolate this precisely. `share-a-nest` and `share-a-nest-2` have
**byte-identical `index.mjs`**; the only variable is the declared range in `package.json:24`. The
resolved version is therefore decided *purely* by the importer's declared range, not by anything in
the importing code.

**(b) Two versions of one share key inside one container.**
`sample-react-federation/dist/plugin-entry.js:52-61`:

```js
_container._S('share-a', {"requiredVersion":"2"}, [
  // importee: node_modules/share-a/index.mjs      from: src, node_modules/share-a-nest-2
  [[_f('./index-79236d5b.js'), "2.0.0"], ["src", "2"], ["%nm/share-a-nest-2", "^2.0.0"]],
  // importee: node_modules/.f/_/share-a/1.0.0.../index.mjs  from: node_modules/share-a-nest
  [[_f('./index-a197e853.js'), "1.0.0"], ["%nm/share-a-nest", "^1.0.0"]]
]);
```

One container, one share key, two versions in two chunks, with per-importer-directory ranges. Webpack
MF resolves one version per share key per scope per build; it cannot express this shape.

**(c) Versioned containers.** `fynapp-x1-v1` and `fynapp-x1-v2` both declare `name: "fynapp-x1"` at
versions 1.0.0 / 2.0.0, bound to React 18 and React 19, loaded into the same page simultaneously.
Consumers select at the import site:
`import('fynapp-x1/main', { with: { type: "mf-expose", semver: "^2.0.0" } })`. MF container names are
unique keys on `window`.

### 5.4 Where FynMesh is behind on sharing

| Gap | Detail |
| --- | --- |
| **Selection is load-order-first, not highest-satisfying** | `semverMatch` is first-match-wins over insertion order (`:1183-1198`), i.e. container declaration order = FynApp load order. Selecting the highest was considered and **explicitly rejected** (`notes/combined-module-bundles.md:789-799`). This is a real source of load-order sensitivity that MF does not have. |
| **`eager` unimplemented** | Accepted, emitted, read by nothing. Stated verbatim at `federation-js/src/types.ts:97-108`. |
| **No `strictVersion`** | Singleton mismatches always warn, never fail. |
| **No `shareStrategy`** | Behaviour is hard-coded loaded-first-within-a-satisfying-set. |
| **Per-share `shareScope` silently dropped** | The runtime honours `options.shareScope` (`container.ts:99`) but `PICK_SHARE_KEYS` omits it, so it is never emitted. |
| **Subpath exports are not shared** | Declaring `share-a` does not share `share-a/lib` — that must be its own key. MF solves this with trailing-slash prefix matching (`'react-dom/'`). |
| **Transitive deps must be listed manually** | *"A dependency consumed only transitively still has to appear in `shared` with its semver range… a mismatch shows up at runtime as a duplicate-instance error rather than a build failure"* (`rollup-plugin-federation/README.md:73-75`). Webpack MF auto-infers from `package.json`. |
| **No shared tree-shaking** | MF prunes a shared package to the exports a build actually references, keeping a full copy as fallback — antd 1404 KB → 344 KB reported. Opt-in per share, gated on `"sideEffects": false`, and the mode that delivers that number (`server-calc`) needs deploy-time infrastructure. Mechanism in §13 / [`MF2-DETAILS.md`](./MF2-DETAILS.md#1-shared-dependency-tree-shaking). |
| **Scope cannot be torn down** | A container's share scope has no teardown path. |

> **Note on a stale in-repo claim:** `rollup-federation/README.md:61-69` lists `singleton` as "Not
> implemented." It **is** implemented — enforced in `FederationJS.resolve`
> (`federation-js.ts:945-961`), documented at `types.ts:86-95`, and pinned by four tests at
> `tests/federation-js.test.ts:630-720`. A `grep` misses it because `federation-js.ts` contains a
> byte that makes grep treat the file as binary; use `grep -a`.

---

## 6. Remotes: how a consumer finds a producer

### MF 2.0

Build-time declaration:

```ts
remotes: {
  'manifest-provider':  'manifest_provider@http://localhost:3011/mf-manifest.json',
  'js-entry-provider':  'js_entry_provider@http://localhost:3012/remoteEntry.js',
}
```

A **manifest** entry unlocks dynamic type hints, resource preloading, and DevTools debugging. A
`remoteEntry.js` entry does not.

Runtime declaration:

```ts
registerRemotes([{ name: 'sub2', entry: 'http://localhost:2002/mf-manifest.json' }]);
registerRemotes([...], { force: true });  // overwrites loaded remotes AND deletes their module cache
```

Public path is handled by `getPublicPath` — a **stringified** function evaluated via `new Function`
(so it is a CSP `unsafe-eval` dependency), and **only effective when `exposes` is set**. The MF1
`'promise new Promise(...)'` remote pattern is gone from all MF2 docs.

### FynMesh

There is **no build-time `remotes` config at all.** Two cases that MF's remote model makes easy to
conflate are separate here.

**When containers are already loaded, no name→URL remote lookup occurs.** Each normal container is
self-sufficient, and loading it registers its modules in the shared loader registry. If A and B are
loaded by the same application, compatible shared-package imports resolve across their combined
records by the importer's semver constraints. An exposed-module import still names a FynApp/module
namespace and requires that container to be registered, but A does not pre-declare B's URL and B
does not pre-declare A's. Co-location is enough to federate their module records.

**When the requested FynApp is not loaded, the composition layer locates it.** The dependency is
named in *source*, via an import attribute:

```ts
import('fynapp-x1/main', { with: { type: "mf-expose", semver: "^2.0.0" } })
```

and bound at runtime by the kernel's registry resolver (`types.ts:363-373`):

```ts
type RegistryResolver = (name: string, range?: string) => Promise<{
  name: string; version: string; url: string; distBase?: string;
}>;
```

A host maps **(package name, semver range) → manifest URL** at runtime
(`demo/demo-server/templates/components/fynapp-loader.html:18-70`). **A host can swap which build
satisfies `fynapp-x1@^2.0.0` without rebuilding any consumer.**

The resolver is therefore a way to load an absent application dependency, not mandatory wiring for
every federated module import. The other non-self-sufficient case is an `import: false` consume-only
share: it deliberately carries no fallback, so the application, kernel, or bootstrap process must
load a satisfying producer before the consumer asks for it
(`rollup-federation/README.md:33-47`).

This is **not automatic network discovery**: `federation-js` resolves modules and containers already
present in its loader registry. The kernel's manifest graph and registry resolver are the higher
composition layer that can locate and load something absent; ordinary co-resident federation does
not depend on them.

MF2 does have runtime `registerRemotes`, but nothing **semver-range-keyed** — its resolution is by
name, and the version is whatever that URL happens to serve.

**On top of this, FynMesh builds a dependency graph.** The kernel reads manifests, derives edges from
`requires` + `import-exposed` + `shared-providers`, detects cycles, and loads in **topological
batches with bounded concurrency** (`manifest-resolver.ts:194-266`;
`kernel.loadFynAppsByName(reqs, { concurrency: 4 })`). MF loads remotes on demand with no notion of
inter-remote ordering.

### This is a philosophical difference, not a feature gap

The two models disagree about what a remote *is*, and that disagreement is the reason `federation-js`
was written.

**MF treats a remote as a name bound to a URL.** `registerRemotes([{ name, entry }])` pushes an entry
into a lookup table; whatever that URL serves is the version you get. Resolution is an act of
*wiring*, performed by whoever holds the table.

**FynMesh treats a remote as a dependency with a range** — the package-manager model, applied at
runtime. A consumer declares `fynapp-x1@^2.0.0` in source. A host supplies a resolver —
`setRegistryResolver((name, range) => …)`, a public kernel method callable at any point
(`kernel-core.ts:165`) — which answers *which build satisfies that range*. No consumer registers a
name→URL remote mapping.

The inversion is the point: **a resolver can implement a name→URL table, but a table cannot
implement semver resolution.** So this is not "FynMesh lacks `registerRemotes`" — the runtime
capability is present and strictly more general. What FynMesh omits is the imperative wiring model,
deliberately. Declaration plus resolution *is* the thesis, and the capabilities in §17 — per-importer
version resolution, two versions of one share key, versioned containers, swapping a build without
rebuilding consumers — are all downstream of this single choice. None of them are reachable from a
model where a remote is a name someone pointed at a URL.

**The result, at the call site: there is no remote table to register.** You ask for a FynApp by name
and the kernel works out the rest —

```ts
await kernel.loadFynAppsByName([{ name: "fynapp-1" }], { concurrency: 4 });
```

From that one call (`kernel-core.ts:234-242`) the kernel resolves the manifest, walks
`requires` + `import-exposed` + `shared-providers` to build the dependency graph, resolves every
shared module against the declared ranges of the code actually importing it, orders the result
topologically, and loads it in batches. No remote list, no host config enumerating what exists, no
remote-registration step — **load a FynApp normally and the plumbing is figured out for you.** MF's
equivalent starting point is a table someone has to populate and keep correct.

**Implementation notes** — sharp edges in what ships today, not costs of the model:

- The default browser resolver is a demo stub: it ignores `range`, hardcodes `version: "0.0.0"`, and
  maps name to a path convention (`browser-kernel.ts:200-207`). The design is the resolver
  *interface*; a real deployment supplies its own. The shipped default is not an example of it.
- `FynAppRegistry` keys each app under **both** `name@version` and bare `name`
  (`fynapp-registry.ts:22,30-32`). Versioned keys coexist without issue; the bare-name alias is
  last-write-wins. The sharp edge is in the alias, not an inability to hold two versions
  (`notes/KERNEL_PRINCIPAL_REVIEW.md` #6 flags the dual-key ambiguity).

---

## 7. Extensibility: runtime plugins vs middleware

The two projects solved *different* extensibility problems, and each has essentially nothing where
the other is strong.

### MF 2.0 — ~40 runtime hooks

Four separate `PluginSystem` instances. Verified from source:

| Group | Hooks |
| --- | --- |
| **core** (`runtime-core/src/core.ts:77`) | `beforeInit` (SyncWaterfall) · `init` · `beforeInitContainer` · `initContainer` |
| **loader** (`core.ts:123`) | `getModuleInfo` · `createScript` · `createLink` · `fetch` · `loadEntryError` · `afterLoadEntry` · `beforeInitRemote` · `afterInitRemote` · `beforeGetExpose` · `afterGetExpose` · `beforeExecuteFactory` · `afterExecuteFactory` · `getModuleFactory` |
| **bridge** (`core.ts:288`) | `beforeBridgeRender` · `afterBridgeRender` · `beforeBridgeDestroy` · `afterBridgeDestroy` · `afterBridgeRouteSync` |
| **remote** (`remote/index.ts:67`) | `beforeRegisterRemote` · `registerRemote` · `beforeRequest` · `afterMatchRemote` · `onLoad` · `afterLoadRemote` · `handlePreloadModule` · `errorLoadRemote` · `beforePreloadRemote` · `generatePreloadAssets` · `afterPreloadRemote` · `loadEntry` |
| **shared** (`shared/index.ts:54`) | `beforeRegisterShare` · `afterRegisterShare` · `afterResolve` · `beforeLoadShare` · `loadShare` · `afterLoadShare` · `errorLoadShare` · `resolveShare` · `initContainerShareScopeMap` |
| **snapshot** (`SnapshotHandler.ts:78`) | `beforeLoadRemoteSnapshot` · `loadSnapshot` · `loadRemoteSnapshot` · `afterLoadSnapshot` · `beforeLoadManifest` · `afterLoadManifest` |

`createScript` returning the real DOM element is what makes SRI/nonce/timeout policy possible at all
(§15). `loadEntry` is full remote-type extensibility — you can load raw JSON or delegate modules
through it. Official plugins: `retry-plugin`, `observability-plugin`, `node/runtimePlugin`,
`inject-external-runtime-core-plugin`, `lazyLoadComponentPlugin`.

### FynMesh — no runtime hooks, but an application middleware layer

`federation-js` has **no plugin or hook system whatsoever** — verified, `grep` for
`hook|plugin|addEventListener|dispatchEvent|emit(` over `src/` returns only prose comments. This is a
clear, unambiguous gap.

What FynMesh has instead operates one layer up: **middleware**, a cross-app dependency-injection +
lifecycle system in the kernel. MF has nothing comparable.

**Provider side** — export anything prefixed `__middleware__` from an expose keyed `./middleware*`:

```ts
export const __middleware__BasicCounter: FynAppMiddleware = {
  name: "basic-counter",
  async setup(cc) { ... },
  apply(cc) { ... },
};
```

The kernel eagerly loads every `./middleware*` expose at bootstrap (`kernel-core.ts:402-412`), scans
for `__middleware__*` exports (`middleware-manager.ts:298-312`), and registers under
`"<fynapp>::<mw.name>"` / `"<fynapp>@<version>::<mw.name>"` — **keyed by `mw.name`, not the export name**.

**Consumer side** — `useMiddleware` is a pure tagging function (`use-middleware.ts:22-28`):

```ts
return useMiddleware(
  [{ mw: import("fynapp-react-middleware/main/basic-counter",
                { with: { type: "fynapp-middleware" } }),
     config: config.counterConfig }],
  middlewareUser
);
```

That `import()` **never becomes a real import** — `renderDynamicImport` rewrites it to the id string
`-FYNAPP_MIDDLEWARE <package> <path> <semver>`, parsed by the kernel at `util.ts:147-186`.

**The interface** (`types.ts:206-222`):

```ts
type FynAppMiddleware = {
  name: string;
  autoApplyScope?: ("all" | "fynapp" | "middleware")[];
  shouldApply?(fynApp): boolean;
  setup?(cc): Promise<{ status: string; share?: any } | void>;
  apply?(cc): Promise<void> | void;
  canOverrideExecution?(fynApp, fynUnit): boolean;
  overrideInitialize?(cc): Promise<{ status; mode? }>;
  overrideExecute?(cc): Promise<void>;
};
```

**Four execution phases** (`middleware-executor.ts:372-433`): Setup → Initialize → Apply → Execute,
with `defer` / `retry` / `ready` statuses, bounded retries (setup gets **at most 2 passes**), and a
`"middleware_only"` degraded mode for units that declared `deferOk`.

The standout capability is **execution override**: a middleware whose `canOverrideExecution` matches
replaces the FynApp's own `initialize`/`execute` outright (`util.ts:46-129`). Two constraints that
are easy to miss — **only auto-apply middleware can override** (`findExecutionOverride` reads the
auto-apply lists only, so anything pulled in by `useMiddleware()` never can), and the winner is
**first by registration order**, not by any priority.

This is the precise thing MF's plugin system cannot do. MF's ~40 hooks all intercept the **loader**;
none of them can intercept the *consumer's execution*.

**Middleware version resolution** (`types.ts:304-315`): a range picks the highest registered
satisfying version; an unsatisfiable range **warns and falls back to `default`** rather than failing.
`default` holds whichever version registered *first* and is never re-pointed (FYM-332) — the
reasoning is worth quoting, because it's the kind of decision MF hasn't had to make:

> pointing `default` at the highest version was rejected because a second version can register at any
> time as another FynApp mounts, so `default` would change under a running page — *"that trades a
> surprise you can read off the load order for one you cannot reproduce."*

**Known weakness:** middleware defer has **no timeout**. A provider that never arrives parks the
consumer indefinitely.

---

## 8. Application model and lifecycle

This axis barely exists in MF, and is most of what FynMesh is.

**MF exposes modules. It does not manage them.** There is no lifecycle, no app registry, no
inter-remote messaging. The *Bridge* packages (`@module-federation/bridge-react`, `bridge-vue3`) are
the closest thing: a DOM rendering abstraction where a remote exports
`{ render({dom, basename, memoryRoute}), destroy({dom}) }`, wrapped host-side by
`createRemoteAppComponent({ loader, loading, fallback, export?, props? })`. That gives you mount /
unmount and router isolation via `memoryRoute`, for React 16–19 and Vue 3 only.
(`createRemoteComponent` is deprecated in the shipped `.d.ts`.)

**FynMesh has a contract:**

```ts
interface FynUnit {
  initialize?(runtime): Promise<{ status: string; mode?: string }>;
  execute(runtime): Promise<any>;
  shutdown?(runtime): Promise<void> | void;
  suspend?(runtime): Promise<void> | void;
  resume?(runtime): Promise<void> | void;
}
```

backed by kernel APIs `shutdownFynApp` / `suspendFynApp` / `resumeFynApp`, observable state
(`getFynAppState`, `listFynAppStates`; states `bootstrapping | mounted | suspended | failed |
shutdown`), per-app error boundaries so a failed bootstrap doesn't take siblings down, and events
`FYNAPP_BOOTSTRAPPED` / `_FAILED` / `_TIMEOUT` / `_SHUTDOWN` / `_SUSPENDED` / `_RESUMED` /
`MIDDLEWARE_READY`.

Plus **FynBus** — platform-stamped pub/sub, request/response where `request()` waits for a handler
that hasn't loaded yet (`fyn-bus.ts:80-99`), and `channel()` scoping, with subscriptions auto-cleaned
on shutdown. And **bootstrap coordination**: a lock, a deferred queue, `findProviderForMiddleware`,
and a 30 s timeout (`bootstrap-coordinator.ts`) — though the lock is **global page-wide**, which is a
scalability concern.

**Both projects deliberately exclude routing.** FynMesh's position is documented as *"zero-kernel
routing… Shell app owns all routing concerns"* (`design/DESIGN-REVIEW-2025-11-02.md:158-170`); there
is not one occurrence of `route`/`router`/`navigat` in `core/kernel/src/`. MF has no router either.
This is a wash — but FynMesh's "framework" positioning invites the question more loudly.

**One structural asymmetry in integration model worth noting:** `@fynmesh/kernel` **ships no kernel**.
`src/index.ts:1-9` exports 8 modules — types and utilities. `FynMeshKernelCore`, `BrowserKernel`,
`createBrowserKernel` are *not* exported. The implementation is a prebuilt IIFE that self-installs on
`globalThis.fynMeshKernel`. So a consumer **imports types and gets the runtime from a script tag** —
materially different from MF, where the bundler plugin bundles the runtime into your app.

---

## 9. TypeScript

**MF 2.0: a complete, shipped type-federation system.** `dts: boolean | PluginDtsOptions`, default
**`true`**.

- Producer compiles its exposes and emits `@mf-types.zip` + `@mf-types.d.ts`
  (`dts-plugin/src/core/lib/archiveHandler.ts`, `adm-zip`).
- Consumer downloads and unpacks into `./@mf-types`; wire it up with
  `paths: { "*": ["./@mf-types/*"] }` and `include: ["./@mf-types/*"]`.
- URL resolution: sibling `@mf-types.zip` for a `remoteEntry.js` entry; from `metaData.types` for a
  manifest entry.
- **Live type reload in dev** over a WebSocket server on port **16322**, with a `live-reload.js` IIFE
  unshifted into every entry.
- `compilerInstance` supports `tsc | tsgo | vue-tsc | tspc`. CLI: `npx mf dts`.
- Caveats: types are **not** downloaded when `NODE_ENV==='production'` unless `typesOnBuild: true`;
  webpack users must add `'**/@mf-types/**'` to `watchOptions.ignored` or compilation loops forever.

**FynMesh: none.** `grep -rn "dts" rollup-plugin-federation/src README.md` → **0 hits**. No type
generation, no remote type download, no type manifest. Cross-app imports are typed by
`declare module "fynapp-*"`, which makes **every cross-app import `any`**. It is not on the roadmap.

For a framework whose selling point is independently deployed teams sharing code, this is the widest
day-to-day developer-experience gap in the comparison.

---

## 10. DevTools and observability

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| Form factor | **Chrome extension** (store id `aeoilchhomapofiopejjlecddfldpeom`), adds a "Module Federation" DevTools tab | **In-page overlay**, `Ctrl+Shift+M`, Preact + signals in a Shadow DOM |
| Size / status | `@module-federation/devtools@2.9.0` | 16,462 LOC, `federation-inspector@0.1.0`, `private: true` |
| Requires app cooperation | **Yes — `mf-manifest.json` is a hard requirement** | **No** — reads the loader's record-exposure API |
| Panels | Proxy · Module Info · Dependency Graph · Shared · Loading Trace | Modules · Graph (ELK) · Containers · Shares · Issues · Middleware · FynApps · Raw |
| Killer feature | **Proxy** — redirect a producer to `localhost:3000/mf-manifest.json`, keeping HMR, per-tab isolated | **Issues** — 24 named diagnostics |
| Diagnostics depth | Whether `singleton`/`strictVersion` took effect; tree-shaking status tags (`Tree Shaking Loaded` / `Loading` / `Loaded` = fell back to full) | `singleton-multiple-copies`, `range-unsatisfied`, `duplicate-address`, `dependency-cycle`, `orphan-modules`, `fynmesh-provider-mismatch`, `middleware-auto-apply-undelivered`, … |
| Trace export | ✅ JSON with `config`, `scopes`, `reports`, `diagnosis`, `summary.outcome` | ❌ |
| Agent-facing CLI | ✅ **Divebell** — `divebell mf status\|module-info\|remote trace\|shared status\|module-perf` | ❌ |
| Telemetry | `observability-plugin` (2.6.0); Node variant writes `.mf/observability/latest.json` + `events.jsonl` | `KernelTelemetry` built (~25 capture points) but **inert by default** — no entry point passes a `TelemetryConfig` |
| Debug globals | `__FEDERATION__`, `__SHARE__`, `__INSTANCES__`, `__PRELOADED_MAP__`; `FEDERATION_DEBUG=true` | `Federation.__I()`, `kernel.__I()` — both mangle-proof and `structuredClone`-safe |

**FynMesh's genuine differentiator here** is `Federation.__I()`: per (chunk, share key) it returns
the importer-declared ranges, **the ranges resolution actually applied**, and every registered
version this runtime's semver accepts (`federation-js.ts:2271-2323`). That is *share-resolution
reasoning*, not just topology — MF's DevTools shows you what happened, not the constraint set that
produced it. The inspector is also **framework-free, page-droppable, and needs no cooperation from
the app**, which MF's manifest requirement rules out.

**But MF ships an extension and FynMesh does not.** FynMesh's Chrome extension is
**deliberately cancelled** (FYM-31, `wont_do`) — `adapters/remote.ts` ships both ends of a
`postMessage` bridge so packaging one is not a rewrite, but it isn't built.

> ⚠️ **Repo hygiene:** three in-repo docs disagree on the inspector's status.
> `notes/federation-inspector-design.md:9` says *"Status: design"*; the same file at `:625` says
> *"Built"*; `notes/TODO.md:58-64` lists it unchecked. **The code on disk is authoritative — it is built.**

---

## 11. Server-side rendering

**MF 2.0:**

| Target | State |
| --- | --- |
| Modern.js v3 | ✅ flagship — **stream SSR only**, *"no difference… compared to CSR"* |
| Rsbuild `target:'node'` + `environment:'ssr'` | ✅ |
| Rslib / Rspress `target:'dual'` | ✅ |
| raw webpack/Rspack + `@module-federation/node` | ✅ |
| Vite | 🟡 `ssrEntryLoader.strategy: 'temp-file'\|'vm'`, `experiments.ssrMode:'ISLAND'` |
| Next.js Pages Router | 🟡 deprecated |
| Next.js App Router | ❌ |
| Angular | 🟡 Nx-only |
| Nuxt / RSC | ❌ roadmap |

`@module-federation/node@2.7.50` exports `NodeFederationPlugin`, `StreamingTargetPlugin`,
`UniversalFederationPlugin`, `ChunkCorrelationPlugin`, `RemotePublicPathPlugin`, and a runtime plugin
that patches `__webpack_require__` chunk loading to resolve from **filesystem or HTTP**. The manifest
carries `metaData.ssrRemoteEntry` and `metaData.ssrPublicPath` for exactly this.

**FynMesh: does not exist, and is structurally several steps away.**

- `notes/TODO.md:116-119` — SSR is Long-Term Priority #11, all three items unchecked.
- `serializeState()` / `hydrateState()` are proposed in `design/routing-architecture.md:737-755` and
  **neither symbol exists in `core/kernel/src/`**.
- `NodeKernel` exists (`node-kernel.ts:9-49`) but is a **stub that bypasses federation entirely** —
  plain `await import(urlPath)` at `:31`.
- Three documented structural blockers: the Node target is explicitly parked
  (`notes/overhaul.md:39`); `system-node` has **no terminal base `instantiate`** (`:981-983`); and
  `ManifestResolver` uses browser globals such that *"NodeKernel cannot use ManifestResolver without
  polyfills"* (`KERNEL_PRINCIPAL_REVIEW.md:100-109`).

**This is the single widest gap in the comparison.**

---

## 12. Errors and resilience

### MF 2.0

A real error taxonomy (`packages/error-codes/src/error-codes.ts`) — **18 codes**: `RUNTIME-001..015`,
`BUILD-001/002`, `TYPE-001`, each with a documented message and a stable troubleshooting anchor.

`errorLoadRemote` has **four** lifecycle values, and the expected return differs by each:

| `lifecycle` | Return |
| --- | --- |
| `'onLoad'` | a module factory: `() => ({ __esModule: true, default: Fallback })` |
| `'afterResolve'` | a **backup manifest/snapshot object** |
| `'beforeLoadShare'` | `() => ({ __esModule: true, default: {} })`, or an `{init, get}` stub |
| `'beforeRequest'` | generally `undefined` |

A logging plugin returning `undefined` does **not** clear another plugin's fallback.

`@module-federation/retry-plugin@2.9.0` — flat options (`retryTimes`, `retryDelay` as number or
`(attempt) => number`, `domains[]` rotated per retry, `manifestDomains[]`, `getRetryPath`, `addQuery`,
`onRetry`/`onSuccess`/`onError`). It implements only two hooks — `fetch` and `loadEntryError`.
`addQuery` auto-enables for `esm`/`module` remotes because **browsers cache failed dynamic imports by
URL**.

Three-layer strategy: network (retry plugin) → loading (`errorLoadRemote`) → rendering
(`ErrorBoundary` + `Suspense`, or Bridge's declarative `fallback` prop).

### FynMesh

- `federation-js`: two named share errors; conflicts and singleton mismatches **warn**, never fail.
- Kernel: **19 error codes**, a `KernelError` hierarchy, per-app isolation (`loadFynApp` returns
  `null` rather than throwing through), and a dev error overlay.
- **No retry, no domain rotation, no fallback remote mechanism, no `errorLoadRemote` equivalent** —
  there are no runtime hooks to hang one on (§7).
- ⚠️ **All diagnostics vanish in production** — `drop_console: true` in the terser config. A missing
  provider degrades to a **silently blank region** rather than a catchable error.

---

## 13. Performance

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| Preload API | `preloadRemote([{nameOrAlias, exposes?, resourceCategory?, depsRemote?, filter?, recordPreloadedAssets?}])` | `kernel.tryPreload(url, depth)`, `warmPreload(requests)` |
| Preload granularity | Per-expose, per-resource-category, with a `filter(assetUrl)` | **Depth-bounded only** |
| Priority | `rel=modulepreload fetchpriority=high` for ESM remotes; `<script fetchpriority="high">` | ❌ **`PreloadPriority`/`priorityByDepth` are written once as defaults and never read.** No `fetchpriority` is ever set. |
| Preload result reporting | Promise rejects with `error.results[]` carrying per-URL `status: success\|error\|timeout\|cached` | ❌ |
| Link type | `preload as=script` / `as=style` / `modulepreload` | **Deliberately `preload as=script`, never `modulepreload`** — entries are `System.register` loaded by injected classic scripts, so a modulepreload would fetch in CORS mode and double-fetch (`browser-kernel.ts:89-99`) |
| Data prefetch | 🟡 `<Component>.data.ts` exporting `fetchData` → injected as `mfData`; `instance.prefetch({id, dataFetchParams})` | ❌ |
| Shared tree-shaking | ✅ `runtime-infer` / `server-calc`; antd 1404 KB → 344 KB reported, opt-in per share | ❌ |
| Runtime size knobs | ✅ `experiments.optimization.{disableRemote (−27.7%), disableShared (−31.6%), disableSnapshot}` off a 73,154 B baseline | ❌ |
| Chunk combination | ❌ | ✅ **`federation-combine`** |

**`federation-combine` is FynMesh's unique performance asset.** A post-build CLI folds many small
federated chunks into combined files **without changing any module's identity** — each still
registers under its own fileName. `Federation._B()` / `declareBundles(map, distBase)` let a host
declare the map *before any entry runs*, so a preload hint names the file that will **really** be
fetched rather than a member the runtime will never request. A stale map degrades to one extra
request, not a broken page.

This matters because it attacks the problem MF's preloading cannot: federation's natural output is
*many small chunks*, and per-chunk HTTP cost is the dominant waterfall term
(see [`SHELL_LOAD_PERF.md`](./SHELL_LOAD_PERF.md)).

MF's counterpart advantage is that it attacks **bytes** (tree-shaking shared deps) while FynMesh
attacks **requests**. They are complementary, and neither has the other's.

### How MF's shared tree-shaking actually works

Worth stating, because the headline number is easy to over-read. Full trace in
[`MF2-DETAILS.md §1`](./MF2-DETAILS.md#1-shared-dependency-tree-shaking).

A build that opts in (`shared: { antd: { treeShaking: { mode } } }` — **off by default**, per share)
emits **two** copies of the package. The copy inside its own bundle is **pruned** to the exports it
referenced; a separately compiled standalone container holds the **full** package. At runtime a plugin
swaps the getters — `get` → full container, `treeShaking.get` → pruned copy — and a decision function
picks one per consumer. Every failure path resolves to the full copy; there are eight such paths.

Three things bound the win:

1. **`"sideEffects": false` is a hard gate.** If webpack can't prove the real module side-effect free,
   the referenced-export set is cleared and nothing is pruned — silently. An `import()` webpack
   resolves opaquely drops the share key entirely.
2. **The cheap mode under-delivers.** `runtime-infer` is supposed to reuse a loaded pruned copy when
   it covers the consumer, but the bundler emits only `{mode}` into the runtime's share record — never
   the *candidate's* used-export set — so the subset check has no data and degenerates to "prefer the
   pruned copy." Its own docs concede this breaks `singleton`: two apps can end up with a minimal and
   a full antd on one page, *"style conflicts, non-shared state, or even crashes."* Raising the hit
   rate means hand-writing the other app's exports into your config — which the official demo does, in
   both directions.
3. **The expensive mode needs a platform.** `server-calc` is where the 75% lives. It requires a build
   service (`@module-federation/treeshake-server`: tmp project → `pnpm i` → Rspack build → CDN upload),
   **a CI step you write yourself** that unions `usedExports` across every app's `mf-stats.json`, and a
   third step that writes `secondarySharedTreeShakingEntry` + `treeShakingStatus` into the snapshot.
   The server takes a pre-computed union; it does not aggregate.

So the comparison is not "MF shakes shared deps, FynMesh doesn't." It is that MF built a
**deployment-platform-shaped** answer to shared bytes — same bet as its manifest protocol (§4) — and
the cheap on-ramp is materially weaker than the number suggests. The structural prerequisite FynMesh
would have to answer first is identity, not algorithm: MF can hold a pruned and a full shape of the
same version because they are two slots on one share entry, which is exactly what *"One File, One
Address"* (§3) exists to forbid.

> **Caveat on MF's data prefetch:** this area was rearchitected, not merely extended.
> `@module-federation/data-prefetch` — the `prefetchInterface` / `*.prefetch.ts` convention — was
> **deleted** from the repo in commit `13b1e843e` (2026-04-28). The replacement is bridge-react's
> "Data Fetch", and it is narrower than the thing it replaced: **component-level only, nested
> producers unsupported, React-only, and only the Rslib and Modern.js plugins can create a Data
> Loader.** Treat any pre-2.4 MF prefetch documentation as dead.

---

## 14. Bundler and framework reach

### MF 2.0

| Target | Package | Version | State |
| --- | --- | --- | --- |
| webpack 5 | `@module-federation/enhanced/webpack` | 2.9.0 | ✅ reference — including the full TS implementation of shared tree-shaking, auto-applied whenever `shared` exists |
| **Rspack** | `@module-federation/enhanced/rspack` | 2.9.0 | ✅ **recommended** — native (Rust) shared tree-shaking, though the path pins an `@rspack-canary` build and `ModuleFederationPlugin` does not auto-apply it |
| Rsbuild / Rslib | `@module-federation/rsbuild-plugin` | 2.9.0 | ✅ |
| **Vite 5–8** | `@module-federation/vite` | **1.21.6** | ✅ mature — but a **separate repo and release line**, not in `module-federation/core`; build target `chrome89`+ |
| Rollup / Rolldown | via `@module-federation/vite` | 1.21.6 | ✅ / 🟡 — **no standalone rollup plugin exists** |
| esbuild | `@module-federation/esbuild` | 0.0.114 | ❌ prototype — zero peerDependencies, no website docs |
| Metro / React Native | `@module-federation/metro` | 2.9.0 | 🟡 *"still experimental"*; version-locked (`metro ^0.82.1`, RN ≥0.79, React ≥19) and **drops 16 of the 28 plugin options**. No RN example exists in the examples repo. |
| Modern.js v3 | `@module-federation/modern-js-v3` | 2.9.0 | ✅ richest integration |
| Next.js Pages | `@module-federation/nextjs-mf` | 8.8.74 | ⚠️ **officially deprecated** (`:::danger Support for Next.js is ending`) |
| Next.js App Router | — | — | ❌ |
| Angular | `@angular-architects/module-federation` (3rd-party) | 22.0.0 | ✅ community only — **no first-party package** |
| Nuxt | `@module-federation/nuxt` | 0.1.0 | ❌ pre-1.0 |

Cross-bundler interop is real and documented: a Vite host consumes a webpack remote with
`{ type: 'var', entryGlobalName: 'wpRemote' }`; a webpack host consumes a Vite remote via
`varFilename: 'varRemoteEntry.js'`. A three-bundler demo exists.

Framework bridges: **React 16–19 and Vue 3 only**, first-party. No Vue 2, Angular, Svelte or Solid
bridge. Two sharp edges worth knowing: the producer's `createBridgeComponent` is selected **by import
path per React major** (`.` = 16/17, `/v18`, `/v19`), and **React 19 reached through the legacy entry
is a hard throw** — which the source itself notes can happen in a React 16 app, because MF sharing can
make the *detected* version 19. And `bridge-react-webpack-plugin` **throws** if `react-router-dom`
appears in `shared`, since it aliases `react-router-dom$` to its own v5/v6/v7 wrappers.

### FynMesh

**Rollup only, and effectively SystemJS-output only.**
`grep -rni "vite|esbuild|webpack|rspack|parcel|unplugin" rollup-plugin-federation/src/` → **0 hits**.
No adapters, no unplugin layer, no peerDependencies at all.

Framework coverage is the inverse shape: no bridges, but the demo proves the loader is framework-
agnostic across **React 18/19, Vue, Marko, Preact, Solid, Svelte** — ~25 demo FynApps.

Browser posture:

- **Modern browsers only** — ES2020, no ES5/IE11 (`systemjs/README.md:181-186`). `Promise`, `fetch`,
  `Symbol`, `URL` and constructable stylesheets assumed native.
- **No import maps.** The fork *deleted* DOM auto-discovery (SJS-13) — `processScripts`, both script
  types, the `DOMContentLoaded` rescan. Maps can only be installed programmatically via
  `addImportMap(json, mapBase)`. Precedence is explicit: `System.registrations` is consulted
  **before** the import map, because *"a caller that explicitly handed the loader a module means it."*
- **Native ESM is not required** — and not emitted.

---

## 15. Security and isolation

**Neither project has a security story. This is a genuine tie, and both are weak.**

**MF 2.0:** zero hits for `integrity`, `subresource`, `nonce`, or `content-security-policy` across
the published docs. The local repo has `arch-doc/security-architecture.md` (501 lines, with sections
on CSP, trust boundaries, SRI, remote-entry validation, sandboxing) — but **do not read that as
evidence of shipped capability.** `arch-doc/` is AI-generated internal design documentation: only 7
of its 27 files cite a real source path, one commit in its history is literally titled *"correct
factual inaccuracies in architecture docs"*, and `bundler-integration-vite-rollup.md` describes eight
APIs that do not exist. Nothing in it is published on the docs site or implemented in `packages/`.

What you actually get is the `createScript` / `createLink` hooks, which return the real DOM element:

```ts
createScript({ url }) {
  const script = document.createElement('script');
  script.src = url;
  script.setAttribute('crossorigin', 'anonymous');
  return { script, timeout: 30000 };
}
```

So SRI is *possible* but entirely DIY (see module-federation/core discussion #2240).

**Isolation is explicitly declined**, and the reasoning is worth reading because it applies verbatim
to FynMesh (`/guide/basic/css-isolate.md`):

> *"CSS isolation can conflict significantly with shared dependencies. Shared dependencies aim to
> reuse common dependencies as much as possible, which can lead to some shared dependencies escaping
> the sandbox, making isolation uncontrollable."*

MF's only mitigation is **inspection before trust** — the Side Effect Scanner CLI, which statically
reports a remote's global-variable writes, event listeners, and CSS selector scope.

**FynMesh:** no SRI, no CSP guidance, no sandboxing, and — unlike MF — **no hook to add them at**,
because there is no runtime plugin system. Security is epic FYM-8 (FYM-46..48), unbuilt.

FynMesh does have one structural advantage that could become a security asset: the inspector's
issue analysis already answers "what actually loaded, from where, at which version, satisfying which
constraints" without app cooperation. That is the raw material for a supply-chain check MF would need
a plugin to gather.

**One MF-specific security note:** `getPublicPath` is `new Function`-evaluated, making it a CSP
`unsafe-eval` dependency.

---

## 16. Distribution and maturity

FynMesh is installable. What it does not have is an ecosystem, and that gap is not close.

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| npm | **43 packages published**, lockstep-versioned at 2.9.0 | **4 packages published** since 2026-08-12, last updated 2026-09-08: `federation-js@1.1.3`, `@fynmesh/kernel@1.1.3`, `rollup-plugin-federation@1.1.2`, `create-fynapp@1.1.5` |
| Download volume | `@module-federation/runtime` ~42.9M/mo, `enhanced` ~15.4M/mo | ~500–900/mo per package — consistent with CI and mirrors, not adoption |
| Backing | ByteDance Web Infra + Zack Jackson (original MF author) | Single maintainer |
| Docs | Full site, `llms.txt`, every page served as raw `.md` | In-repo notes, with **~18 catalogued contradictions** — 5 in the kernel README alone |
| Adoption | Rspack, Modern.js, Rsbuild, Rspress, Storybook, Zephyr Cloud | Demo only |
| Tests | Extensive, multi-bundler e2e, Playwright | Present and meaningful (share semantics are test-pinned) |
| Deployment-platform integration | `mf-manifest.json` is explicitly a protocol for deployment services; Snapshots can be pre-generated server-side | ❌ |

**Also structurally weaker in FynMesh, from its own review docs:**

- **No config system at all** — `KernelConfig` is entirely dead code.
- Bootstrap lock is **global page-wide**.
- Middleware defer has **no timeout**.
- `FynAppRegistry.remove` has a latent bug; the app registry has no semver matching and silently
  overwrites on name collision.
- Open defects G7/G8 (double execution)/G10/G11; kernel risks #2/#4/#6/#8 from
  `KERNEL_PRINCIPAL_REVIEW.md` still open.
- Security, observability-by-default, and platform middleware epics unbuilt.

---

## 17. Scorecard

### Where FynMesh is genuinely ahead

Ordered by how hard each would be to replicate in MF. Items 1–4 are not scorecard wins — they are
the reason the project exists, and the reason a loader registry was chosen over a bundler runtime.

1. **Per-importer version resolution (`rvm`).** Resolution against the *actual declared constraints of
   the importing code*, including transitive `node_modules` importers, with all applicable ranges
   required to hold. MF resolves against one `requiredVersion` per key per container.
2. **Two versions of one share key inside one container.** Structurally impossible in MF.
3. **Versioned containers + semver container selection.** Two builds publishing the same container
   name at different versions into one page. MF container names are unique globals.
4. **Runtime, semver-keyed remote resolution — and therefore no consumer-owned remote-registration
   step.** Load a FynApp by name and the kernel derives the rest: graph, shares, order. Swap which
   build satisfies
   `fynapp-x1@^2.0.0` without rebuilding any consumer. MF's `registerRemotes` is a name-keyed table
   someone must populate and keep correct. This is the foundational difference (§6), not a feature
   comparison.
5. **Cross-app dependency graph with topological batching.** MF has no notion of inter-remote ordering.
6. **The middleware system.** A cross-app DI + lifecycle layer with execution override. MF has no
   application-level extension layer at all.
7. **A lifecycle contract** (`FynUnit`) with kernel-side state, per-app error boundaries, and events.
8. **FynBus** — pub/sub + RPC with late-handler waiting.
9. **Embedded manifest** — full contract at zero extra requests.
10. **`federation-combine`** — request-count optimization with identity preservation and pre-execution
    bundle declaration.
11. **Runtime cost that does not scale with app count.** The loader is fetched once (~8.7 KB gz);
    MF embeds ~26 KB gz into every independently-built artifact. Structural, not tunable — MF's
    runtime is a module in each build's graph (§1).
12. **`Federation.__I()`** — share-resolution *reasoning*, not just topology.
13. **Zero-cooperation inspector**, enabled by the loader's record-exposure API.
14. **`renderDynamicImport` as a user-extensible import protocol**, with a build-time guard.
15. **The "One File, One Address" invariant**, enforced and diagnosed.

### Where MF 2.0 is genuinely ahead

1. **SSR.** Real, multi-target, manifest-integrated. FynMesh has none and is several steps away.
2. **Federated TypeScript types.** Complete, with live dev reload. FynMesh has nothing.
3. **The runtime plugin system.** ~40 hooks. FynMesh has zero — and this is what blocks retry,
   fallbacks, SRI, and third-party observability from ever being addable without core changes.
4. **Bundler reach.** webpack + Rspack + Vite + Rsbuild + Metro, with documented cross-bundler
   interop. FynMesh is rollup + SystemJS only.
5. **A versioned, published manifest schema** designed as a deployment-platform protocol.
6. **Shared tree-shaking.** ~75% reported on antd — the one axis that attacks *bytes inside shared
   dependencies*, which `federation-combine` does not touch. Caveated: opt-in, `sideEffects`-gated,
   and the mode that delivers that number needs a deploy-time build service plus a CI aggregator (§13).
7. **Sharing ergonomics** — `shareKey`/`request`, subpath prefix matching, auto-inferred versions,
   per-share scopes, layers, working `eager`, `strictVersion`, `shareStrategy`.
8. **Resilience** — `retry-plugin`, four-lifecycle `errorLoadRemote`, an error-code taxonomy.
9. **Preload sophistication** — per-expose, filtered, prioritized, with per-URL result reporting.
10. **A shipped Chrome extension**, plus an agent-facing CLI (Divebell).
11. **Data prefetch** as an isomorphic, first-class concern.
12. **Framework bridges** with router isolation.
13. **Ecosystem and adoption.** The decisive one — not distribution, which FynMesh now has, but
    the four orders of magnitude of usage, integrations, and third-party investment behind it.

### Where they're even

- **Security and isolation.** Neither has SRI, CSP guidance, or sandboxing. MF at least has a hook to
  add SRI at; FynMesh does not.
- **Routing.** Both deliberately exclude it.
- **Framework agnosticism at the loader level.** Both work with anything; MF adds bridges for two
  frameworks, FynMesh proves six in demos.

---

## 18. If FynMesh wanted to close the gaps

Ranked by leverage-to-effort, based on what the code already supports.

| # | Gap | Why it's next | Rough shape |
| --- | --- | --- | --- |
| 1 | **A runtime hook system in `federation-js`** | It is the **unblocker for five other gaps** — retry, fallbacks, SRI, third-party telemetry, and custom remote types all need somewhere to attach. Today none of them are addable without editing core. | Mirror MF's grouping: `beforeResolve`/`afterResolve`/`onLoad`/`errorLoad` + `createScript`. `System.hook` is already typed in the fork. |
| 2 | **Highest-satisfying share selection, or make it configurable** | Load-order sensitivity is the most likely source of "works on my page" bugs, and the one place FynMesh's semantics are *worse* than MF's rather than merely different. | A `shareStrategy`-equivalent switch over `semverMatch`; the rejection rationale in `combined-module-bundles.md:789-799` is about defaults, not about impossibility |
| 3 | **Fix the no-fallback manifest read** | A silent, unchecked failure mode that kills middleware registration. Two known fixes. | Either assert the embedded export in `cfa check`, or give `module-loader.ts:265` the four-tier chain `manifest-resolver` already has |
| 4 | **Keep diagnostics in production** | `drop_console: true` means the 19 error codes and the whole inspector issue set are invisible exactly where they matter. | Route through a level-gated sink rather than `console.*` |
| 5 | **Turn telemetry on** | Already built (~25 capture points); no entry point passes a `TelemetryConfig`. Pure wiring. | `browser.ts:5`, `browser-dev.ts:8`, `node.ts:6` |
| 6 | **Implement preload priority** | The types, the defaults and the depth map already exist and are simply never read. | Set `fetchpriority` from `priorityByDepth` in `browser-kernel.ts` |
| 7 | **Version the manifest schema** | Cheap now, expensive later — and now that packages are published, schema changes are other people's breakage. | Add a `schemaVersion` to the manifest artifacts |
| 8 | **Subpath sharing** | A real footgun today (transitive deps fail at runtime, not build time). | Trailing-slash prefix matching, as MF does |
| 9 | **DTS generation** | Widest DX gap, but genuinely large, and `dts-plugin` is a reasonable reference. | Rollup equivalent of `@mf-types.zip` |
| 10 | **SSR** | Widest capability gap, but three documented structural blockers stand first. | Unpark the Node target; give `system-node` a terminal `instantiate`; decouple `ManifestResolver` from browser globals |

Two things **not** worth chasing: a Chrome extension (already decided `wont_do`, and the in-page
inspector is arguably better for this architecture), and multi-bundler support (the SystemJS registry
*is* the product — a webpack adapter would give up every differentiator in §17).

**Shared tree-shaking is off this list for a different reason** — not low value, but a blocked
prerequisite. MF holds a pruned and a full shape of the same version as two slots on one share entry;
*"One File, One Address"* (§3) exists to forbid exactly that, so the question to answer first is
identity, not algorithm. Worth noting for whenever it is asked: `rvm` already carries the importer
directory per chunk, so a per-importer used-export set is computable *within one build* — which would
skip the cross-app CI aggregator MF pushes onto its users
([`MF2-DETAILS.md` §1.14](./MF2-DETAILS.md#114-what-this-means-for-fynmesh)).

---

## Appendix: sources and how to re-verify

**Module Federation 2.0** — `/Users/joel.chen/dev/module-federation-core` @ `c38c4c0e4` (2026-09-07),
packages at 2.9.0; examples at `/Users/joel.chen/dev/module-federation-examples`. Docs at
<https://module-federation.io> — **every page serves raw markdown at `.md`**
(`https://module-federation.io/configure/shared.md`); index at `/llms.txt`.

Highest-value files to read directly:

- `packages/runtime-core/src/type/config.ts` — the authoritative option types
- `packages/runtime-core/src/utils/share.ts:355-477` — share resolution
- `packages/runtime-core/src/{core.ts,remote/index.ts,shared/index.ts}` — the hook definitions
- `packages/sdk/src/types/{manifest.ts,stats.ts}` — the manifest schema
- `packages/enhanced/src/lib/container/ContainerEntryModule.ts:278-322` — container codegen
- `packages/error-codes/src/error-codes.ts` — the error taxonomy
- `packages/enhanced/src/schemas/container/ModuleFederationPlugin.json` — the closed config schema

The examples repo has **96 top-level example directories**. Two gaps worth knowing before you go
looking: the `output.md` index the docs advertise **does not exist**, and there is **no React Native
/ Metro example anywhere**.

⚠️ **Do not cite `arch-doc/`.** It is AI-generated internal design documentation with known factual
inaccuracies (see §15). The `packages/` source is authoritative.

**FynMesh** — this repo. Full 1,474-line source inventory behind this document is at
`.temp/fynmesh-federation-inventory.md` (gitignored). Highest-value files:

- `rollup-federation/federation-js/src/federation-js.ts:645-1022` — `resolve()`
- `rollup-federation/federation-js/tests/federation-js.test.ts:630-720` — singleton semantics, executable
- `rollup-federation/sample-react-federation/dist/plugin-entry.js:52-61` — two versions, one key, one container
- `core/kernel/src/types.ts` — the kernel interface
- `core/kernel/src/modules/middleware-executor.ts:372-433` — the four phases
- `dev-tools/create-fynapp/agent/CONTRACT.md` — the canonical FynApp authoring contract

**Three traps when verifying the FynMesh side:**

1. **`grep` skips `federation-js.ts`.** It contains a byte that trips grep's binary heuristic. Use
   `grep -a`, or you will conclude `singleton` is unimplemented.
2. **All `demo/*/dist/` are gitignored and stale.** Source is authoritative; rebuild with
   `fyn bootstrap` before reading build output.
3. **Several notes contradict the code.** The inspector's status is claimed three different ways
   across two files; `rollup-federation/README.md` calls `singleton` unimplemented;
   `core/kernel/README.md` documents four lifecycle events that do not exist, a `FynMeshKernel` class
   that is not exported, and a `canOverrideExecution` argument order reversed from the implementation.
   **[`BUILD-ARTIFACTS.md`](./BUILD-ARTIFACTS.md) has drifted too** — its line citations are 60–180
   lines stale, and two substantive claims are now wrong: a manifest-splice miss is a hard build
   error, not a warning, and the emitted `exposes` values are source-path strings, not
   `{path, chunk}`. The code on disk wins.
