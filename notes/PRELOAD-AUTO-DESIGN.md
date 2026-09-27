# Automatic preloading — design

**Status:** PROPOSED. Nothing here is implemented.
**Date:** 2026-09-26

## Goal

One claim, backed by a number:

> Ask for an app, and every file it will need starts downloading at once. Lazy
> chunks stay lazy.

Preloading gets a plate on the features page when three things hold:

1. **No hand-written chunk lists.** The build decides which files are startup files.
2. **No extra call.** The standard load APIs do it.
3. **A measured win** on the real demo, cold cache.

None of the three holds today.

## What exists today

### Runtime hints

`manifest-resolver.ts` hints `fynapp-entry.js` for the requested apps and their
direct dependencies (depth 1 by default). `browser-kernel.ts` turns each hint into
`<link rel="preload" as="script">`, translated to the combined carrier file through
`Federation.bundleUrlFor`.

Reading the code, these hints save close to nothing:

- **A dependency's hint lands right before its import.** `visitDep` hints the entry,
  then `visit` calls `resolveAndFetch`, which imports that same entry at once to
  read the embedded manifest. The hint and the real request leave together.
- **Siblings are serial.** The hint for dependency B goes out only after dependency
  A's whole subtree has been walked.
- **The one real overlap** is `warmPreload`. It hints every requested app's entry
  before the walk starts, so it helps when several apps are requested together.

