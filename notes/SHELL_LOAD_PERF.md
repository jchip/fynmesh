# Shell page load performance — analysis (2026-07-23)

Target: `https://www.lm360.ai/shell` (Cloudflare Pages, gh-pages `docs/`).
Method: Chrome via `agent-browser`, resource timing + HAR; A/B variants served by
stubbing the *document* only (`network route "**/perf-test"`) so all subresources
still come from the real origin. Fresh browser session per run = cold HTTP cache.
n=5, median reported.

## Baseline

| Metric | Value |
| --- | --- |
| TTFB | 35–99 ms |
| Requests | 32 |
| Transferred | 185 KB (624 KB decompressed) |
| Shell UI ready (cold) | **575 ms** |
| Last resource in chain | 741 ms (≈970 ms on the live page incl. sidebar) |

**After FYM-159/160/161/162 — deployed and measured live** (same conditions,
last resource in chain): **983 ms → ~416 ms (−58%)**, n=6 median, transfer
194,076 → 188,503 bytes, rendered DOM unchanged.

Note the A/B harness below reports ~337 ms for the same build. The harness served
the document from a local route stub, so it skipped the HTML round trip; `/shell`
is `cf-cache-status: DYNAMIC` and always costs an origin fetch before parsing can
start. The ~416 ms live figure is the real one — it is measured exactly like the
983 ms baseline. Treat harness numbers as a lower bound when comparing loader
strategies, not as absolute page timings.

Verified on the live site after deploy:

- 22 `modulepreload` tags present
- hashed chunks → `public, max-age=31536000, immutable`
- `fynapp-entry.js`, `index.js`, `federation.json`, `/shell` → still
  revalidating, single clean header value (confirming the rules are disjoint —
  no comma-joined duplicates)
- no service worker controlling the page; `sw.js` still served

Brotli is on, HTTP/2 with h3 advertised, all assets same-origin. **Bytes are not
the problem — round trips are.**

## Root cause: a serial federation discovery waterfall

`templates/pages/shell.html` awaits 7 FynApps one at a time:

```js
await fynMeshKernel.loadFynApp("/fynapp-react-18/dist");
await fynMeshKernel.loadFynApp("/fynapp-react-19/dist");
await fynMeshKernel.loadFynApp("/fynapp-react-middleware/dist");
await fynMeshKernel.loadFynApp("/fynapp-design-tokens/dist");
await fynMeshKernel.loadFynApp("/fynapp-x1-v1/dist");
await fynMeshKernel.loadFynApp("/fynapp-x1-v2/dist");
await fynMeshKernel.loadFynApp("/fynapp-ag-grid-lib/dist");
await fynMeshKernel.loadFynApp("/fynapp-shell-mw/dist");
```

Each app costs 2–3 *sequential* round trips: a ~500-byte `fynapp-entry.js` whose
only job is to declare which chunks to fetch — then another RTT for those chunks.
7 apps × 2–3 RTTs × ~25 ms ≈ 800 ms of pure latency. Nothing overlaps.

Observed chain (ms from navigation start):

```
103–169  CSS ×3 + system.min.js + federation-js + kernel   (parallel — fine)
162–239  react-18 entry -> react-19 entry -> middleware entry
239–401  *** 162 ms dead gap, no network activity ***
401–791  middleware -> design-tokens -> x1-v1 -> react-18 chunks
         -> x1-v2 -> react-dom-19 -> ag-grid-lib -> shell-mw -> shell-layout
897–969  sidebar entry -> main -> component
```

## Measured fix ranking

| Variant | Shell ready | vs baseline |
| --- | --- | --- |
| A — baseline (serial, no preload) | 575 ms | — |
| C — staged `Promise.all`, no preload | 394 ms | −31% |
| **B — serial + `modulepreload` hints** | **181 ms** | **−69%** |
| D — staged + `modulepreload` | 183 ms | −68% |
| E — D minus service worker | 180 ms | −69% |

Two things worth noting:

- **`modulepreload` alone captures the entire win.** Adding loader
  parallelization on top of it changes nothing (183 vs 181 ms = noise), because
  the preload hints already saturate the network in parallel. So the fastest fix
  is also the *lowest risk one*: no change to load ordering or share-scope
  semantics.
- Verified correct: variant B renders a **byte-identical** `#shell-root`
  (18,471 chars, same 9 shell regions) with no console errors, and the preload
  hits are `transferSize: 0` — no double-downloading.

## Recommendations, in priority order

### 1. Emit `<link rel="modulepreload">` for startup chunks — −69%, low risk

**Implemented (FYM-159).** `scripts/shell-preload.mts` + template change.

End-to-end check of the real generated artifact, served as the document against
the live origin, cold cache, n=3 median, metric = last resource in the chain:

| | last resource end | bytes | `#shell-root` |
| --- | --- | --- | --- |
| live `/shell` today | 983 ms | 194,076 | 18,471 |
| generated `shell.html` | **337 ms** | 193,784 | 18,471 |

−66% (−646 ms), no byte increase, identical DOM.

The preload set is **declared explicitly**, not globbed. `fynapp-ag-grid-lib`
ships a ~1 MB `ag-grid.production-*.js` chunk that is only fetched when a grid
FynApp is selected — a naive "preload every hashed chunk in dist" rule would have
added ~1 MB to cold start. Entries marked `"none"` are providers whose payload is
deliberately deferred.


