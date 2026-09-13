# Module Federation 2.0 — verified internals

Companion to [`MF2-VS-FEDERATION-JS.md`](./MF2-VS-FEDERATION-JS.md). That document *scores*
capabilities; this one records *mechanism*, traced from source, so a claim there can be checked,
corrected, or costed before we consider building an equivalent.

**Source of record:** `module-federation/core` @ `c38c4c0e4` (2026-09-07), packages at **2.9.0**,
checked out locally at `~/dev/module-federation-core`. Every path below is relative to that repo
unless it starts with `notes/`. Line numbers are from that commit.

**Rule for this file:** claims are traced to code or to in-repo docs, and quotes are verbatim. Where
marketing and source disagree, the source wins and the disagreement gets written down.

## Deep dives

| § | Topic | Traced |
| --- | --- | --- |
| [1](#1-shared-dependency-tree-shaking) | Shared dependency tree-shaking | 2026-09-13 |

---

## 1. Shared dependency tree-shaking

The feature behind the "antd 1404 KB → 344 KB, ~75%" number. It is the one MF capability that
attacks *bytes in shared dependencies*, which is the axis `federation-combine` does not touch.

### 1.1 The mechanism in one paragraph

A build that opts in emits **two** copies of each shared package: the copy inside its own bundle is
**pruned** to the exports that build actually referenced, and a separately compiled standalone
container holds the **full** package. At runtime a plugin swaps the getters so `get` points at the
full container and `treeShaking.get` points at the pruned copy, then a decision function picks which
one to hand the consumer. Every failure path — unproven side effects, an opaque `import()`, a missing
snapshot, a coverage miss — resolves to the full copy. The pruning is an *optimistic* fast path with
a full-fat fallback permanently in reach, not a build-time guarantee.

### 1.2 Configuration surface

Off by default. Enabled **per share**, not globally
(`packages/sdk/src/types/plugins/ModuleFederationPlugin.ts:293,319-331`):

```ts
  treeShaking?: boolean | TreeShakingConfig;   // :293

export interface TreeShakingConfig {            // :319
  usedExports?: string[];                       // :323  — manually ADDS to the inferred set
  mode?: 'server-calc' | 'runtime-infer';       // :327
  filename?: string;                            // :331  — default `${version}/share-entry.js`
}
```

`mode` has no config-layer default; the **runtime** defaults an unset mode to `'server-calc'`
(`packages/runtime-core/src/utils/share.ts:73`). Flattened to `treeShakingMode` for the low-level
plugins (`ConsumeSharedPlugin.ts:75`, `ProvideSharedPlugin.ts:73`, plus the JSON schemas under
`packages/enhanced/src/schemas/sharing/`).

Top-level knobs (`packages/sdk/src/types/plugins/ModuleFederationPlugin.ts:540-550`):

| Option | Default | Role |
| --- | --- | --- |
| `treeShakingDir` | `'independent-packages'` | Output dir for the full standalone containers (`TreeShakingSharedPlugin.ts:22`) |
| `injectTreeShakingUsedExports` | `true` | Emit `federation.usedExports` into the bundler runtime (`SharedUsedExportsOptimizerPlugin.ts:49`). Docs recommend `false` under `server-calc` |
| `treeShakingSharedPlugins` | — | Extra plugins for the isolated child builds (externals workarounds) |
| `treeShakingSharedExcludePlugins` | `['HtmlWebpackPlugin','HtmlRspackPlugin']` | Parent plugins to withhold from child builds |

Framework flag: `secondarySharedTreeShaking?: boolean` (default `false`) in `@module-federation/modern-js`
and `modern-js-v3` (`packages/modernjs/src/types/index.ts:19,43`).

> **Not related:** `experiments.optimization.{disableSnapshot,disableRemote,disableShared,target}`
> is *runtime-size* trimming, a different subsystem
> (`packages/sdk/src/types/plugins/ModuleFederationPlugin.ts:480-511`). The only link is that
> `disableShared` also strips the tree-shaking plugin.

### 1.3 Build pipeline — two artifacts, and the inversion

`TreeShakingSharedPlugin` is applied unconditionally whenever `shared` exists
(`packages/enhanced/src/lib/container/ModuleFederationPlugin.ts:277-279`) but no-ops unless some
share sets `treeShaking` **and** `import !== false` (`TreeShakingSharedPlugin.ts:41-45`). It then runs
two sub-plugins:

| Plugin | Produces |
| --- | --- |
| `SharedUsedExportsOptimizerPlugin` | the **pruned** in-bundle copy + the used-export records |
| `IndependentSharedPlugin` | the **full** standalone container, one child compiler per `(shareKey, version)` |

**The inversion is the part that misleads on a first read:** the independently built asset is *not*
the optimized one. It is the untouched safety net. Asserted directly by
`packages/enhanced/test/configCases/tree-shaking-share/infer-strategy/index.js:22-34`:

```js
  expect(Object.keys(uiLibShared.treeShaking.lib()).sort()).toEqual(['Button','default']);
  const uiLibFallback = (await uiLibShared.get())();
  expect(Object.keys(uiLibFallback).sort()).toEqual(['Badge','Button','List','default']);
```

`IndependentSharedPlugin` details worth knowing: `CollectSharedEntryPlugin` records one entry per
distinct resolved version (`:24-70,106-113`) — that is how multi-version survives; each child
compiler gets the parent's plugins minus `IndependentSharedPlugin | ModuleFederationPlugin |
SharedUsedExportsOptimizerPlugin | HtmlWebpackPlugin | TreeShakingSharedPlugin` (`:33-52`), sibling
shares as `import: false` consumes (`:306-326`), and `splitChunks: false` (`:363-366`). Child
compilations are spawned at `finishModules` and `console.log` progress unconditionally (`:227,262,431`)
— real build-time cost, no logger integration.

### 1.4 How the used set is computed — and the two gates

`SharedUsedExportsOptimizerPlugin` hooks `compilation.hooks.dependencyReferencedExports` and
accumulates `Map<shareKey, Set<exportName>>` (`:95-166`), then merges anything hand-written in
`treeShaking.usedExports` (`:61-79`). Two conditions govern whether it may act at all:

1. **Side-effect gate** (`:211-214`) — the hard one:
   ```ts
   if (realSharedModule?.factoryMeta?.sideEffectFree !== true) {
     referenceExports.clear();
     return;
   }
   ```
   The package must declare `"sideEffects": false` or be proven side-effect free by webpack. Otherwise
   nothing is pruned, silently.
2. **Opaque dynamic import bail-out** (`:109-117`) — an `import()` webpack resolves to
   `EXPORTS_OBJECT_REFERENCED` **deletes the whole share key** from the map. It does handle
   `const {Button} = (await import('antd')).default` specially, expanding
   `referencedPropertiesInDestructuring` into `default.<prop>` refs (`:118-139`).

Pruning itself is `UsageState.Used` marking (`:216-232`) followed by
`setUsedConditionally((used) => used === 3, 0, undefined)` (`:263-270`), applied only when every
currently-used export of the real module is inside the referenced set (`:249-262`).

Docs are explicit that this is static analysis and ESM-only —
`apps/website-new/docs/en/guide/advanced/shared-tree-shaking.mdx:122`:

> Your code must use ES Modules (`import`/`export`)… CommonJS (`require`/`module.exports`) modules
> typically cannot be tree-shaken effectively.

### 1.5 Where the used set is recorded

Three sinks, three audiences:

| Sink | Shape | Who reads it |
| --- | --- | --- |
| `__webpack_require__.federation.usedExports` | `{"antd":["Button","Badge"]}` | this build's own `consumes()` (`SharedUsedExportsOptimizerRuntimeModule.ts:28-45`) |
| `mf-stats.json` → `shared[].usedExports` | `string[]` | your CI aggregator, the treeshake server (`SharedUsedExportsOptimizerPlugin.ts:282-322`; type at `packages/sdk/src/types/stats.ts:83-96`) |
| `federation.sharedFallback` | `{antd: [[assetPath, version, globalName]]}` | the runtime's fallback getter (`IndependentSharedRuntimeModule.ts:32-43`), mirrored to `mf-stats.json` as `fallback`/`fallbackName` |

Stats emission is gated on `manifest` being enabled. Global name is
`encodeName(\`${mfName}_${shareName}_${version}\`)` where `mfName` carries a `_t_`/`_f_` marker for
"was this a secondary (re-shaken) build" (`SharedContainerPlugin.ts:45`, `IndependentSharedPlugin.ts:290`).

### 1.6 Runtime — the getter swap

`init()` installs a runtime plugin literally named `tree-shake-plugin` whose `beforeInit` hook
performs the swap (`packages/webpack-bundler-runtime/src/init.ts:39-57`):

```ts
sharedArg.treeShaking ||= {};
sharedArg.treeShaking.get = sharedArg.get;          // pruned in-bundle factory
sharedArg.get = bundlerRuntime.getSharedFallbackGetter({ ... });   // full independent container
```

It then reads the **global snapshot** (`:60-64`) and `patchShared` (`:76-125`) copies
`treeShakingStatus` onto `treeShaking.status`; if `secondarySharedTreeShakingEntry` +
`secondarySharedTreeShakingName` + `libraryType` are present it *replaces* `treeShaking.get` with a
loader for the server-built secondary entry. Snapshot fields: `packages/sdk/src/types/snapshot.ts:17-25`.

Each consume site injects **its own** requirements (`packages/webpack-bundler-runtime/src/consumes.ts:66,76-81`):

```ts
const usedExports = getUsedExports(webpackRequire, shareKey);
if (usedExports) customShareInfo.treeShaking = { usedExports, useIn: [instance.options.name] };
federationInstance.loadShare(shareKey, { customShareInfo, context: {...} })
```

Storage shape is unchanged from ordinary sharing —
`ShareScopeMap = scope → pkg → version → Shared` (`packages/runtime-core/src/type/config.ts:120-126`)
— with the shaken variant as a **`Shared.treeShaking` sub-object on the same version entry**. One
shaken slot per `(scope, pkg, version)`.

### 1.7 The decision function

`shouldUseTreeShaking` (`packages/runtime-core/src/utils/share.ts:120-144`), against
`TreeShakingStatus` (`packages/sdk/src/constant.ts:37-50`):

| status / mode | result |
| --- | --- |
| `NO_USE` (0) | full |
| `CALCULATED` (2) | pruned |
| `runtime-infer`, no consumer `usedExports` | pruned |
| `runtime-infer`, consumer `usedExports` present | pruned **iff** consumer's set ⊆ candidate's set (`isMatchUsedExports`, `:212-231`) |
| `server-calc` + `UNKNOWN` (1) | **full** — falls through the bottom |

Selection then runs the normal `shareStrategy` comparators — `findSingletonVersionOrderByVersion`
(`:233-274`) or `findSingletonVersionOrderByLoaded` (`:284-346`) — both of which compute
`shouldUseTreeShaking(treeShaking)` **with no consumer `usedExports` argument**, prefer versions that
have a `treeShaking` record, and on finding none reset to `false` and re-run. Final pick is
`directShare()` (`:546-555`):

```ts
export function directShare(shared: Shared, useTreesShaking?: boolean): Shared | TreeShakingArgs {
  if (useTreesShaking && shared.treeShaking) return shared.treeShaking;
  return shared;
}
```

Hard incompatibility with `eager` (`:44-48`) — an `error()`, not a warning:

> cannot use both "eager: true" and "treeShaking.mode" simultaneously. Choose one strategy.

### 1.8 The two modes

**`runtime-infer`** — no infrastructure. Each build declares what it uses; a subset check decides
whether an already-loaded pruned copy covers this consumer, else the full bundle.
`apps/website-new/docs/en/guide/advanced/shared-tree-shaking.mdx:59-69`:

> **Best for**: local development and quick validation, teams without a deployment or CI service,
> smaller projects with a single consumer… **Improving hit rate**: without a global view, the reuse
> rate of `runtime-infer` may be limited. You can manually augment the `usedExports` list…

That manual augmentation is not hypothetical — the official demo hand-writes each side's exports into
the *other* side's config, in both directions
(`apps/shared-tree-shaking/no-server/host/module-federation.config.ts:11-15` with
`// add provider used exports`; `.../provider/module-federation.config.ts:12-16` with
`// add consumer used exports`). For independently deployed teams that is a standing coupling.

**`server-calc`** — `mdx:71-73` calls it "the **strongly recommended best practice**". A centralized
service produces a globally optimal pruned artifact; the snapshot points at it; the runtime loads it.
This is the mode the 75% figure belongs to in practice, because it is the only one with a global view.

### 1.9 The server, and what it does *not* do

`@module-federation/treeshake-server` @ 2.9.0 (`packages/treeshake-server/`) — a Hono service + CLI,
*"installs dependencies, builds with Rspack, and uploads artifacts."*

Routes (`src/app.ts:61-68`): `POST /tree-shaking-shared/build`, `POST …/build/check-tree-shaking`
(can this package be shaken at all), `GET …/healthz`.

Request (`src/domain/build/schema.ts:11-32`):

```ts
  shared: z.array(z.tuple([z.string(), z.string(), z.array(z.string())]))
    .describe('List of plugins: [name, version, usedExports]'),
  target, libraryType, hostName, uploadOptions?
```

Pipeline (`src/services/buildService.ts:215-242`): materialize `template/re-shake-share` into a
tmpdir keyed by `sha256(config)` → `pnpm i --ignore-scripts` → `SECONDARY_TREE_SHAKING=true rspack build`
→ read `mf-stats.json` for `fallback`/`fallbackName`/`usedExports`/`canTreeShaking` (`:167-211`) →
upload to `tree-shaking-shared/<SERVER_VERSION>/<sharedKey>/<sha256(config)>.js`
(`src/services/cacheService.ts:14-46`).

**The critical gap: the server does not aggregate.** It takes a *pre-computed union*. Collecting
`usedExports` from every app's `mf-stats.json` and merging them is your CI's job, specified
prose-only at `apps/website-new/docs/en/_components/create-shared-tree-shaking-deploy-server.mdx:5-32`:

> ### 1. Aggregate `usedExports` during deployment
> In your CI/CD deployment pipeline, your service should: collect build metadata for all applications
> about to be released (typically `mf-stats.json` or similar files); for the same shared dependency
> (e.g. `antd@6.1.0`), aggregate the `usedExports` declared by each application.
> ### 2. Compute the global minimum union
> … ### 4. Update and publish the Snapshot
> Upload the optimized bundle to your static asset host (CDN). Then update the Module Federation
> Snapshot file… `secondarySharedTreeShakingEntry`… `secondarySharedTreeShakingName`…
> `treeShakingStatus`: mark as available.

So the full-value configuration is: **a deploy-time build service + a cross-app usage aggregator + a
snapshot-mutation step in CI.** It pays off only for an organization that already owns its deployment
platform — the same bet as MF's manifest protocol. A human-driven alternative exists in
`packages/treeshake-frontend` (a React dashboard where you type share name/version/usedExports).

### 1.10 Safety fallbacks

Eight of them, which is the honest tell about how much is being trusted to static analysis:

1. Not `sideEffectFree` → no pruning at build (`SharedUsedExportsOptimizerPlugin.ts:211-214`)
2. Opaque `import()` → share key dropped entirely (`:109-117`)
3. `server-calc` + `UNKNOWN` → full (`share.ts:143`)
4. `NO_USE` → full (`share.ts:128-130`)
5. Coverage miss, where data exists → next candidate (`share.ts:436-451`)
6. No shaken candidate on any version → `useTreesShaking = false`, re-run (`share.ts:259-273,331-345`)
7. `loadShare` false → `treeShakingGetter?.() || getter()` (`consumes.ts:105`)
8. `sharedFallback` absent → `getSharedFallbackGetter` returns the factory unchanged
   (`getSharedFallbackGetter.ts:12-19`); present-but-version-missing → throws (`:23-27`)

Stated as policy at `shared-tree-shaking.mdx:93`:

> If the runtime detects issues (Snapshot not delivered, network errors, version mismatch, etc.), it
> defaults to loading the full shared dependency bundle to keep the application stable.

### 1.11 Known soft spots

Three findings that cut against the headline, all verified:

**(a) `runtime-infer`'s subset check is mostly inert.** `ShareRuntimeModule.ts:107` emits only
`{mode}` into `initOptions.shared` — never the *candidate's* `usedExports`. With no candidate data,
`isMatchUsedExports` returns `false` for lack of inputs, so in the webpack pipeline the mode
degenerates to "prefer the shaken copy on the selected version whenever one exists." Candidate
`usedExports` is only populated if a runtime plugin or snapshot injects it. Compounding this, the
coverage check is reachable **only** from the non-singleton `requiredVersion`-miss loop
(`share.ts:430-451`); the singleton path (`:395-415`) and the max-version happy path (`:423-428`)
never compare export sets at all.

**(b) No runtime discriminator between differently-shaken copies.** One `treeShaking` slot per
`(scope, pkg, version)`, and nothing hashes the export set into an identity. Only the `server-calc`
*CDN URL* is content-hashed; the `globalName` is not — it is
`encodeName(\`${mfName}_${sharedName}_${version}\`)`
(`treeshake-server/src/domain/build/retrieve-global-name.ts:14-20`, matching `SharedContainerPlugin.ts:45`).
Two differently-shaken artifacts for the same `(host, pkg, version)` collide on `window.<globalName>`.
The design assumes the server publishes exactly one union artifact per key.

**(c) It can break `singleton`, and the docs say so** — `shared-tree-shaking.mdx:110-118`:

> App A uses only `antd/Button` and loads its own tree-shaken bundle. App B uses `antd/Modal` and
> loads its own full bundle. This can result in two different antd instances on the same page (a
> minimal one and a full one). That breaks the singleton constraint and may cause style conflicts,
> non-shared state, or even crashes. **Recommendation**: for libraries that must remain singleton,
> prefer **`server-calc`**…

### 1.12 Maturity

Introduced in commit `f46cdd608` (2026-01-23), *"feat: support shared tree shaking (#4084)"*. Not
behind an `experiments` flag and marketed as stable in the 2.0 blog — but:

- The **Rspack** path pins a canary: `"@rspack/core": "npm:@rspack-canary/core@1.7.3-canary-58d41d16-20260115035302"`
  (`treeshake-server/template/re-shake-share/package.json:13-17`), and the wrapper still carries
  `// @ts-expect-error wait rspack release` (`packages/rspack/src/TreeShakingSharedPlugin.ts:20`).
- Open TODOs on the multi-consumer case: `runtime-core/src/utils/share.ts:501`
  (`// TODO: consider multiple treeShaking shared scenes`),
  `webpack-bundler-runtime/src/init.ts:113`, `SharedUsedExportsOptimizerPlugin.ts:191`.
- Shape churn: the demo runtime plugin reads `shared.usedExports` as `[runtime, names][]` tuples
  (`apps/shared-tree-shaking/no-server/host/runtimePlugin.ts:16-20`) while the plugin writes a flat
  `string[]` (`SharedUsedExportsOptimizerPlugin.ts:311`) — dead code from an earlier shape.
- CI is real: `.github/workflows/e2e-shared-tree-shaking.yml`, `e2e-treeshake.yml`, and fixtures under
  `packages/enhanced/test/configCases/tree-shaking-share/`.
- DevTools surfaces it — `packages/chrome-devtools/src/component/SharedDepsExplorer/index.tsx:159,217-218,295-301`
  filters by `treeShakingMode` and badges `Tree Shaking Loaded` / `Loaded` / `Tree Shaking Loading`.

### 1.13 Mental model

```
BUILD (primary, treeShaking set)
  ├─ SharedUsedExportsOptimizerPlugin
  │    ├─ collect referenced exports → Map<shareKey, Set<name>>
  │    ├─ + config treeShaking.usedExports
  │    ├─ gate: real module must be sideEffectFree, else clear
  │    ├─ prune the IN-BUNDLE copy (setUsedConditionally)
  │    ├─ → federation.usedExports  (runtime global)
  │    └─ → mf-stats.json  shared[].usedExports
  └─ IndependentSharedPlugin
       └─ per (shareKey, version) child compiler → FULL standalone container
            → federation.sharedFallback = {pkg: [[asset, version, globalName]]}

RUNTIME
  init() → tree-shake-plugin.beforeInit
       treeShaking.get = original (PRUNED) getter
       get             = getSharedFallbackGetter(...)  → FULL container
       snapshot patch: treeShakingStatus + secondarySharedTreeShakingEntry
                       → treeShaking.get = load server-shaken secondary entry
  consumes() → loadShare(key, {customShareInfo:{treeShaking:{usedExports, useIn}}})
       → shareStrategy picks a version
       → shouldUseTreeShaking(status, mode, [usedExports])
       → directShare() returns Shared.treeShaking | Shared

SERVER (server-calc, external — YOU build the aggregator)
  CI: union usedExports across every app's mf-stats.json
  POST /tree-shaking-shared/build {shared:[[name,version,usedExports]], target, libraryType, hostName}
  → tmp project + pnpm i + SECONDARY_TREE_SHAKING=true rspack build
  → upload to tree-shaking-shared/<SERVER_VERSION>/<key>/<sha256(config)>.js
  → CI writes secondarySharedTreeShakingEntry/Name + treeShakingStatus=2 into the Snapshot
```

### 1.14 What this means for FynMesh

Recorded as analysis, not a plan. No ticket exists for any of this.

- **The §13 framing holds and strengthens.** MF attacks bytes, FynMesh attacks requests
  (`federation-combine`). MF's byte win is real, but reaching it requires deploy-time infrastructure
  we do not have, and the cheap mode (`runtime-infer`) both under-delivers (§1.11a) and carries a
  documented singleton hazard (§1.11c). `federation-combine` needs no runtime negotiation and
  degrades to one extra request.
- **The prerequisite we lack is not the algorithm, it's the identity.** MF can swap a pruned copy for
  a full one because `Shared.treeShaking` is a *second slot on the same version entry* and every
  failure path falls back to the first. Our registry files a module under its URL with the specifier
  as a redirect — the **"One File, One Address"** invariant (`federation-js.ts:57-127`). Two shapes of
  the same module at the same version is precisely what that invariant exists to forbid. Any port
  would have to answer that first, not second.
- **Per-importer resolution is a better input than MF has.** `rvm` already carries the importer
  directory per chunk, so the set of importers of a share key is known at build time in a way MF has
  to reconstruct from `dependencyReferencedExports`. If the used-export set were collected per
  importer directory alongside `rvm`, the union is computable *within one build* rather than needing
  a cross-app CI aggregator — the thing MF pushed onto its users at
  `create-shared-tree-shaking-deploy-server.mdx:5-32`.
- **The side-effect gate is the real ceiling.** It applies identically to any implementation:
  no `"sideEffects": false`, no pruning. That caps the addressable surface to well-behaved ESM
  libraries regardless of substrate.

---

## Corrections this forced in `MF2-VS-FEDERATION-JS.md`

| Line | Was | Now |
| --- | --- | --- |
| `:203` | "✅ Rspack-first" | webpack has the full TS implementation in `packages/enhanced`; Rspack delegates to a native plugin and does **not** auto-apply it |
| `:440` | attributed 1404→344 to `server-calc` | the figure is from the v2-stable blog describing the feature generally (`v2-stable-version.mdx:33`); `server-calc` is what makes it *reachable* multi-app |
| `:886` | "only bundler with shared tree-shaking" | Rspack is *recommended* (native, canary-pinned); webpack is supported and is the reference implementation |
| `:852`, `:1048` | unqualified wins | qualified with the opt-in cost and the `runtime-infer` caveats |
