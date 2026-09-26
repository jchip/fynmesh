# Module Federation 2.0 vs FynMesh `federation-js`

A feature-by-feature comparison of **Module Federation 2.0** and **FynMesh's SystemJS-based
federation stack**, based on source inspection, with upstream documentation used for integration guidance.

**Review refreshed 2026-09-17 (America/Los_Angeles).** FynMesh source: `e561638`;
nested `rollup-federation` source: `8964d49`. MF source remains pinned to `c38c4c0e4`.
The public upstream HEAD inspected during this review was `d6bb5a6`, two commits ahead;
its diff changes website/playground code and development dependencies, not the federation
implementations discussed here. Registry `latest` remained **2.9.0** for the MF runtime;
the separate Vite plugin advanced to **1.22.0**. Other integration versions below are the
previous inventory, not a fresh release audit.

The refresh corrects several claims contradicted by the original pinned source: MF supports
importer-context ranges and multiple provided versions in one build; its runtime core can be
externalized; and FynMesh has loader hooks and URL integrity support. Source and existing test
fixtures were inspected; no new performance benchmark or upstream test-suite run was performed.
Historical size figures below are retained as measurements from the earlier setup only.
A subsequent focused build/run with published MF 2.9.0 and webpack 5.105.0 checked the disputed
same-container sharing and external-runtime claims; results are recorded in §5.3 below.
A follow-up scope-membership review then added an architectural difference the first pass
underweighted — FynMesh's named-scope membership against MF's instance-scoped maps joined by
initialization — traced in §1.

| | Module Federation 2.0 | FynMesh |
| --- | --- | --- |
| Versions compared | `@module-federation/*` **2.9.0** (`module-federation/core` @ `c38c4c0e4`, 2026-09-07) | `federation-js@1.1.3`, `rollup-plugin-federation@1.1.2`, `@fynmesh/kernel@1.1.3`, `create-fynapp@1.1.5` |
| Origin | ByteDance Web Infra + Zack Jackson; began as a webpack bundler feature, later extracted into a standalone runtime | `jchip`, `github.com/jchip/rollup-federation`; author reports ~2 years of private development before its public repo |
| Runtime substrate | Bundler runtime (`__webpack_require__.federation`) + extracted `@module-federation/runtime` SDK | Forked SystemJS 6.15.1 (`@fynmesh/systemjs`) with a mutable module registry |
| Distribution | Published runtime, build adapters, and tooling packages | Published federation runtime, kernel, Rollup plugin, and scaffolder; local versions above |
| License | MIT | Apache 2.0 |

Off-cycle MF versions worth knowing: `@module-federation/vite` **1.22.0**, `node` **2.7.50**,
`nextjs-mf` **8.8.74** (deprecated), `observability-plugin` **2.6.0**, `esbuild` **0.0.114**
(experimental), `nuxt` **0.1.0**.

**Companion doc:** this file scores capabilities. [`MF2-DETAILS.md`](./MF2-DETAILS.md) records
*mechanism* for MF features traced line-by-line through the checkout, so a claim here can be checked
or costed before we consider building an equivalent. Currently covers shared tree-shaking.

---

## The one-paragraph answer