22 URLs cover the 7 preloaded FynApps plus the sidebar. Generate them at build
time in `demo/demo-server/scripts/build-demo-site.mts`, which already copies each
`dist/` (the `packages` array, ~line 255) and renders `pages/shell.html`
(~line 204). Glob `*.js` per dist rather than reading `federation.json` — that
file is incomplete (`fynapp-react-18`'s `esm-react-dom.chunks` is empty even
though `react-dom-esm-18-client.production-*.js` ships).

Note: the kernel *already* has this capability — `tryPreload()` /
`setPreloadCallback()` (`core/kernel/src/browser-kernel.ts:73`) injects
`modulepreload` links. But it only fires via `loadFynAppsByName()` → registry
resolver. `shell.html` calls `loadFynApp(baseUrl)` directly and bypasses it. So
the platform feature exists and is unused on the project's own showcase page.

### 2. Fix cache headers for content-hashed assets — big repeat-visit win

**Implemented (FYM-160).** `scripts/cache-headers.mts` emits `docs/_headers`.

Two constraints from the Pages `_headers` spec shaped the result: multiple
matching rules **all** apply (there is no "most specific wins"), and a header set
twice has its values **joined with a comma** — so overlapping `Cache-Control`
rules would emit `max-age=31536000, immutable, max-age=14400, must-revalidate`.
Only one splat is allowed per pattern and there is no negation, so a broad
`/:pkg/dist/*` rule plus exceptions is not expressible safely.

Instead it emits one rule per content-hash *stem* — `/:pkg/dist/main-*` (one
placeholder + one splat, legal) — which cannot match the two non-hashed JS
filenames the build produces (`fynapp-entry.js`, `index.js`), since neither
contains a `<stem>-` prefix. Verified against the built output: 49/49 hashed
chunks covered, **0** non-hashed files matched, **0** files matching more than
one rule. 23 rules, against a platform limit of 100.


Everything is served `cache-control: public, max-age=14400, must-revalidate`,
including immutable content-hashed chunks like
`react-dom-esm-18-client.production-CXl6Gy65.js`. After 4 hours every returning
visitor revalidates all ~28 assets; a 304 measured at **~58 ms**, and because the
loader is serial those revalidations serialize too — roughly a full cold-load
penalty for zero changed bytes.

There is no `_headers` file in the deployed `docs/`, so this is just Cloudflare
Pages' default. Add one:

- `*-[hash].js` chunks → `max-age=31536000, immutable`
- `fynapp-entry.js`, `federation.json`, `*.manifest.json`, `*.html` → **must stay
  short/revalidated** (they are *not* content-hashed; freezing them breaks deploys)

Within the 4 h window repeat visits are already fine (measured ~80 ms, 0 network).

### 3. Use minified CSS on the shell page — small

**Implemented (FYM-161).**


`templates/pages/shell.html` hardcodes `spectre.css` / `spectre-exp.css` /
`spectre-icons.css`. `templates/layouts/base.html` correctly switches to
`.min.css` under `isProduction`, but `shell.html` does not extend the base layout
and so missed it. Three render-blocking stylesheets, 100 KB raw / 18.5 KB brotli.
The main gain is dropping 2 requests; the byte gain after brotli is modest.

### 4. Remove the dead service worker — cleanup, not a perf win

**Implemented (FYM-162)** — registration removed, but `sw.js` still ships.
Git history confirms a real caching worker was deployed here once (`ce98bf6`)
before being replaced by the unregister stub (`6fa83df`). Clients that still have
that worker active self-heal without a `register()` call: the browser re-fetches
the worker script on navigation within scope, gets the UNREGISTER version, and it
clears caches and unregisters itself. Deleting `sw.js` would strand them
permanently, so it stays.


`public/sw.js` is a self-unregistering no-op (`SW_VERSION = "UNREGISTER"`, empty
`fetch` handler), yet `sw-utils.js` (2.8 KB) is still loaded and registers it on
every visit from both `shell.html` and `landing.html`. Removing it measured as
**no cold-load gain** (variant E 180 ms vs D 183 ms — noise); it just deletes a
request and per-visit install/activate churn.

The 162 ms dead gap at 239–401 ms coincides with SW installation on the live
page, but removing the SW did not reproduce a gain in the harness, so **the cause
of that gap is unconfirmed**. It becomes moot under fix #1 anyway, since the
chunks are already in the preload cache by then.

### 5. Stop eagerly loading both React runtimes — **rejected, by design**

Closed as `wont_do` (FYM-163). Loading React 18 and 19 side by side is a
deliberate demonstration of the framework's multi-version shared-dependency
support — a headline capability, not an oversight. The ~104 KB is accepted in
exchange for showing it, and after fix #1 those chunks download in parallel so
the wall-clock cost is negligible. Recorded here so it does not get "optimized"
again later.

Original analysis retained below.


React 18 + react-dom 18 (44.4 KB br) and React 19 + react-dom 19 (59.3 KB br),
plus `x1-v1` (React 18 lib) and `x1-v2` (React 19 lib), are all loaded at startup
— ~104 KB of the 185 KB total, i.e. **56% of cold-start bytes**. But the shell
middleware and `fynapp-sidebar` both declare `esm-react ^19`; React 18 and
`x1-v1` are only needed once a React-18 FynApp (e.g. `fynapp-2-react18`) is
selected. Deferring them to on-demand would cut cold-start bytes ~28% (≈53 KB).

This changes loading behavior, and the eager preload may well be deliberate —
demoing side-by-side React 18/19 is a headline feature of this project. **Needs
your call before anyone implements it.**
