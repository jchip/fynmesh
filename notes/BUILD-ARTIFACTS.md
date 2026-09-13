# FynApp build artifacts — the JSON files in `dist/`

Every FynApp build emits JSON alongside its JavaScript. This is the reference for what each
file is, who writes it, who reads it, and what breaks if it goes missing.

> Line numbers verified 2026-09-13. Note that `rollup-federation/` is a **separate git repo**,
> nested here and gitignored (`.gitignore:5`) — not a submodule. Citations into it drift with
> *its* history, independently of any fynmesh commit, so they go stale without anything in this
> repo changing. Checked against `rollup-plugin-federation@1.1.2` / `federation-js@1.1.3`
> (`56ffefc`).

| Artifact | Purpose | Written by | Read by | Missing it breaks |
| --- | --- | --- | --- | --- |
| `fynapp.manifest.json` | The FynApp's **public contract**: identity, exposes, shared modules, dependencies | `create-fynapp` via the plugin's `emitFederationMeta` hook | kernel (fallback), peer builds, `cfa check` | peer builds lose `shared-providers`; runtime falls back |
| `__FYNAPP_MANIFEST__` (embedded in `fynapp-entry.js`) | The **same manifest**, carried inside the entry file so resolution costs zero extra requests | the plugin, spliced into the container chunk after render | kernel manifest resolver, kernel module loader | middleware pre-loading stops working — but the build now fails rather than ship it |
| `federation.json` | Build/serving **plumbing**: which chunks back which expose, share config | the plugin, unless `emitFederationJson: false` | xrun tasks, demo-server cache headers | nothing required — every runtime path works without it |
| `federation.bundles.json` | The **combined-bundle map an app offers**: which file carries which module, readable without executing anything | `federation-combine`, only when it combined something | demo-server preload + shell declaration | preloads name files the runtime never requests |
| `__collected_shares.json` | Debug dump of collected share records | the plugin, only under `debugging: true` | nothing | nothing |

