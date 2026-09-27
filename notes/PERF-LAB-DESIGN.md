# Perf Lab: an analytics suite in the shell that shows bundle optimizations

**Status**: implemented, deployed and measured on the live site 2026-09-26.

## What it is

A small analytics dashboard, built as 4 FynApps plus a shared library, that loads inside `/shell`. A mode switch reloads the shell as `raw`, `combined`, or `combined + hints`. A panel at the top of the dashboard shows what the suite fetched in this page load and how long it took to be ready.

It makes four features visible:

1. **Combine**: the size policy folds many tiny chunks into one file, and an explicit group joins a big chunk with a small one.
2. **Preload hints**: head hints flatten the serial walk the kernel does over the suite's dependency graph.
3. **Lazy and idle loading**: some chunks load only on click, and the report table loads at browser idle after first paint.
4. **Shared deps and caching**: one library is fetched once for three consumers, and hashed chunks are marked immutable.

**Why a new suite.** The shell's own apps can't show this. Each has at most one chunk under 2 KB, so the default combine policy forms nothing outside `fynapp-react-19`. The shell's startup set is also preloaded from static HTML tags, so it has no waterfall left to remove.

## How to use it

- Open `/shell?perf=raw`, `/shell?perf=combined`, or `/shell?perf=hints`. Or pick "Analytics (Perf Lab)" in the shell's app list, which reloads as `?perf=combined`.
- The panel's buttons switch modes. "Reload warm" reloads the same mode to show the cache.
- On localhost a round trip costs about 0 ms, so the modes look alike. Use the live site, DevTools throttling, or the delayed server under [Method](#method).
- Plain `/shell` is unchanged. It fetches no suite files.

## The suite

The domain is an analytics dashboard with real app code. The shared library gets its size from data generated with a seeded PRNG: 40 locale tables, 1,387 daily metric rows, and 20 palettes. The output is byte-identical on every build, so chunk hashes are stable.

| Package | Role | Shows |
|---|---|---|
| `demo/analytics-core` | Plain ESM package, not a FynApp. Formatters, stats, the dataset API, and the data generator. | |
| `fynapp-analytics-lib` | Provides `analytics-core` as a shared module, the way `fynapp-ag-grid-lib` provides AG Grid | one 61 KB file fetched once for 3 consumers |
| `fynapp-analytics` | Host dashboard, rendered into the shell's `main` region through its `./component` expose | the size policy folds 8 tiny chunks into one file |
| `fynapp-analytics-charts` | Chart grid and a small SVG chart engine, imported by the dashboard as an `mf-expose` | explicit `startup` group `[grid, renderer]`; lazy `export` on click |
| `fynapp-analytics-reports` | Pivot report table, imported by the dashboard at browser idle | idle loading; lazy `drilldown` on row click |

The dashboard's `component` statically imports `header`, `toolbar`, `filters`, `date-range`, `kpi-tile` and `perf-panel`, and `kpi-tile` imports `format-badge`. Each one is also a dynamic import target of the container, so Rollup gives each its own chunk. `component` has to run before SystemJS asks for them, which costs a round trip. `empty-state` is imported dynamically, only when a filter leaves no rows. In combined mode it arrives inside the combo file, registered but not run until something needs it.

### Chunk sizes (production build)

`dist-raw` holds the same chunks as `dist`, minus the combined file. The `dist` entry is 150–290 bytes larger because it carries the bundle map.

| App | Chunk | Bytes | Loaded | In combined file |
|---|---|---|---|---|
| dashboard | `fynapp-entry.js` | 2,356 | startup | |
| | `main` | 492 | startup | `combo` |
| | `header` | 598 | startup | `combo` |
| | `toolbar` | 452 | startup | `combo` |
| | `filters` | 1,088 | startup | `combo` |
| | `date-range` | 928 | startup | `combo` |
| | `kpi-tile` | 858 | startup | `combo` |
| | `format-badge` | 725 | startup | `combo` |
| | `empty-state` | 968 | only on an empty filter | `combo` |
| | `component` | 3,239 | startup | |
| | `perf-panel` | 4,505 | startup | |
| | **`combo`** | **6,309** | startup | |
| lib | `fynapp-entry.js` | 667 | startup | |
| | `_mf-share-surface_analytics-core` | 62,080 | startup | |
| charts | `fynapp-entry.js` | 1,334 | startup | |
| | `grid` | 3,163 | startup | `startup` |
| | `renderer` | 13,727 | startup | `startup` |
| | `export` | 2,265 | on click | |
| | **`startup`** | **16,980** | startup | |
| reports | `fynapp-entry.js` | 1,107 | startup | |
| | `table` | 4,897 | idle | |
| | `drilldown` | 2,552 | on row click | |

## How the modes work

**One dist per mode.** `combineDist` rewrites `dist` in place. It keeps the member files, adds the combined file, and appends a `_B(...)` bundle map to the entry. So every suite app's build snapshots its output before combining:

```
rm -rf dist dist-raw && rollup -c && cp -R dist dist-raw && federation-combine dist [--group ...]
```

`dist-raw/fynapp-entry.js` carries no bundle map, so the runtime fetches every member on its own. `fynapp-analytics-lib` combines nothing but still snapshots, so the resolver's rule stays uniform.

**Routing by resolver.** In lab mode the shell installs a registry resolver (`shell.html`). It sends the suite's package names to `dist-raw/` in raw mode and to `dist/` otherwise. It also maps `fynapp-react-lib` to `fynapp-react-19`. `shell-layout.ts` loads the dashboard with `loadFynAppsByName`, so the whole graph follows the mode through that one resolver. Then it places the dashboard into `main`.

**Hints.** In `hints` mode, an inline script at the top of the head injects `<link rel="preload" as="script">` for the suite's 9 startup files. After federation-js loads, the page declares the suite's bundle maps. `shell-preload.mts` (`ANALYTICS_STARTUP_FYNAPPS`, `collectPerfLab`) bakes both lists at build time. The hints name carriers, never members.

The hints must be injected by script. Cloudflare Pages turns static `<link rel="preload">` tags into a `Link:` response header and sends them as Early Hints. Static tags for the suite would warm it in all three modes and erase the comparison. See [Findings](#findings).

**Panel.** `perf-panel` reads Resource Timing entries under `/fynapp-analytics*/dist*/` and the `perf-lab:ready` mark. The dashboard sets the mark once its KPI tiles and chart grid have mounted and painted. The head script raises the Resource Timing buffer to 1000 entries, so the shell's own requests can't push suite entries out. The panel never times anything itself, so it can't measure one mode differently from another.

## Results

### Live site

`https://www.fynmesh.fyi/shell?perf=<mode>` over HTTP/2 through Cloudflare, measured 2026-09-26 from one client on the US west coast. Headless Chromium via `agent-browser`, with a fresh browser session for every run, so every run is cold.

#### Main set: 6 rounds

Each round runs raw, combined and hints in turn, so drift hits every mode alike. All times are from navigation start. "Suite time" is ready minus HTML done. It takes out the HTML's own network time, which varied between runs.

| Round | Mode | HTML done | First suite fetch | Ready at | Suite time |
|---|---|---|---|---|---|
| 1 | raw | 245 | 327 | 898 | 653 |
| 1 | combined | 247 | 420 | 1434 | 1187 |
| 1 | hints | 310 | 365 | 454 | 144 |
| 2 | raw | 208 | 315 | 814 | 606 |
| 2 | combined | 244 | 320 | 787 | 543 |
| 2 | hints | 243 | 283 | 362 | 119 |
| 3 | raw | 362 | 444 | 1448 | 1086 |
| 3 | combined | 223 | 302 | 780 | 557 |
| 3 | hints | 189 | 247 | 315 | 126 |
| 4 | raw | 734 | 1245 | 2880 | 2146 |
| 4 | combined | 262 | 456 | 1114 | 852 |
| 4 | hints | 247 | 296 | 371 | 124 |
| 5 | raw | 249 | 418 | 1428 | 1179 |
| 5 | combined | 328 | 411 | 956 | 628 |
| 5 | hints | 271 | 344 | 1393 | 1122 |
| 6 | raw | 451 | 578 | 1236 | 785 |
| 6 | combined | 235 | 319 | 770 | 535 |
| 6 | hints | 197 | 243 | 334 | 137 |

Medians, in ms:

| Mode | Requests | Transfer | HTML done | Ready at | vs raw | Suite time | vs raw |
|---|---|---|---|---|---|---|---|
| raw | 16 | 43 KB | 306 | 1332 | | 936 | |
| combined | 9 | 39 KB | 246 | 872 | −35% | 593 | −37% |
| combined + hints | 9 | 39 KB | 245 | 367 | −72% | 132 | −86% |

- Transfer is compressed bytes. Combining also compresses better, 39 KB vs 43 KB.
- Single runs vary a lot. Round 4 raw was slow from the HTML on. Round 5 hints was slow after the suite started. Medians over 6 rounds absorb both, and the two ways of measuring agree.

#### The serial entry walk, live

When each suite entry file started and finished, in ms from navigation start. There were 3 more cold runs per mode.

| Mode | Run | dashboard | charts | lib | reports | Chain |
|---|---|---|---|---|---|---|
| combined | 1 | 439–496 | 497–563 | 564–623 | 624–683 | 244 |
| combined | 2 | 405–453 | 454–501 | 502–638 | 640–701 | 296 |
| combined | 3 | 329–370 | 370–501 | 502–550 | 551–603 | 274 |
| hints | 1 | 375–409 | 375–415 | 375–415 | 375–415 | 40 |
| hints | 2 | 1316–1864 | 1317–1841 | 1317–1862 | 1317–1864 | 548 |
| hints | 3 | 655–697 | 655–696 | 655–696 | 655–727 | 72 |

Without hints, each entry starts the moment the previous one finishes. With hints, all 4 start within 1 ms. Hints run 2 was a slow network across the board, and even there the 4 entries overlapped.

#### First set and warm reloads

An earlier set of 3 cold runs per mode, before the main set. The first run of each mode was slow while connections and edge caches warmed.

| Mode | Run 1 | Run 2 | Run 3 | Warm reload |
|---|---|---|---|---|
| raw | 1958 | 1200 | 1110 | 166 |
| combined | 1478 | 782 | 741 | 175 |
| hints | 491 | 1353 | 654 | 157 |

- **Warm reload** was ready in ~160 ms in every mode, with all 16 or 9 startup files from cache (`transferSize` 0). Hashed chunks, including `dist-raw`, are served `public, max-age=31536000, immutable`. At measurement time, entries had Pages' default `max-age=14400, must-revalidate`, so they came from cache too. Entries now revalidate on every load (finding 5), so a warm reload adds a few 304s.
- The suite never appears in the `/shell` Early Hints `Link:` header, so the script-injected hints stay mode-specific.

#### What the live data says

The gap is wider live than locally. Combine alone saves 35–37%, because every saved request costs a real round trip. Hints save most of the rest, because the serial entry walk is the longest chain, about 275 ms for 4 entries. With hints, the suite is ready about 130 ms after the HTML arrives.

### Local, with a fixed delay

Production site build (`fyn build-demo`) served by `serve-site-delayed.mts` with 80 ms per response. Headless Chromium via `agent-browser`, cold for every run. Suite requests only; the shell's own requests are excluded.

| Mode | Run | Startup requests | Bytes | First suite fetch | Ready at | Fetched after ready |
|---|---|---|---|---|---|---|
| raw | 1 | 16 | 99 KB | 464 ms | 1337 ms | 1 |
| raw | 2 | 16 | 99 KB | 433 ms | 1304 ms | 1 |
| raw | 3 | 16 | 99 KB | 435 ms | 1293 ms | 1 |
| combined | 1 | 9 | 99 KB | 431 ms | 1131 ms | 1 |
| combined | 2 | 9 | 99 KB | 430 ms | 1121 ms | 1 |
| combined | 3 | 9 | 99 KB | 435 ms | 1124 ms | 1 |
| hints | 1 | 9 | 99 KB | 168 ms | 597 ms | 1 |
| hints | 2 | 9 | 99 KB | 168 ms | 605 ms | 1 |
| hints | 3 | 9 | 99 KB | 168 ms | 603 ms | 1 |

The one file after ready is the report table, loaded at idle. A click on Export fetched only `export-*.js`. Plain `/shell` fetched no suite files.

Summary of the local runs:

| Mode | Startup requests | Ready at (mean) | vs raw |
|---|---|---|---|
| raw | 16 | 1311 ms | |
| combined | 9 | 1125 ms | −7 requests, −186 ms |
| combined + hints | 9 | 602 ms | −7 requests, −709 ms (−54%) |

- **Combine** removes 7 requests and about 190 ms. The bytes don't change.
- **Hints** do most of the work. The first suite fetch moves from ~430 ms to 168 ms, and time to ready roughly halves compared with combined alone.

## Findings

1. **The kernel walks a by-name graph one entry at a time.** Each manifest is read out of its entry file (`manifest-resolver.ts`, tier 1: `__FYNAPP_MANIFEST__`). So the kernel can't know an app's dependencies until that app's entry has loaded. The kernel's own runtime hint for a dependency goes out just before it's imported, so it saves nothing. On the live site in combined mode, the 4 entries load back to back, each starting as the previous one finishes, for a chain of 244–296 ms. Page-level hints for every entry start all 4 within 1 ms and cut the chain to 40–72 ms. This is the measured case for "hint every dependency's entry at once" in [`PRELOAD-AUTO-DESIGN.md`](./PRELOAD-AUTO-DESIGN.md).
2. **`fynapp.manifest.json` is not on the load path.** Because of finding 1, the kernel never fetches it when the entry embeds the manifest. A hint for it would only download a file nothing reads.
3. **Cloudflare Pages sends static preload tags as Early Hints.** It copies them into a `Link:` response header, so Chrome starts those fetches from the header. DevTools lists these requests with initiator "Other" and no initiator data. The 5 `fetchpriority="low"` tags on `/shell` are left out of the header. Any preload a page wants only sometimes has to be injected by script.
4. **Combine and hints stack.** Combine cuts request count, and hints cut the serial depth. Hints on the raw build would still pay for 16 requests. Combine without hints still pays for the serial walk.
5. **Unhashed files served stale deploys for 4 hours.** Pages serves assets with `max-age=14400, must-revalidate`, and `must-revalidate` only applies once the 4 hours are up. After the lab deployed, a browser that had loaded `/shell` earlier kept the old `fynapp-shell-mw` entry. That entry named the old shell layout, still in its cache, so `?perf=` did nothing. Fresh sessions worked, which hid it from the measurements. `cache-headers.mts` now gives every unhashed `.js` and `.json` file `max-age=0, must-revalidate`. That covers entries, federation metadata and the loader runtime. See [`SHELL_LOAD_PERF.md`](./SHELL_LOAD_PERF.md).

## Method

To reproduce:

1. `fyn build-demo` builds the production site into `.temp/docs`.
2. From `demo/demo-server`, run `node scripts/serve-site-delayed.mts 4600 80`. It serves `.temp/docs` with 80 ms per response and `no-store`.
3. Open `http://localhost:4600/shell?perf=<mode>` and read the panel. Or run this in the console once the page is ready:

   ```js
   const rd = performance.getEntriesByName("perf-lab:ready")[0].startTime;
   const s = performance.getEntriesByType("resource").filter((e) => /\/fynapp-analytics[^/]*\/dist/.test(e.name));
   const st = s.filter((e) => e.startTime <= rd);
   ({ ready: Math.round(rd), startup: st.length, after: s.length - st.length,
      first: Math.round(Math.min(...st.map((e) => e.startTime))),
      kb: Math.round(st.reduce((n, e) => n + e.transferSize, 0) / 1024) });
   ```

The server is HTTP/1.1, so the browser opens at most 6 connections to it. For live numbers, open the live url in a fresh browser session per run and read the same values.

## Code map

| File | Role |
|---|---|
| `demo/analytics-core/`, `demo/fynapp-analytics*/` | The suite |
| `demo/fynapp-analytics/src/perf-panel.tsx` | The metrics panel |
| `demo/demo-server/templates/pages/shell.html` | Mode detection, hint injection, bundle maps, resolver |
| `demo/fynapp-shell-mw/src/middleware/shell-layout.ts` | App-list entry, `loadPerfLab`, `dist-raw` url match |
| `demo/demo-server/scripts/shell-preload.mts` | `ANALYTICS_STARTUP_FYNAPPS`, `collectPerfLab` |
| `demo/demo-server/scripts/build-demo-site.mts` | Copies `dist-raw`; warns when a declared extra dist is missing |
| `demo/demo-server/scripts/cache-headers.mts` | Immutable rules for `/:pkg/dist-raw/<stem>-*` |
| `demo/demo-server/src/dev-proxy.ts` | Dev routes for the suite |
| `scripts/xrun-tasks.ts` | `combine-demo` skips apps that combined themselves |
| `demo/demo-server/scripts/serve-site-delayed.mts` | The measurement server |

## Not yet verified

- Dev mode (`fyn start`). Only the production site build was tested.

## Open questions

- Chunks are smaller than first targeted: `renderer` is 13.7 KB (target 35–45), `table` 4.9 KB, and `drilldown` 2.6 KB. Every feature still shows. They can grow with more real features if bigger files are wanted.
- The features page could link to the lab.