**FynMesh makes a common scoped federation the environment that containers join; MF connects
runtime instances through explicit sharing relationships.** Both support multiple shared versions
and importer-dependent requirements. FynMesh's strongest core distinctions are common-scope
participation through normal load/init, logical-name/semver-range container addressing, and emitted
importer-range metadata. MF's strongest core distinctions are finer sharing controls: per-share
scopes and layers, separate import requests and share keys, prefix sharing, and selectable provider
strategies. These arguments stand independently of types, plugins, SSR, or application middleware;
[§17](#17-refreshed-assessment) compares the core contracts before the broader stacks. The earlier
claims that FynMesh alone supports per-importer or multi-version sharing, or that MF must always
ship another full runtime core per app, do not hold.

## Why `federation-js` exists

The project's historical account is that it was developed privately for roughly two years before
its public repository, motivated by loader-level federation without adopting webpack output.
That motivation explains the architecture; private chronology is author-provided context, not
something this source review establishes. It also does not establish limitations of today's MF.
The useful comparison is the behavior and integration contract each stack now ships.

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

The registry exposes loaded state and binds resolution to importing chunks. MF also makes runtime
choices for individual consume modules; FynMesh's distinction is the registry and metadata contract,
not exclusive possession of decisions finer than a whole build.

**Federation is therefore a property of module resolution, not a relationship configured between
containers.** A normal container is expected to be self-sufficient: it can run with the modules it
ships. When several containers are loaded into one application, their module records enter the same
registry and compatible imports resolve across them by semver. They become federated by coexisting;
none has to pre-declare the others as remotes. A consume-only share (`import: false`) is the explicit
exception: because that container omitted its own implementation, the application, kernel, or other
composition layer must ensure a satisfying producer is loaded.

### Share-scope membership: ambient by name vs joined by handshake

This is the mechanism behind the paragraph above, and it is the sharpest architectural difference
in the comparison.

**FynMesh keys one global share scope by scope *name*.** `_mfInitScope(scope)` returns
`$SS[scope]`, creating it once (`federation-js.ts:2206-2217`), and `_S` appends each provided
version's source into `$SS[scope][key][version].sources` alongside whatever earlier containers
put there (`:2166-2199`). A generated entry's `init` calls `Container._mfInit()` with **no** share
scope argument, so it joins the existing named scope rather than supplying one
(`container.ts:175-181`); the kernel likewise calls `fynAppEntry.init()` with no argument
(`module-loader.ts:216`). Loading and initializing a container *is* the act of joining — there is
no second step, and no container passes a scope to another.

**MF keys its share scope map by runtime *instance*.** `SharedHandler` constructs a fresh
`shareScopeMap = {}` per host (`runtime-core/src/shared/index.ts:138`) and publishes it on the
global under the instance's `id || name`, **not** under the scope name (`:821-827`). Resolution
reads the map it was handed — `getRegisteredShare(localShareScopeMap, …)` iterates the scopes
*within that map* (`utils/share.ts:355-390`) — so two independently created instances both using
the scope string `default` are not thereby sharing. They connect through initialization: `Module.init`
builds options from `host.shareScopeMap` and calls `remoteEntryExports.init(shareScope, …)`
(`module/index.ts:194-234`), and the container assigns the supplied object to that scope name
(`initShareScopeMap`, `shared/index.ts:740-754`; `webpack-bundler-runtime/src/initContainerEntry.ts:29-85`).

The difference is the **default membership and discovery contract**, not what is reachable. MF
ships runtime `registerRemotes` / `loadRemote` (`remote/index.ts:511-518`;
`packages/runtime/src/index.ts:58-65,96-101`) and its container-init API can connect independently
loaded containers, so an ambient policy is implementable there; the source does not establish that
it is impossible. What the source does establish is that FynMesh gets co-loaded federation with no
handshake, and MF ordinarily makes each connection explicit. Do not read this as "MF requires
build-time remotes" — §6 covers that separately.

**The trade runs both ways.** MF's default buys isolation: `createInstance` stamps each instance
`id: ${name}@${version}` and gives it its own map (`packages/runtime/src/index.ts:28-38`), so two
independent runtimes on one page cannot collide by accident. FynMesh's default buys reach, and its
isolation unit is the scope *name* — a container is served only by its own scope, "a boundary, not
a hint" (`federation-js.ts:468-472`, FYM-172) — so isolating two co-loaded containers means
deliberately giving them different scope names. Each stack can express the other's arrangement;
what differs is which one you get for free.

### Runtime delivery: defaults, externalization, and measured scope

**MF embeds runtime code by default.** `FederationRuntimePlugin` imports
`@module-federation/webpack-bundler-runtime/bundler` into each build's module graph.
The guard on `__webpack_require__.federation` is per bundler runtime, not proof of a single
page-wide MF instance. `createInstance()` explicitly creates runtime instances, and the global
instance registry can hold several (`packages/runtime/src/index.ts:28-44`).

**MF also supports a shared external runtime core.**
`experiments.externalRuntime` reads `@module-federation/runtime-core` from
`_FEDERATION_RUNTIME_CORE`; `provideExternalRuntime` supplies it from a pure consumer with no
`exposes` in the inspected webpack/Rspack path
(`packages/enhanced/src/lib/container/ModuleFederationPlugin.ts:182-198`). This removes repeated
core payload, not every remote's bundler adapter. These options existed in the original pinned
commit; they are not a new correction made upstream.
See the [official experiments reference](https://module-federation.io/configure/experiments.html).

**FynMesh requires SystemJS + `federation-js` before app entries run.** These scripts establish a
shared loader registry explicitly. Each app still ships its own registration/binding code, so
constant loader delivery is not constant total federation overhead.

The earlier measurements used esbuild minification and gzip level 9:

| artifact | raw bytes | gzip bytes |
| --- | ---: | ---: |
| MF bundled runtime, without externalization | 84,396 | 26,006 |
| FynMesh `system.min.js` | 10,145 | 3,779 |
| FynMesh `federation-js.min.js` | 12,189 | 4,926 |
| FynMesh federation layer total | 22,334 | 8,705 |
| FynMesh browser kernel, additional application layer | 26,470 | 9,731 |

These are **historical artifact measurements, not an apples-to-apples page benchmark**. The MF
bundle included a Node SDK path, did not exercise actual webpack feature elimination, and did
not use external runtime options. Multiplying 26 KB by app count estimates that particular
embedded setup only. A useful new benchmark would compare default and externalized MF builds
against FynMesh, counting adapters, entries, caching, requests, and equivalent functionality.
No universal 3× saving or structural O(1)-versus-O(N) conclusion follows from this table.

---

## 2. Capability matrix

Legend: ✅ shipped · 🟡 partial / caveated · ❌ absent · n/a not applicable

### Core federation

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Runtime delivery | Embedded by default; runtime core can be externalized | Shared loader scripts plus per-app bindings | Historical measurements are configuration-specific (§1) |
| Expose modules from a build | ✅ `exposes` | ✅ `exposes` | Equivalent |
| Consume remote modules | ✅ `remotes` + `loadRemote` | ✅ import attributes + `_importExpose` | Different binding model (§6) |
| Container protocol | `{ get, init }` | `{ init, get, container, __FYNAPP_MANIFEST__ }` | FynMesh also exposes a live container object |
| Share-scope membership | Scope maps are **per runtime instance**, published under instance id; a host joins a container by passing its scope object into `init` | **One global map keyed by scope name**; loading and initializing a container joins it, no argument passed | Ambient membership vs explicit handshake (§1) |
| Bidirectional host/remote | ✅ | ✅ | |
| Build-time `remotes` declaration | ✅ | ❌ **by design** | FynMesh resolves remotes at runtime (§6) |
| Runtime remote resolution | ✅ name-based registration plus request/resolve/load hooks | ✅ kernel `setRegistryResolver((name, range) => …)` | Built-in range contract versus generic extension hooks (§6) |
| Built-in semver-range container selection | ❌ requires custom policy | ✅ `mf-expose` import attribute `semver` | FynMesh selects first satisfying registered container; deployment resolver must honor ranges |
| Versioned remote coexistence | ✅ distinct registrations/entries or instances; no built-in range lookup | ✅ `$C[name][version]` | Logical name/range addressing is FynMesh’s distinction |
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
| Selection rule | Strategy-selected candidate; fallback scan can be insertion-ordered | Loaded satisfying candidate first, then insertion order | Both can depend on registration/loading history (§5) |
| Multi-version coexistence across containers | ✅ | ✅ | |
| **Multiple provided versions of one share key in one build** | ✅ version arrays and fixtures | ✅ emitted share entries | Supported by both (§5.3) |
| **Importer-dependent requirements** | ✅ inferred per consume context unless explicitly overridden | ✅ per-chunk `rvm` range intersection, subject to singleton policy | Different granularity and metadata (§5.3) |
| Shared tree-shaking | ✅ opt-in per share; ~75% reported on antd | ❌ | webpack is the reference implementation, Rspack the recommended one (§13) |

### Runtime & extensibility

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Bundler-free runtime SDK | ✅ `createInstance()` | 🟡 global singleton, not importable (`src/index.ts:1-9` exports only `Container` + types) | |
| Runtime plugin hooks | ✅ federation lifecycle/policy hooks | 🟡 typed SystemJS loader wrappers; no comparable federation-policy API | Distinguish loader hooks from policy plugins (§7) |
| Global plugins | ✅ `registerGlobalPlugins` (deduped by name) | ❌ | |
| Build plugin hooks | ✅ webpack/Rspack plugin API | ✅ 4 own hooks (`enrichManifest`, `emitMeta`, `emitFederationMeta`, `renderDynamicImport`) | |
| Custom loading/import protocols | ✅ runtime `loadEntry` and bundler extension APIs | ✅ `renderDynamicImport` + build-time guard; loader hooks | Different extension layers |
| Application middleware layer | ❌ nothing comparable | ✅ (§7) | **Unique to FynMesh** |
| App lifecycle contract | Bridges provide render/destroy; no FynUnit equivalent | ✅ `FynUnit` initialize/execute/shutdown/suspend/resume | Additional kernel layer |
| Inter-app messaging | ❌ | ✅ FynBus pub/sub + request/response + channels | **Unique to FynMesh** |
| App dependency graph + topological bootstrap | No equivalent app-bootstrap contract | ✅ (`manifest-resolver.ts:194-266`) | Entry discovery may execute code before bootstrap ordering |
| Config system | ✅ extensive | ❌ `KernelConfig` is entirely dead code | |

### Tooling, types, delivery

| Capability | MF 2.0 | FynMesh | Notes |
| --- | --- | --- | --- |
| Published manifest schema | ✅ `mf-manifest.json` + `mf-stats.json`, typed in `packages/sdk` | 🟡 4 JSON artifacts, **unversioned** | §4 |
| Manifest embedded in entry (zero extra request) | ❌ | ✅ `__FYNAPP_MANIFEST__` | Unique to FynMesh |
| Federated TypeScript types | ✅ `dts-plugin`, `@mf-types.zip`, live WS reload | ❌ no generated remote contracts; wildcard defaults to `any` | Manual type declarations remain possible |
| Chrome extension | ✅ shipped, store id `aeoilchhomapofiopejjlecddfldpeom` | ❌ **deliberately cancelled** (FYM-31 `wont_do`) | |
| In-page inspector | Chrome extension is the shipped interface | ✅ 8 views, named diagnostics | Direct registry inspection is a FynMesh strength |
| Observability / telemetry | ✅ `observability-plugin`, exportable trace reports | 🟡 `KernelTelemetry` built but **inert by default** | |
| SSR | ✅ Modern.js (stream), `@module-federation/node`, Rsbuild | ❌ does not exist; `NodeKernel` bypasses federation | **Widest single gap** |
| Preloading | ✅ `preloadRemote` w/ filters, deps, asset categories | 🟡 depth-bounded only; **priority system unimplemented** | §13 |
| Data prefetch | ✅ `*.data.ts` + `instance.prefetch()` | ❌ | |
| Retry / failover | ✅ `retry-plugin` (domains, backoff, cache-bust) | ❌ | |
| Error taxonomy | ✅ `RUNTIME-*`/`BUILD-*`/`TYPE-*` codes | ✅ 19 kernel codes; console output stripped in prod; state/events remain | |
| Bundlers | webpack, Rspack, Rsbuild, Rslib, Vite, Rollup/Rolldown, Metro, esbuild(exp) | **Rollup only**, SystemJS output only | |
| Framework bridges | ✅ React 16–19, Vue 3 | ❌ (but demo covers React/Vue/Marko/Preact/Solid/Svelte) | |
| SRI / CSP / sandboxing | 🟡 script/link hooks for policy; no app sandbox | 🟡 loader integrity map + script hooks; no app sandbox | Host policy still required (§15) |

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
   (`federation-js/README.md:40-41`). MF remotes use their bundler/runtime machinery rather than this SystemJS loader.
2. **You get a mutable registry in return.** This is what makes §5's resolution model, the inspector,
   and `federation-combine` possible.

There is also a build-timing hazard on the FynMesh side worth flagging: entry generation waits on a
**wall-clock heuristic** — `makeAlarm` polls every 250 ms until only the entry module is unresolved
(`utils/timing.mts:21-72,81-100`), plus two hard `sleep(50)` calls (`index.mts:446,449`).
Webpack/Rspack MF has no equivalent timing dependency.

**FynMesh explicitly enforces "One File, One Address" for URL/specifier registration.** A module that
registered from its own file is filed under its URL with the specifier as a redirect, so both
spellings join a single record (`federation-js.ts:57-127`, `addIdUrlMap:1343-1444`,
`tests/one-file-one-address.test.ts`). This closes a duplicate-instance route that a code-split entry
can otherwise encounter. This does not establish that MF lacks its own module-caching invariants.

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

**The embedded copy saves a separate metadata request when the entry must load anyway.**
Tier 1 imports and executes the entry to read `__FYNAPP_MANIFEST__`
(`manifest-resolver.ts:163-170`). That is a useful delivery tradeoff, but it means graph discovery
can execute entries before dependency-ordered bootstrap. MF's separate manifest enables
metadata-only planning, and pre-supplied snapshots can avoid its manifest fetch. Neither always
has a one-request advantage across all loading strategies.

**Where FynMesh is behind:**

- **No versioned schema.** MF's is typed in a published SDK package and evolves under semver.
  FynMesh also publishes TypeScript types, but its emitted JSON has no explicit format version.
  Neither the MF SDK package version nor a package version in a manifest is itself a schema discriminator. (`FynAppManifest.exposes` in `core/kernel/src/types.ts:329-337`
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

Both stacks support context-sensitive consumption and multi-version provision. Their metadata,
selection policies, and override behavior differ.

### 5.1 MF 2.0's algorithm

From `packages/runtime-core/src/utils/share.ts:355-477`:

1. Iterate `scopes` (from `shareInfo.scope`, default `DEFAULT_SCOPE`).
2. Pick a comparator by `shareStrategy`:
   - **`version-first`** (default, `:233`) — *highest version wins, but an already-loaded copy is sticky*.
   - **`loaded-first`** (`:284`) — loaded/loading copies win first; `versionLt` breaks ties.
3. `defaultResolver` (`:393`):
   - **singleton**: take the winner. If `requiredVersion` is a string and unsatisfied →
     `error()` when `strictVersion`, else `warn()`. Strict mismatch throws; non-strict returns
     the winner rather than falling back.
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
4. **`satisfiesAll`** (`:1158-1165`) — ordinary candidate matching requires **every** applicable range.
5. **`semverMatch`** (`:1175-1212`) — a `loadedOnly` pass first, then a pass allowing unloaded;
   **insertion order decides within each pass**. Singleton policy can subsequently override the match.
6. **Singleton override** (`:944-961`).
7. **`pickShareSource`** (`:1239-1249`) — **first source wins, and the choice is memoised**.

### 5.3 What both support, and where the contracts differ

**(a) Importer-dependent requirements exist in both.** MF's `ConsumeSharedPlugin` starts from
each `resolveData.context` to infer the importing package's requirement when `requiredVersion`
is omitted (`:225-283,488-514`). Each consume passes its own `shareInfo` to `loadShare`.
The `consume-multiple-versions` fixture (`index.js:162-176`) expects a root consumer to use 1.x
and nested consumers to use 2.x in the same build.

FynMesh emits importer-directory ranges in `rvm` and associates them with output chunks.
`matchRvm` collects the relevant ranges and `satisfiesAll` intersects them. This is a distinct,
inspectable contract, but not independent resolution of every source import once several
importers occupy one chunk. Non-semver protocols/tags are skipped, and a loaded singleton may
override a satisfying choice with a warning (`federation-js.ts:927-960,1104-1136`).

**(b) Multiple versions of one share key in one build exist in both.** MF's
`ShareRuntimeModule.ts:78-112` emits arrays per shared key; runtime options accept `ShareArgs[]`.
The `provide-module` fixture (`index.js:31-39`) asserts versions 1.1.9, 1.2.3, and 1.3.0 under
one key/scope. FynMesh emits multiple entries through one `_S` call
(`rollup-plugin-federation/src/code-generation/container-code.mts:137-145`). The configuration
and discovery ergonomics differ; neither representation makes this structurally impossible.

**(c) FynMesh has a built-in logical-name/range container contract.** The `fynapp-x1-v1` and
`fynapp-x1-v2` demos publish the same logical name at different versions. Consumers select via
`import('fynapp-x1/main', { with: { type: "mf-expose", semver: "^2.0.0" } })`.
The registered-container lookup chooses the first satisfying version, not necessarily the highest.
MF registrations are name-keyed per runtime instance. Within one instance, `registerRemote` rejects a
second remote with the same name, and `force` evicts the loaded one (`runtime-core/src/remote/index.ts:691`).
The loaded-module cache is keyed by name too (`remote/index.ts:530,738`). Coexistence still works
across instances, because each build normally owns one. `entryGlobalName` is separate from the
registration name, and ESM remotes do not require window globals. So two versions of one app can
run on one page, but MF has no range lookup to choose between them. §6 covers who does that work.

**Focused same-container experiment (2026-09-17).** To distinguish provider registration from
actual consumption, a self-contained webpack container exposed `./probe`. Its root package
declared `shared-lib: ^1.0.0`; a nested package declared `shared-lib: ^2.0.0`. Their installed
versions were 1.2.0 and 2.3.0. One ordinary configuration supplied both:

```js
new ModuleFederationPlugin({
  name: 'inferred',
  exposes: { './probe': './probe.js' },
  shared: { 'shared-lib': { singleton: false } },
  // Harness used async-node + commonjs-module output; types/manifest/dev disabled.
});
```

After `container.init({})`, the test called `container.get('./probe')` and executed its factory.
There was no second remote, injected provider, alias, or separately configured share scope.

| Case | Registered versions | Root / nested result |
| --- | --- | --- |
| Inferred ranges, non-singleton | 1.2.0 and 2.3.0 | **1.2.0 / 2.3.0** |
| Explicit `requiredVersion: '^1.0.0'` | Both | **1.2.0 / 1.2.0** — inference overridden |
| `singleton: true` | Both | **2.3.0 / 2.3.0** plus mismatch warning |
| `singleton: true, strictVersion: true` | Both | Range mismatch error |
| Inferred ranges + `externalRuntime: true` | Both | **1.2.0 / 2.3.0**, with runtime core supplied globally |

The externalized build's stats contained the `_FEDERATION_RUNTIME_CORE` external and no bundled
`runtime-core/dist` modules. Adapters remained; this does not mean a runtime-free remote.
The harness supplied the global directly; it did not exercise the `provideExternalRuntime` plugin.
The harness and results are in `.temp/mf2-doublecheck/probe.cjs` and `probe.log` (gitignored).
This is a webpack/Node-container experiment, not a browser, Rspack, Vite, or performance test.

**The limitation is policy/configuration, not a one-version-per-container rule.** Explicit
`requiredVersion` replaces inference; explicit `version` overrides provider-version inference;
singleton policy prevents independent version choice within the same share scope. Packages
must also be declared shared. Distinct container releases sharing one registration name remain
a separate issue from different shared dependency versions inside a container.

### 5.4 Where FynMesh is behind on sharing

| Gap | Detail |
| --- | --- |
| **Selection is load-order-first, not highest-satisfying** | `semverMatch` is first-match-wins over insertion order (`:1183-1198`), i.e. container declaration order = FynApp load order. Selecting the highest was considered and **explicitly rejected** (`notes/combined-module-bundles.md:789-799`). MF offers different strategies but also has loaded-copy stickiness and insertion-ordered fallback scans; it is not load-order independent. |
| **`eager` unimplemented** | Accepted, emitted, read by nothing. Stated verbatim at `federation-js/src/types.ts:97-108`. |
| **No `strictVersion`** | Singleton mismatches always warn, never fail. |
| **No `shareStrategy`** | Behaviour is hard-coded loaded-first-within-a-satisfying-set. |
| **Per-share `shareScope` silently dropped** | The runtime honours `options.shareScope` (`container.ts:99`) but `PICK_SHARE_KEYS` omits it, so it is never emitted. |
| **Subpath exports are not shared** | Declaring `share-a` does not share `share-a/lib` — that must be its own key. MF solves this with trailing-slash prefix matching (`'react-dom/'`). |
| **Transitive shared ranges need configuration** | FynMesh documents that a transitively consumed dependency must appear in `shared` with its range (`rollup-plugin-federation/README.md:73-75`). MF also needs the package declared shared, but can infer its range from the consuming package's `package.json`; it does not automatically share every transitive dependency. |
| **No shared tree-shaking** | MF prunes eligible shared modules, keeping a full artifact available — antd 1404 KB → 344 KB reported. Opt-in per share, gated on side-effect-free module metadata/analysis; `server-calc` needs deploy-time infrastructure. The reported example does not establish an exclusive mode attribution. Mechanism in §13 / [`MF2-DETAILS.md`](./MF2-DETAILS.md#1-shared-dependency-tree-shaking). |
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

Dynamic public path can be handled by `getPublicPath` — a **stringified** function evaluated via `new Function`
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
name, and the version is whatever that URL happens to serve. See
[Multiple versions of one app](#multiple-versions-of-one-app-who-does-the-work) for what that costs.

**On top of this, FynMesh builds a dependency graph.** The kernel reads manifests, derives edges from
`requires` + `import-exposed` + `shared-providers`, detects cycles, and loads in **topological
batches with bounded concurrency** (`manifest-resolver.ts:194-266`;
`kernel.loadFynAppsByName(reqs, { concurrency: 4 })`). MF does not ship this application-bootstrap orchestration contract. Its manifests and preload
logic do track remote dependencies, which is a separate concern.

### Built-in dependency resolution versus an extensible remote registry

FynMesh makes `(name, range) → deployment` a first-class kernel interface. The host supplies a
resolver and consumers name dependencies without embedding deployment URLs. MF's default remote
registry is name-based, but its `beforeRequest`, `afterResolve`, and `loadEntry` hooks can implement
request rewriting, custom discovery, or deployment selection. A registry plus policy code can
implement semver selection; the absence of a dedicated range argument is not an impossibility
proof. Both can change deployment URLs without rebuilding consumers.
See [MF's runtime plugin recipes](https://module-federation.io/guide/runtime/runtime-plugins).

FynMesh's built-in composition call remains useful:

```ts
await kernel.loadFynAppsByName([{ name: "fynapp-1" }], { concurrency: 4 });
```

The kernel discovers manifests and dependencies, then bootstraps apps in topological batches.
Embedded-manifest discovery already imports entries, and its DFS awaits dependency discovery
serially (`manifest-resolver.ts:201-259`). Bounded concurrency describes the later load/bootstrap
phase, not all network requests or all module execution.

**Implementation notes** — sharp edges in what ships today, not costs of the model:

- The default browser resolver is a demo stub: it ignores `range`, hardcodes `version: "0.0.0"`, and
  maps name to a path convention (`browser-kernel.ts:200-207`). The design is the resolver
  *interface*; a real deployment supplies its own. The shipped default is not an example of it.
- `FynAppRegistry` keys each app under **both** `name@version` and bare `name`
  (`fynapp-registry.ts:22,30-32`). Versioned keys coexist without issue; the bare-name alias is
  last-write-wins. The sharp edge is in the alias, not an inability to hold two versions
  (`notes/KERNEL_PRINCIPAL_REVIEW.md` #6 flags the dual-key ambiguity).

### Multiple versions of one app: who does the work

A common case: app A was built against `x1` 1.x. App B was built later against `x1` 2.x. Both run
on one page.

**On FynMesh this is automatic for consumers.** Each consumer writes its range in the import. The
host's resolver maps `(name, range)` to a deployment, and the registry picks a loaded version that
satisfies each range. Publishing x1 2.4, or 3.0 beside 2.x, changes no consumer. The one-time cost
is on the host, which must supply a real resolver. The shipped browser default ignores `range`
(see the implementation notes above).

**On MF2 someone maintains the version mapping.** MF2 has no contract where a consumer declares a
range and the runtime picks a deployment. Each lever it offers puts version identity somewhere a
person keeps up to date:

| MF2 lever | What it gives | What it costs |
| --- | --- | --- |
| Per-build instances | A maps `x1` to a v1 URL and B maps `x1` to a v2 URL, each in its own instance. A build's instance id is `name:version` from `package.json` (`enhanced/src/lib/container/ModuleFederationPlugin.ts:109`; `runtime/src/utils.ts:13-35`) | Each consumer holds a URL, not a range. A new x1 minor means updating every consumer's URL, or keeping a per-major URL that the x1 team repoints. Same-name builds without a version share one instance (`runtime/src/utils.ts:24-30`) |
| `alias` | A consumer imports `x1/main` while the remote is registered as `x1_v2` | A consumer-side rename. An alias must be unique within its instance (`remote/index.ts:646-661`) |
| Remote by `version` + snapshot | `{ name: "x1", version: "2.3.0" }` resolved through a deploy-platform snapshot | Exact version, not a range. One `matchedVersion` per name per consumer (`sdk/src/generateSnapshotFromManifest.ts:93-120`). Needs a deployment platform |
| x1 as a non-singleton shared package | Consumers declare `requiredVersion` ranges, and the share scope keeps both majors | x1 becomes a library, not a container. Independent deployment needs `import: false` plus a provider container per major, and those providers need distinct names. The host must load them before consumers ask |
| Runtime plugin (`beforeRequest`, `afterResolve`, `loadEntry`) | A custom `(name, range)` resolver | You build and own it. This is the FynMesh contract, reimplemented |
| `shareKey`, `shareScope`, layers | Control which shared packages join which sharing group | Nothing here. They apply to shared packages, not remotes |

**One instance for everyone is the hard case.** A host that loads every app through one runtime
instance cannot hold both majors as `x1`. A runtime-only shell does this. So does a FynMesh kernel
on MF2. There, someone must rename or alias per major. There is also no runtime range check, so a
wrong URL loads the wrong major silently.

---

## 7. Extensibility: runtime plugins vs middleware

The two projects solved *different* extensibility problems, and each has essentially nothing where
the other is strong.

### MF 2.0 — runtime hooks

Source-defined hook groups (their count and grouping are version-dependent):

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

### FynMesh — loader hooks plus an application middleware layer

`federation-js` lacks a comparable named federation-policy plugin API, but the stack has
**typed SystemJS hooks**, including `resolve`, `instantiate`, and `createScript`
(`systemjs/src/types.ts:281`; `systemjs/docs/hooks.md`). Combined-bundle loading also delegates
to `createScript` (`federation-js.ts:1800-1820`). Loader wrappers can implement instrumentation
and script policy without changing core. What is missing is MF's standardized share/remote
lifecycle context, plugin composition, and ready-made policy ecosystem.

FynMesh additionally supplies **middleware**, a cross-app dependency-injection and lifecycle
system in the kernel. MF's federation runtime does not supply this same application contract.

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

This is an application-level execution contract. MF does expose factory-execution and bridge-render
hooks, but those are not FynUnit initialize/execute overrides or its middleware dependency model.

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

**One structural asymmetry in integration model worth noting:** `@fynmesh/kernel` **does not export a kernel constructor from its main module entry**.
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

**FynMesh has no shipped remote type generation/distribution.** The scaffolder supplies
`declare module "fynapp-*"`, defaulting matching imports to `any`. Applications can supply precise
ambient declarations or shared contracts manually; the missing feature is automated federation of types.

For a framework whose selling point is independently deployed teams sharing code, this is the widest
day-to-day developer-experience gap in the comparison.

---

## 10. DevTools and observability

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| Form factor | **Chrome extension** (store id `aeoilchhomapofiopejjlecddfldpeom`), adds a "Module Federation" DevTools tab | **In-page overlay**, `Ctrl+Shift+M`, Preact + signals in a Shadow DOM |
| Size / status | `@module-federation/devtools@2.9.0` | `federation-inspector@0.1.0`, `private: true` |
| Requires app cooperation | **Yes — `mf-manifest.json` is a hard requirement** | **No** — reads the loader's record-exposure API |
| Panels | Proxy · Module Info · Dependency Graph · Shared · Loading Trace | Modules · Graph (ELK) · Containers · Shares · Issues · Middleware · FynApps · Raw |
| Killer feature | **Proxy** — redirect a producer to `localhost:3000/mf-manifest.json`, keeping HMR, per-tab isolated | **Issues** — named source-backed diagnostics |
| Diagnostics depth | Whether `singleton`/`strictVersion` took effect; tree-shaking status tags (`Tree Shaking Loaded` / `Loading` / `Loaded` = fell back to full) | `singleton-multiple-copies`, `range-unsatisfied`, `duplicate-address`, `dependency-cycle`, `orphan-modules`, `fynmesh-provider-mismatch`, `middleware-auto-apply-undelivered`, … |
| Trace export | ✅ JSON with `config`, `scopes`, `reports`, `diagnosis`, `summary.outcome` | ❌ |
| Agent-facing CLI | ✅ **Divebell** — `divebell mf status\|module-info\|remote trace\|shared status\|module-perf` | ❌ |
| Telemetry | `observability-plugin` (2.6.0); Node variant writes `.mf/observability/latest.json` + `events.jsonl` | `KernelTelemetry` built (~25 capture points) but **inert by default** — no entry point passes a `TelemetryConfig` |
| Debug globals | `__FEDERATION__`, `__SHARE__`, `__INSTANCES__`, `__PRELOADED_MAP__`; `FEDERATION_DEBUG=true` | `Federation.__I()`, `kernel.__I()` — both mangle-proof and `structuredClone`-safe |

**FynMesh's genuine differentiator here** is `Federation.__I()`: per (chunk, share key) it returns
the importer-declared ranges, **the ranges current chunk metadata supplies to resolution**, and
currently registered satisfying versions (`federation-js.ts:2271-2323`). This explains current
constraints; it is not a recorded history of the winning selection or singleton override.
The inspector is also **independent of the inspected app’s framework, page-droppable, and reads loader state
without app-specific instrumentation**, which MF's manifest requirement rules out.

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
- **No shipped automatic retry/backoff/domain-failover plugin or `errorLoadRemote` equivalent.**
  Loader hooks are available (§7); failed combined-bundle promises are evicted so later calls can retry.
- **Console diagnostics are stripped in production** by `drop_console: true`, but bootstrap failure
  state/events and inspector snapshots survive (`kernel-core.ts:527-540,722`). Some early load
  failures return `null`; default telemetry does not automatically export these failures. Distinguish
  missing console warnings from the loss of every observable error channel.

---

## 13. Performance

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| Preload API | `preloadRemote([{nameOrAlias, exposes?, resourceCategory?, depsRemote?, filter?, recordPreloadedAssets?}])` | `kernel.tryPreload(url, depth)`; internal graph warm-preload |
| Preload granularity | Per-expose, per-resource-category, with a `filter(assetUrl)` | **Depth-bounded only** |
| Priority | `rel=modulepreload fetchpriority=high` for ESM remotes; `<script fetchpriority="high">` | ❌ **`PreloadPriority`/`priorityByDepth` are written once as defaults and never read.** No `fetchpriority` is ever set. |
| Preload result reporting | Promise rejects with `error.results[]` carrying per-URL `status: success\|error\|timeout\|cached` | ❌ |
| Link type | `preload as=script` / `as=style` / `modulepreload` | **Deliberately `preload as=script`, never `modulepreload`** — entries are `System.register` loaded by injected classic scripts, so a modulepreload would fetch in CORS mode and double-fetch (`browser-kernel.ts:89-99`) |
| Data prefetch | 🟡 `<Component>.data.ts` exporting `fetchData` → injected as `mfData`; `instance.prefetch({id, dataFetchParams})` | ❌ |
| Shared tree-shaking | ✅ `runtime-infer` / `server-calc`; antd 1404 KB → 344 KB reported, opt-in per share | ❌ |
| Runtime size knobs | ✅ `experiments.optimization.{disableRemote (−27.7%), disableShared (−31.6%), disableSnapshot}` off a 73,154 B baseline | ❌ |
| Chunk combination | Bundler chunking; no inspected equivalent post-build CLI | ✅ **`federation-combine`** |

**`federation-combine` is a FynMesh-specific delivery tool.** A post-build CLI folds many small
federated chunks into combined files **without changing any module's identity** — each still
registers under its own fileName. `Federation._B()` / `declareBundles(map, distBase)` let a host
declare the map *before any entry runs*, so a preload hint names the file that will **really** be
fetched rather than a member the runtime will never request. If a loaded bundle lacks the requested
member and the individual file remains deployed, the loader falls back to that file. A failed
bundle fetch still rejects; later calls may retry (`federation-js.ts:341-361,1778-1787`).

Combining can reduce overhead in workloads dominated by many small chunks; the local
[shell measurements](./SHELL_LOAD_PERF.md) illustrate that case. It complements shared-export
pruning. This review did not benchmark equivalent MF chunk-grouping and preload configurations.

### How MF's shared tree-shaking actually works

Worth stating, because the headline number is easy to over-read. Full trace in
[`MF2-DETAILS.md §1`](./MF2-DETAILS.md#1-shared-dependency-tree-shaking).

A build that opts in (`shared: { antd: { treeShaking: { mode } } }` — **off by default**, per share)
emits **two** copies of the package. The copy inside its own bundle is **pruned** to the exports it
referenced; a separately compiled standalone container holds the **full** package. At runtime a plugin
swaps the getters — `get` → full container, `treeShaking.get` → pruned copy — and a decision function
picks one per consumer. Several selection paths choose the full copy, but failed getters/network
loads are not universally retried through it; `loadShare` can rethrow (§1.10 of the companion).

Three things bound the win:

1. **The inspected plugin requires `factoryMeta.sideEffectFree === true`.** If webpack can't prove the real module side-effect free,
   the referenced-export set is cleared and nothing is pruned — silently. An `import()` webpack
   resolves opaquely drops the share key entirely.
2. **The cheap mode under-delivers.** `runtime-infer` is supposed to reuse a loaded pruned copy when
   it covers the consumer, but the bundler emits only `{mode}` into the runtime's share record — never
   the *candidate's* used-export set — so the subset check has no data and degenerates to "prefer the
   pruned copy." Its own docs concede this breaks `singleton`: two apps can end up with a minimal and
   a full antd on one page, *"style conflicts, non-shared state, or even crashes."* Raising the hit
   rate means hand-writing the other app's exports into your config — which the official demo does, in
   both directions.
3. **The server mode needs deployment integration.** The upstream 75% example is not attributed
   exclusively to `server-calc`. That mode requires a build
   service (`@module-federation/treeshake-server`: tmp project → `pnpm i` → Rspack build → CDN upload),
   **a CI step you write yourself** that unions `usedExports` across every app's `mf-stats.json`, and a
   third step that writes `secondarySharedTreeShakingEntry` + `treeShakingStatus` into the snapshot.
   The server takes a pre-computed union; it does not aggregate.

MF ships shared-export pruning; FynMesh does not. The two-artifact implementation and server
coordination are concrete costs, while the reported byte saving is an upstream example, not a
guarantee for another application. FynMesh would need export-coverage metadata, variant selection,
and singleton/side-effect rules. Its URL identity invariant does not prohibit separate pruned
and full artifacts at distinct URLs; it prevents duplicate records for the same module URL.

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
| webpack 5 | `@module-federation/enhanced/webpack` | 2.9.0 | ✅ reference — the full TS implementation of shared tree-shaking. `TreeShakingSharedPlugin` is *installed* whenever `shared` exists (`ModuleFederationPlugin.ts:277-279`), but it no-ops unless a share sets `treeShaking` with `import !== false` (`tree-shaking/TreeShakingSharedPlugin.ts:41-45`) — pruning stays opt-in per share |
| **Rspack** | `@module-federation/enhanced/rspack` | 2.9.0 | ✅ **recommended** — native (Rust) shared tree-shaking, though the path pins an `@rspack-canary` build and `ModuleFederationPlugin` does not install it for you |
| Rsbuild / Rslib | `@module-federation/rsbuild-plugin` | 2.9.0 | ✅ |
| **Vite 5–8** | `@module-federation/vite` | **1.22.0** | ✅ mature — but a **separate repo and release line**, not in `module-federation/core`; build target `chrome89`+ |
| Rollup / Rolldown | via `@module-federation/vite` | 1.22.0 | ✅ / 🟡 — **no standalone rollup plugin exists** |
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
- **No DOM import-map auto-discovery.** The fork *deleted* DOM auto-discovery (SJS-13) — `processScripts`, both script
  types, the `DOMContentLoaded` rescan. Maps can only be installed programmatically via
  `addImportMap(json, mapBase)`. Precedence is explicit: `System.registrations` is consulted
  **before** the import map, because *"a caller that explicitly handed the loader a module means it."*
- **Native ESM is not required** — and not emitted.

---

## 15. Security and isolation

**Neither inspected stack provides a sandbox for untrusted remote application code.** Both expose
mechanisms for host-controlled loading policy; they should not be scored as having no security
extension points.

| Concern | MF 2.0 | FynMesh |
| --- | --- | --- |
| Script integrity / attributes | `createScript` / `createLink` hooks can attach integrity, nonce, and crossorigin | SystemJS copies `importMap.integrity[url]` to scripts; typed `createScript` hooks can add attributes |
| Integrity policy distribution | Host/integration responsibility | Host must supply URL hashes via programmatic import maps; no automatic artifact hash distribution established |
| Loading policy | Federation request/fetch/entry hooks | Loader wrappers; combined bundles use `createScript` too |
| App sandbox | None established | None established |
| Strict CSP consideration | Optional `getPublicPath` uses `new Function`; static paths avoid this particular eval requirement | `createScript` can add nonce attributes; loader docs discuss script-loading CSP considerations |

FynMesh evidence: `systemjs/src/features/script-load.ts:32-44`,
`systemjs/src/features/import-maps.ts:39`, `systemjs/docs/hooks.md:134`, and
`federation-js/src/federation-js.ts:1800-1820`. Integrity keys must match the actual requested
asset URL, including a combined-bundle URL when combination is used.

MF's side-effect scanner and FynMesh's inspector help inspect behavior and provenance; neither
turns arbitrary remote code into a trusted or isolated execution environment. Do not infer shipped
security features from `arch-doc/` design prose alone; use implementation paths and tests.

---

## 16. Distribution and maturity

FynMesh is installable. What it does not have is an ecosystem, and that gap is not close.

| | MF 2.0 | FynMesh |
| --- | --- | --- |
| Packages | MF runtime `latest` checked at 2.9.0; integrations have separate release lines | Published packages; local versions listed at the top |
| Download volume | Previous monthly figures not remeasured | Previous monthly figures not remeasured; downloads alone cannot distinguish CI from adoption |
| Backing | ByteDance Web Infra + Zack Jackson (original MF author) | Single maintainer |
| Docs | Full site, `llms.txt`, every page served as raw `.md` | In-repo notes, with **~18 catalogued contradictions** — 5 in the kernel README alone |
| Adoption | Rspack, Modern.js, Rsbuild, Rspress, Storybook, Zephyr Cloud | Demo only |
| Tests | Extensive, multi-bundler e2e, Playwright | Present and meaningful (share semantics are test-pinned) |
| Deployment-platform integration | `mf-manifest.json` is explicitly a protocol for deployment services; Snapshots can be pre-generated server-side | ❌ |

**Also structurally weaker in FynMesh, from its own review docs:**

- The declared **`KernelConfig` is not wired into kernel construction**; narrower settings such
  as preload options and telemetry configuration exist.
- Bootstrap lock is **global page-wide**.
- Middleware defer has **no timeout**.
- `FynAppRegistry.remove` has a latent bug; the app registry has no semver matching and silently
  overwrites on name collision.
- Historical defect lists are not current bug inventories: the URL-normalization work supersedes
  G8, and G11 records an intentional selection tradeoff. Other old findings need current repros
  before being called open defects.
- Security, observability-by-default, and platform middleware epics unbuilt.

---

## 17. Refreshed assessment

### Core federation: the argument for each

This comparison concerns module discovery, sharing, version resolution, identity, and execution.
Types, plugin ecosystems, inspectors, SSR integrations, and application middleware do not decide
this part of the assessment. A distinctive strength means a built-in contract or capability the
other currently lacks, not something the other could never reproduce with additional orchestration.
Where both provide a capability, the table describes the different contracts rather than calling
either one unique.

| Core concern | Argument for FynMesh | Argument for MF |
| --- | --- | --- |
| **Joining a federation** | **Common-scope participation through normal load/init.** Containers contribute providers and resolve against the established named scope without declaring or registering their peers. This suits independently assembled applications. | **Explicit connections between instance-specific scope maps.** Independently initialized applications do not share merely because their scope names match. The composing application controls which participants exchange dependencies. |
| **Addressing container versions** | **Logical name + semver range is native.** Several container releases can occupy one namespace, and imports select a compatible registered release without inventing a separate name per version. | No built-in range-addressed container contract. Named registrations give the composer explicit deployment selection. One instance holds one remote per name, so versions live in per-consumer URLs, names, aliases or snapshots that someone maintains (§6). Custom resolution is needed for the FynMesh-style range contract. |
| **Dependency requirement granularity** | **Importer-range sets remain runtime metadata.** The resolver can intersect applicable importer constraints associated with a chunk, and the registry retains those constraints. | **Requirements belong to individual compiled consume modules.** Different consuming modules retain their own requirements without relying on an output chunk's importer-range intersection. Both support importer-dependent requirements; neither granularity is inherently superior. |
| **Sharing boundaries** | A common named scope supplies a straightforward boundary for all participating containers. Different scope names separate sharing groups. | **Per-share scopes, multiple scopes, and layers** provide finer configuration of which dependencies participate in which sharing relationships. FynMesh's build path currently omits per-share scope configuration. |
| **Import names and shared identities** | Shared resolution integrates with the loader's canonical URL/specifier records, so resolved providers participate in the same module identity system as other imports. | **Separate `request` and `shareKey`, plus prefix/subpath sharing**, distinguish the import intercepted by the build from the identity negotiated at runtime. FynMesh lacks that configuration surface. |
| **Provider selection and loading** | One consistent built-in selection policy keeps ordinary participation simple. This is a default behavior, not an additional capability MF lacks. | **Selectable version-first / loaded-first strategies and implemented eager sharing** provide controls absent from FynMesh's current hard-coded selection and unimplemented `eager` option. The default `version-first` also eagerly initializes every registered remote during `initializeSharing()` and is marked for removal in source (`runtime-core/src/shared/index.ts:576,581-585`). |

The source basis is §1's scope-map and initialization trace, §5's consume-module and `rvm`
resolution paths, §5.4's sharing options, and §6's container-resolution contract. The same-container
experiment in §5.3 establishes a shared capability; it does not distinguish either side.

**The strongest FynMesh argument is independent participation.** The application chooses what to
load; containers join the common scope and can reuse compatible providers without knowing their
peers. Native versioned-container addressing extends that model to independently evolving releases.
Selecting a registered container is built in; locating an absent release needs a composition-layer
loader, such as the kernel's deployment resolver, whose policy must honor the requested range.
On MF the same case needs someone to maintain per-consumer URLs, names or aliases (§6).

**The strongest MF argument is control over sharing semantics.** The composer connects the intended
participants and can configure dependency identities, sharing boundaries, and selection strategies
more precisely. Runtime `registerRemotes` / `loadRemote` mean these connections need not be declared
at build time. FynMesh's default participation contract remains different from making those
connections dynamically.

### Additional FynMesh stack strengths

1. **Registry inspection and diagnostics**: `Federation.__I()` and the in-page inspector expose
   current module and constraint information without app-specific instrumentation.
2. **An application composition layer**: FynUnit lifecycle, middleware overrides, FynBus, and
   dependency-ordered bootstrap. This is kernel functionality beyond the federation layer.
3. **Embedded metadata and post-build chunk combination**, useful where entry execution during
   discovery is acceptable and request reduction matters.
4. **One explicitly loaded federation substrate by default.** Its deployment model is simple,
   but historical byte measurements do not establish an unavoidable advantage over externalized MF.
5. **Framework-agnostic loading with no bridge layer.** The demo runs React 18/19, Vue, Marko,
   Preact, Solid, and Svelte on one loader (§14), against MF's first-party bridges for React 16–19
   and Vue 3 with a per-React-major import path and two documented hard throws.

### Additional MF stack strengths

1. **SSR integrations and federated TypeScript types**, both absent from the inspected FynMesh stack.
   Coverage is uneven by target: SSR is flagship on Modern.js but absent on Next.js App Router and
   Nuxt (§11), and type distribution carries production and watch-config caveats (§9).
2. **A richer federation-policy plugin API**, with share/remote lifecycle context and shipped retry,
   fallback, and observability integrations. FynMesh's lower-level loader hooks are useful but narrower.
3. **Broader bundler/output support**, published manifest tooling, and deployment integrations.
   Reach is uneven — esbuild is a prototype, Metro is experimental and drops 16 of the 28 plugin
   options, `nextjs-mf` is deprecated, and Angular is third-party only (§14).
4. **Shared tree-shaking**, with significant mode-specific costs and caveats documented in the companion.
5. **Preload controls, DevTools, framework bridges, and component data loading**. Data-prefetch
   support is narrower than a generic cross-framework API (§13).
6. **A substantially broader integration ecosystem.** Exact download counts are not needed to
   establish the visible difference in supported tools; production adoption cannot be measured from
   this repository alone.

### Claims removed by this review

- Per-importer requirements and multiple shared versions in one build are **not unique to FynMesh**.
- MF remote code is **not restricted to one window-global name/version per page**.
- MF runtime duplication is **not an immutable architectural requirement**.
- FynMesh has **loader hooks and URL integrity support**; production state/events also survive.
- Embedded metadata is **not always superior** to metadata-only planning.
- Shared tree-shaking is **not proven universally safe on failure**, and URL identity does not
  make a FynMesh implementation impossible.

## 18. Implications for FynMesh work

The refresh changes the rationale for follow-up work. These are recommendations, not an approved
implementation plan or performance ranking.

| Area | Evidence-based next step |
| --- | --- |
| Resolution correctness | Document and test load-order, chunk-range intersection, singleton override, and bare-name registry behavior before changing defaults. MF also has history-sensitive selection. |
| Runtime policy | Build on existing `System.hook` capabilities; add federation-specific context only where loader wrappers cannot express the required policy cleanly. |
| Production diagnostics | Preserve useful warnings in a configurable sink and wire telemetry where needed; do not rebuild existing state/events/inspector channels. |
| Manifest contract | Check embedded-export coverage, add explicit format evolution rules, and decide when metadata-only discovery is needed. |
| Preload | Implement the declared priority behavior and measure request scheduling against the real graph-discovery path. |
| Types and SSR | Treat these as separate product investments with concrete target integrations; they remain substantial capability gaps. |
| Shared tree-shaking | Explore export coverage, variant identity, and singleton semantics first. Importer metadata helps attribution but cannot reveal independently deployed apps' export needs. |
| Performance | Compare real default/externalized MF builds with FynMesh under the same application workload before claiming a scaling advantage. |

The existing decision against a Chrome extension can stand independently of these corrections.
Additional bundler adapters would need to preserve the registry contract; source inspection does
not establish that all adapters necessarily surrender FynMesh's distinguishing behavior.

---

## Appendix: sources and how to reproduce the inspection

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
- `rollup-federation/rollup-plugin-federation/src/code-generation/container-code.mts:137-145` — multiple emitted versions
- `core/kernel/src/types.ts` — the kernel interface
- `core/kernel/src/modules/middleware-executor.ts:372-433` — the four phases
- `dev-tools/create-fynapp/agent/CONTRACT.md` — the canonical FynApp authoring contract

**Three traps when inspecting the FynMesh side:**

1. **`grep` skips `federation-js.ts`.** It contains a byte that trips grep's binary heuristic. Use
   `grep -a`, or you will conclude `singleton` is unimplemented.
2. **`demo/*/dist/` artifacts are gitignored and may be stale.** Source is authoritative; rebuild with
   `fyn bootstrap` before reading build output.
3. **Several notes contradict the code.** The inspector's status is claimed three different ways
   across two files; `rollup-federation/README.md` calls `singleton` unimplemented;
   `core/kernel/README.md` documents four lifecycle events that do not exist, a `FynMeshKernel` class
   that is not exported, and a `canOverrideExecution` argument order reversed from the implementation.
   **[`BUILD-ARTIFACTS.md`](./BUILD-ARTIFACTS.md) has drifted too** — its line citations are 60–180
   lines stale, and two substantive claims are now wrong: a manifest-splice miss is a hard build
   error, not a warning, and the emitted `exposes` values are source-path strings, not
   `{path, chunk}`. The code on disk wins.