The two manifests always carry identical content — they are serialized from the same
`runtime.fynappManifest` object. They are *not* interchangeable at runtime: see
[Two copies, one contract](#two-copies-one-contract).

---

## `fynapp.manifest.json` — the public contract

What one FynApp needs to know about another before loading it. This is the input to the
kernel's dependency graph.

```jsonc
{
  "name": "fynapp-1",
  "version": "1.0.0",
  "exposes": { "./main": "./src/main.ts" },      // expose key -> source path
  "consume-shared": { "esm-react": { "semver": "^19.0.0" } },
  "provide-shared": { "esm-react": { "singleton": true, "semver": "^19.0.0" } },
  "import-exposed": {                             // modules pulled from other FynApps
    "fynapp-design-tokens": {
      "middleware/design-tokens/design-tokens": {
        "type": "middleware",                     // "middleware" | "module"
        "exposeModule": "middleware/design-tokens",
        "middlewareName": "design-tokens",
        "sites": ["src/main.ts"]
      }
    }
  },
  "shared-providers": {                           // who provides what this app consumes
    "fynapp-react-lib": { "semver": "^19.0.0", "provides": ["esm-react"] }
  }
}
```

**Produced by** `createEmitFederationMeta()` — `dev-tools/create-fynapp/src/index.ts:528`,
emitting the asset at `:547`. The content is built earlier by `createEnrichManifest()`
(`dev-tools/create-fynapp/src/index.ts:357`), which the plugin calls from `generateBundle`
(`rollup-federation/rollup-plugin-federation/src/index.mts:527`). That ordering matters:
dynamic imports are only fully collected once every module has been processed, so
`import-exposed` cannot be computed any earlier.

**Read by:**

- `core/kernel/src/modules/manifest-resolver.ts:178` — fetched only when the embedded copy
  was unavailable. Tier 2 of the resolution chain below.
- `detectSharedProviders()` — `dev-tools/create-fynapp/src/index.ts:566`. **Build time, and
  load bearing.** It reads *other* FynApps' manifests from `node_modules/<dep>/dist/` or
  `../<dep>/dist/` (`:606-615`) to work out which peer provides each shared module. A
  dependency that has not been built yet has no manifest to read, so the consumer's
  `shared-providers` comes out empty and the kernel never learns to load the provider. This is
  why build order across the monorepo is not incidental.
- `check-fynapp.ts:98-127` — `cfa check` asserts the file exists, parses, carries a `name` and
  `version` matching `package.json`, and has a `./main` expose.
- `demo/demo-server/scripts/cache-headers.mts:74-78` — deliberately *excluded* from immutable
  caching. The filename is not content-hashed, so freezing it would break deploys.

## `__FYNAPP_MANIFEST__` — the embedded copy

The same manifest object, exported from `fynapp-entry.js` and also assigned onto the
container. The kernel has to load the entry file anyway to get the container, so reading the
manifest from it costs **zero additional requests** — versus one extra round trip per FynApp,
multiplied across the dependency graph.

**Produced in two steps**, because the manifest isn't known when the entry code is generated:

1. The load hook sets `runtime.fynappManifest = { __placeholder: true }` (`index.mts:470`),
   and `container-code.mts:220` bakes that stub into the generated entry code.
2. `index.mts:539-597` replaces it with the real manifest in `generateBundle`, matching both
   the development form and terser's mangled form. A miss is a **hard build error**
   (`index.mts:580-585`) — see [Two copies, one contract](#two-copies-one-contract).

The name is registered in `core/kernel/build/reserved-names.mjs:50` so minification cannot
rename it.

**Read by:**

- `core/kernel/src/modules/manifest-resolver.ts:169` — tier 1, the fast path. Falls back
  cleanly if absent.
- `core/kernel/src/modules/module-loader.ts:265` — **load bearing, no fallback.** See below.
- `demo/fynapp-shell-mw/src/middleware/shell-layout.ts:1304` — expose probe, falls back to
  the container's `$E` map.

### The one place with no fallback

`module-loader.ts:252-265` is Step 6 of FynApp loading — "proactively load middleware from
dependencies". It reads the manifest straight off the container:

```ts
const manifest = (container as any).__FYNAPP_MANIFEST__ || null;
const importExposed = manifest?.["import-exposed"];
```

No fetch, no fallback, guarded by optional chaining. If the embedded manifest is missing,
`importExposed` is `undefined` and the whole block is **skipped in silence** — no warning, no
error, no degraded path.

The failure is not obvious from where it happens. The provider FynApps still load, because
`buildGraph` walks `import-exposed` too and *that* path has the JSON fallback. What doesn't
happen is the middleware modules being pulled from those providers and registered. The
symptom surfaces later, at a consumer, as middleware that was never registered.

Everywhere else that reads a manifest degrades gracefully. This one place does not.

## `federation.json` — build and serving plumbing

Not a contract between FynApps; a record of what the build actually produced.

```jsonc
{
  "name": "fynapp-1",
  "filename": "fynapp-entry.js",
  "shareScope": "fynmesh",
  "exposes": { "./main": { "path": "./src/main.ts", "chunks": ["main-ZwgvNeC_.js"] } },
  "shared": { "esm-react": { "moduleIds": [], "chunks": [], "config": { "semver": "^19.0.0" } } },
  "timestamp": "2026-08-22T15:51:21.572Z",
  "version": "1.0.0",
  "bundles": {                                    // added by federation-combine, if it ran
    "combo-R7IaSAnm.js": ["hello-B9dQ6FmL.js", "getInfo-CH7m3ozA.js"]
  }
}
```

**Produced by** `emitFederationJson()` — `rollup-federation/rollup-plugin-federation/src/code-generation/federation-json.mts:269`.
On by default; suppressed by `emitFederationJson: false`, which still returns the info object
because `emitFederationMeta` consumers need it either way.

**Nothing requires it.** No runtime path needs it, and `emitFederationJson: false` is a
legal way to build a FynApp. Its readers are all tooling:

- `scripts/xrun-tasks.ts:40` — its *presence* is the test for "this `demo/*` directory is a
  built FynApp", used instead of a hardcoded list.
- `demo/demo-server/scripts/cache-headers.mts:74-78` — excluded from immutable caching, same
  reason as the manifest.
- `rollup-federation/rollup-plugin-federation/src/combine.mts:321-330,727-732` — keeps its
  `bundles` record current when the file is there (never creating one), and reads it as a
  fallback for a dist combined before `federation.bundles.json` existed. Neither required.
- `core/kernel/src/modules/manifest-resolver.ts:181-184` — last-ditch runtime fallback, and
  only a partial one. See the resolution chain below.

## `federation.bundles.json` — the map an app offers

Which physical file carries which module, after `federation-combine` folded a dist's small
chunks together:

```json
{ "startup-xyz89iL6.js": ["index.js", "react-esm-19.production-CG2aTnPt.js"] }
```

An ordinary import needs none of this: `federation-combine` appends a `_B(...)` statement to
the container entry, so the runtime resolves a member to its carrier as soon as that entry
has run (see the embedded-manifest section for the same trick applied to the manifest).

This file exists for the decisions that happen *before* anything has run. A preload hint
naming a member's own url names a file the runtime will never request — the carrier is
fetched instead, so the hint is wasted and the round trip it was meant to remove comes back.
Reading this file answers "what will actually be fetched?" without executing a line, and
without the app having to emit `federation.json` at all. A host hands it to the runtime with
`Federation.declareBundles(map, distBase)`.

**Produced by** `federation-combine` (`combine.mts:714-726`), only when a run actually
combined something, and removed again when a run does not — so its presence is itself the
signal that a dist has bundles to offer, and a leftover file can never describe a dist that no
longer matches it.

**Read by** `demo/demo-server/scripts/shell-preload.mts:114-115`, for the two things a page
needs it for: `collectShellPreloadModules` (`:223`) inverts it so preload tags name the
carrier, and `collectShellBundleMaps` (`:309`) passes it through for the shell to declare.
Both go through one reader, so a page cannot preload one file while telling the runtime
another. It falls back to `federation.json`'s `bundles` field for a dist built by older
tooling — which is the ordinary condition for a host that consumes apps it did not build.

Like the two manifests, it is excluded from immutable caching (`cache-headers.mts:74-78`) —
and it is the worst of the three to freeze, because a stale copy names carrier files a later
deploy no longer has.

## `__collected_shares.json` — debug only

Emitted from the `banner` hook at `index.mts:630-643`, and only when the plugin runs with
`debugging: true`. Nothing reads it. It exists to inspect what the share-collection pass saw.
Ignore it; deleting it affects nothing.

---

## How the kernel resolves a manifest

`manifest-resolver.ts:132-192`, in order, first success wins:

| Tier | Source | Cost | Completeness |
| --- | --- | --- | --- |
| 1 | `__FYNAPP_MANIFEST__` from the entry module | free — the entry loads anyway | full |
| 2 | `fetch(fynapp.manifest.json)` | one extra request | full |
| 3 | `fetch(federation.json)` | one extra request | **partial** |
| 4 | Synthesized `{ name, version, requires: [] }` | none | empty |

Tier 3 is a lenient fallback, not an equivalent. `federation.json` has no `import-exposed`
and no `shared-providers`, and its `exposes` values are objects rather than source-path
strings. A FynApp resolved that way comes up with **no dependency edges at all** — it loads,
but nothing it depends on gets loaded with it.

The fields `buildGraph` walks to find dependencies (`manifest-resolver.ts:238-275`):
`requires`, `import-exposed`, `shared-providers`.

## Two copies, one contract

Both manifests are serialized from the same `runtime.fynappManifest`, so their **content**
cannot drift. What could drift is whether the embedded copy exists at all — injection works by
regex-matching generated code, before and after minification, so a change in terser's output
shape can stop it matching.

That used to fail quietly: a miss logged a `console.warn`, the build succeeded, and the
container shipped with `__FYNAPP_MANIFEST__` still set to the stub. Nothing downstream caught
it, because the copy with no runtime fallback is the copy nothing checks — `cfa check`
inspects the emitted **file**, a different artifact. And it was not hypothetical: the regex
pinned the export-name quote to `"`, while rollup's systemjs output writes `'`, so the splice
missed on every unminified build and the placeholder shipped unnoticed.

**Closed at the build (FYM-296).** A container chunk carrying the stub is not a usable
artifact, so a miss now calls `this.error` (`index.mts:580-585`) and fails the build. Both
quote forms are matched (`index.mts:572-578`), and the regression is covered:
`tests/index.test.mts:334` asserts the build rejects, `tests/embedded-manifest.test.mts:79-83`
asserts no `__placeholder` survives into a real build.

The asymmetry itself remains, and is deliberate — noted in-source at `check-fynapp.ts:91-96`
and `module-loader.ts:255-264`. `cfa check` still never looks at the embedded export, and
`module-loader.ts:265` still has no fallback. What changed is that a build can no longer
produce the artifact that would expose either gap.

## Two `exposes`, two shapes

The same expose keys appear in both JSON artifacts with different value shapes, which is worth
keeping straight when reading either one:

| File | Shape | Example |
| --- | --- | --- |
| `fynapp.manifest.json` | source path, a plain string | `"./main": "./src/main.ts"` |
| `federation.json` | `{ path, chunks }`, key pluralized | `"./main": { "path": "./src/main.ts", "chunks": [...] }` |

`FynAppManifest.exposes` (`core/kernel/src/types.ts:329-337`) declares the string form, which
is the one the kernel reads; `federation.json` is the only artifact that names build output.