The Perf Lab measured this. In `/shell?perf=combined`, the suite's 4 entries arrive
in strict sequence, about 85 ms apart at 80 ms per response, even with the runtime
hints. Page-level hints for every entry cut time to ready from ~1125 ms to ~600 ms.
See [`PERF-LAB-DESIGN.md`](./PERF-LAB-DESIGN.md#findings).
`route-based-preloading.md` describes these hints as running "in parallel with
graph building". The code does not do that.

### The load chain

Embedded manifests are tier 1, so reading an app's manifest means fetching and
running its entry. The graph walk is therefore a chain of entry fetches, one level
of the dependency tree per round trip.

Behind each entry is a second chain. SystemJS finds a chunk's static imports only
after that chunk arrives. So `./main` and the chunks it imports load one level per
round trip. No runtime hint covers them.

### The demo shell

`demo/demo-server/scripts/shell-preload.mts` writes preload tags into
`shell.html` at build time. The chunk list is hand-written per app ("all", "none",
or named stems). A glob would pull the ~1 MB AG Grid chunk into cold start. This cut
cold start from 575 ms to 181 ms (−69%, [`SHELL_LOAD_PERF.md`](./SHELL_LOAD_PERF.md)).

The shell calls `loadFynApp(url)`, which skips runtime hints entirely.

### Priority

`PreloadStrategy.priorityByDepth` is accepted and never read. No hint sets
`fetchpriority`.

## Design

Four steps. Step 1 is the base. Step 2 carries the automatic claim. Step 3 serves
hosts that own their HTML. Step 4 is the proof.

### Step 1 — Build: record each expose's startup chunks

`federation.json` lists only an expose's own chunk:

```json
"exposes": { "./main": { "path": "./src/main.ts", "chunks": ["main-0SABD0a0.js"] } }
```

The plugin builds the manifest in `generateBundle`, where the full `bundle` is in
hand. Each chunk there has `imports` (static) and `dynamicImports` (lazy). Walk
`imports` from each expose's chunk and record the closure in a new manifest field:

```json
"expose-chunks": {
  "./main": ["main-0SABD0a0.js", "App-D2kq81Lm.js", "vendor-Qm3hTz9P.js"],
  "./hello": ["hello-B9dQ6FmL.js"]
}
```

- **Static imports only.** A dynamic import is a lazy chunk by definition, so the AG
  Grid case falls out with no list to maintain.
- **One field, two copies.** `fynapp.manifest.json` and the embedded
  `__FYNAPP_MANIFEST__` are serialized from the same object, so both get it.
- **Names members, not carriers.** Combining runs later. Readers translate member to
  carrier with the existing machinery (`bundleUrlFor` at runtime,
  `federation.bundles.json` at build time).
- **Additive.** Older kernels ignore it. A dist resolved through the tier-3
  `federation.json` fallback has no field and gets entry hints only.

### Step 2 — Kernel: hint as soon as each manifest arrives

When `visit` has a node's manifest, and before it walks any dependency:

1. **Hint every dependency's entry at once.** This fixes the serial sibling
   problem. A node with five dependencies starts five downloads together.
2. **Hint the node's startup chunks.** The kernel loads `./config` and `./main` at
   bootstrap (`module-loader.ts` steps 3 and 5), plus whatever exposes consumers
   name in `import-exposed`. Hint the `expose-chunks` closure of each.

**Keep the walk serial.** Hints change when bytes arrive, not the order code runs.
Share selection depends on that order: `semverMatch` is first match over share
insertion order, and insertion order follows container load order (see
`rollup-federation/notes/combined-module-bundles.md` §9). Running entries in
parallel would make version picks depend on network timing. Parallel downloads
with serial execution get the network win and keep picks deterministic.

**Cover the direct path.** `loadFynApp(url)` imports the entry, then loads
`./config` and `./main`. Once the entry has run, the embedded manifest is readable.
Hint the startup chunks at that point, before step 3. The shell then benefits with
no change to its deliberate load order.

**Priority.** Make `priorityByDepth` real: depth 0 gets `fetchpriority="high"`,
deeper levels `auto`, and apps loaded at idle `low`. Browsers without
`fetchpriority` ignore it. If this proves not worth it, delete the option instead of
leaving config that does nothing.

### Step 3 — HTML hint helper

Runtime hints start only after the kernel has loaded. Tags in the page's HTML start
sooner, and that is where the demo's −69% came from.

Export a Node function from `rollup-plugin-federation`, next to `combineDist`:

```ts
preloadTags(dists: string[], options?: { base?: string; priority?: Record<string, "low"> }): string
```

For each dist it reads `fynapp.manifest.json` and `federation.bundles.json`. It
returns tags for the entry plus the `./config` and `./main` closures, translated to
carriers and deduped. `shell-preload.mts` becomes one call, and its `StartupChunks`
lists go away.

This replaces the automation section (§3) of
`core/kernel/design/PRELOAD-HINTS-API-DESIGN.md`. That proposal made a route config
the source of truth. Here the host picks which apps, and the build's import graph
picks which files.

### Step 4 — Measure, then publish

Measure `shell.html` cold start four ways: no hints, runtime hints only, HTML hints
only, and both. Use the `SHELL_LOAD_PERF.md` method: cold cache, median of at least
3 runs, metric is the last resource in the startup chain. Add one throttled-network
run, where round trips dominate.

Also confirm the claim in "What exists today" that current runtime hints save close
to nothing. The "before" number for the plate depends on it.

## Features page plate (after step 4)

- **Title:** "Preloading".
- **Text:** "Ask for an app, and every file it needs starts downloading at once. The
  build knows which chunks are lazy, and leaves them alone."
- **Diagram:** two timelines. The top one is the entry → chunk → chunk chain. The
  bottom one has all startup files downloading in parallel. Label both with measured
  times.

## Risks and open questions

- **Shared-module fallback chunks.** If an app's local copy of a shared module is a
  static import in the closure, hinting it downloads a copy that may lose to another
  provider. Check whether share surfaces (`_mf-share-surface_*`) show up in chunk
  `imports`. Exclude them if they do.
- **Apps loaded but not run at startup.** Their startup chunks should get `low`
  priority or no hints. The shell's idle-loaded providers are this case.
- **Entry file size.** The chunk lists ride inside every entry file. Expect tens to
  hundreds of bytes per app.
- **Unversioned artifacts.** A known gap in `TODO.md`. This field is additive, so it
  does not make that gap worse.

## Tickets

1. Plugin: emit `expose-chunks` in the manifest, with tests over a real build.
2. Kernel: hint all dependency entries at once, hint startup chunks from
   `expose-chunks`, and hint on the `loadFynApp(url)` path.
3. Kernel: implement `fetchpriority` from `priorityByDepth`, or delete the option.
4. Plugin: `preloadTags()` helper, and move `shell-preload.mts` onto it.
5. Measure the four variants. Record results in `SHELL_LOAD_PERF.md`. Add the plate.
