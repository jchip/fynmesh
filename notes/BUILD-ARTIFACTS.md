# FynApp build artifacts — the JSON files in `dist/`

Every FynApp build emits JSON alongside its JavaScript. This is the reference for what each
file is, who writes it, who reads it, and what breaks if it goes missing.

| Artifact | Purpose | Written by | Read by | Missing it breaks |
| --- | --- | --- | --- | --- |
| `fynapp.manifest.json` | The FynApp's **public contract**: identity, exposes, shared modules, dependencies | `create-fynapp` via the plugin's `emitFederationMeta` hook | kernel (fallback), peer builds, `cfa check` | peer builds lose `shared-providers`; runtime falls back |
| `__FYNAPP_MANIFEST__` (embedded in `fynapp-entry.js`) | The **same manifest**, carried inside the entry file so resolution costs zero extra requests | the plugin, spliced into the container chunk after render | kernel manifest resolver, kernel module loader | **middleware pre-loading silently stops working** |
| `federation.json` | Build/serving **plumbing**: which chunks back which expose, share config, combined-bundle map | the plugin, always unless disabled | `federation-combine`, demo-server preload + cache headers, xrun tasks | preload hints and chunk combining break |
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

**Produced by** `createEmitFederationMeta()` — `dev-tools/create-fynapp/src/index.ts:443`.
The content is built earlier by `createEnrichManifest()` (`dev-tools/create-fynapp/src/index.ts:282`),
which the plugin calls from `generateBundle` (`rollup-federation/rollup-plugin-federation/src/index.mts:378`).
That ordering matters: dynamic imports are only fully collected once every module has been
processed, so `import-exposed` cannot be computed any earlier.

**Read by:**

- `core/kernel/src/modules/manifest-resolver.ts:166` — fetched only when the embedded copy
  was unavailable. Tier 2 of the resolution chain below.
- `detectSharedProviders()` — `dev-tools/create-fynapp/src/index.ts:511`. **Build time, and
  load bearing.** It reads *other* FynApps' manifests from `node_modules/<dep>/dist/` or
  `../<dep>/dist/` to work out which peer provides each shared module. A dependency that has
  not been built yet has no manifest to read, so the consumer's `shared-providers` comes out
  empty and the kernel never learns to load the provider. This is why build order across the
  monorepo is not incidental.
- `check-fynapp.ts:92` — `cfa check` asserts the file exists, parses, and carries identity
  plus a `./main` expose.
- `demo/demo-server/scripts/cache-headers.mts` — deliberately *excluded* from immutable
  caching. The filename is not content-hashed, so freezing it would break deploys.

## `__FYNAPP_MANIFEST__` — the embedded copy

The same manifest object, exported from `fynapp-entry.js` and also assigned onto the
container. The kernel has to load the entry file anyway to get the container, so reading the
manifest from it costs **zero additional requests** — versus one extra round trip per FynApp,
multiplied across the dependency graph.

**Produced in two steps**, because the manifest isn't known when the entry code is generated:

1. `container-code.mts:188` emits a placeholder — `{"__placeholder": true}`.
2. `index.mts:404-441` replaces it with the real manifest in `generateBundle`, matching both
   the development form and terser's mangled form.

The name is registered in `core/kernel/build/reserved-names.mjs:50` so minification cannot
rename it.

**Read by:**

- `core/kernel/src/modules/manifest-resolver.ts:157` — tier 1, the fast path. Falls back
  cleanly if absent.
- `core/kernel/src/modules/module-loader.ts:243` — **load bearing, no fallback.** See below.
- `demo/fynapp-shell-mw/src/middleware/shell-layout.ts:1051` — expose probe, falls back to
  the container's `$E` map.

### The one place with no fallback

`module-loader.ts:243` is Step 6 of FynApp loading — "proactively load middleware from
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

**Produced by** `emitFederationJson()` — `rollup-federation/rollup-plugin-federation/src/code-generation/federation-json.mts:207`.
On by default; suppressed by `emitFederationJson: false`.

**Read by:**

- `combine.mts:183` — `federation-combine` reads it to identify a dist as a federation build,
  and writes the `bundles` map back into it.
- `scripts/xrun-tasks.ts:34` — its *presence* is the test for "this `demo/*` directory is a
  built FynApp", used instead of a hardcoded list.
- `demo/demo-server/scripts/shell-preload.mts:75` — inverts `bundles` into a
  chunk-to-carrier-file map, so preload tags name the file the runtime will actually request.
  Without it, the shell preloads chunk files that combining already folded away.
- `demo/demo-server/scripts/cache-headers.mts` — excluded from immutable caching, same reason
  as the manifest.
- `core/kernel/src/modules/manifest-resolver.ts:171` — last-ditch runtime fallback, and only
  a partial one. See the resolution chain below.

## `__collected_shares.json` — debug only

Emitted at `index.mts:465-480`, and only when the plugin runs with `debugging: true`. Nothing
reads it. It exists to inspect what the share-collection pass saw. Ignore it; deleting it
affects nothing.

---

## How the kernel resolves a manifest

`manifest-resolver.ts:132-180`, in order, first success wins:

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

The fields `buildGraph` walks to find dependencies (`manifest-resolver.ts:226-263`):
`requires`, `import-exposed`, `shared-providers`.

## Two copies, one contract

Both manifests are serialized from the same `runtime.fynappManifest`, so their **content**
cannot drift. What can drift is whether the embedded copy exists at all:

- Injection works by regex-matching generated code, including terser's output shape. A miss
  logs `console.warn` from `index.mts:435` and the build still succeeds.
- `cfa check` inspects the emitted **file** only. It never looks at the embedded export.

So the copy with no runtime fallback is the copy nothing checks. A terser version bump that
changes codegen shape is a plausible way to lose it quietly. Two ways to close that gap, if
it ever bites: assert the embedded export in `check-fynapp.ts`, or give `module-loader.ts:243`
the same fallback chain `manifest-resolver` already has.

## Known inaccuracy in the type

`FynAppManifest.exposes` in `core/kernel/src/types.ts:293` is declared as
`Record<string, { path: string; chunk: string }>`. The emitted manifest actually holds plain
source-path strings (`"./main": "./src/main.ts"`), and `federation.json` uses `{ path, chunks }`
with the key pluralized. Nothing reads past truthiness of the value, so nothing is broken —
but don't write code against that type's shape without checking the real data first.
