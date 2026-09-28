# FynOps — Large Demo App Design

Status: proposed. Nothing here is built yet.

## Goal

Build a realistic app whose total JS is 10MB or more. It should be split across many FynApps and run by one shell. The point is to show FynMesh works at real-app scale:

- Total size is large, but first load stays small.
- Heavy libraries are shared once, not bundled per feature.
- Two versions of a library run side by side in the same page.
- Any one feature can be rebuilt and redeployed alone.

The domain is a **logistics operations console**. One domain beats a loose feature collection because the features can react to each other. Selecting a shipment in the grid pans the map, opens its documents, and highlights its dock slot. That cross-app traffic is what makes the demo look like a real product.

## Constraints

- **Static site.** The demo deploys to GitHub Pages, so there is no server. The "backend" is SQLite running in the browser, seeded by a simulator.
- **Seeded data.** Same seed, same dataset. That keeps Perf Lab runs comparable, like `analytics-core` does today.
- **Real libraries only.** Size comes from libraries a real ops team would use. No padding.

## Architecture

```
fynops.html (host page: boots kernel, sets registry resolver)
  └─ fynops-shell        routing, layout, auth/session middleware, route table
       ├─ providers (loaded first, shared)
       │    fynops-react-lib    esm-react 19 (reuse fynapp-react-19)
       │    fynops-ui           UI kit + design tokens
       │    fynops-data         data client, zod schemas, SQLite worker, seeded simulator
       │    fynapp-ag-grid-lib  esm-ag-grid (reuse existing)
       │    fynops-grid-lib     esm-ag-grid-enterprise (on top of esm-ag-grid)
       │    fynops-charts-lib   esm-echarts
       └─ features (lazy, one per route)
            ops-shipments  ops-map  ops-analytics  ops-docs  ops-rules
            ops-schedule   ops-notes  ops-warehouse  ops-flows
```

### Feature FynApps

| FynApp | Route | Scenario | Heavy lib (approx. minified) | Framework |
|---|---|---|---|---|
| `ops-shipments` | `/shipments` | 10k-row grid with grouping, pivot and Excel export | ag-grid enterprise (shared, 1.2MB), including its Excel export | React 19 |
| `ops-map` | `/map` | Live fleet positions, routes, geofences | maplibre-gl, 1.6MB (0.43MB gz) with worker | React 19 |
| `ops-analytics` | `/analytics` | On-time rate, lane cost, trends | echarts (shared) | React 19 |
| `ops-docs` | `/docs` | Bills of lading and invoices in a PDF viewer | pdfjs-dist + pdf-lib, 2.1MB (0.68MB gz) with worker | React 19 |
| `ops-rules` | `/rules` | Pricing and routing rules in a small DSL | monaco-editor, 4.7MB (1.2MB gz) with worker | React 19 |
| `ops-schedule` | `/schedule` | Dock and driver scheduling | fullcalendar ~250KB | **React 18** (the "legacy team") |
| `ops-notes` | `/incidents` | Incident reports with rich text | tiptap/prosemirror ~400KB | React 19 |
| `ops-warehouse` | `/warehouse` | 3D slot view of a warehouse | three.js ~650KB | **Svelte** |
| `ops-flows` | `/flows` | Shipment lifecycle and exception flow diagrams | mermaid ~2MB | **Vue** |

Sizes with a gz figure were measured in Phase 0 (see Phase 0 results). The rest are still estimates.

`ops-shipments` uses ag-grid enterprise without a license key. It runs with a watermark and console warnings. If AG Grid objects, we drop back to community, which loses grouping, pivot and built-in Excel export.

### Shared module providers

| Provider | Shares | Why it is its own FynApp |
|---|---|---|
| `fynapp-react-19` / `fynapp-react-18` | `esm-react`, `esm-react-dom` | Reuse as-is. Both load, so `ops-schedule` gets 18. |
| `fynops-ui` | `fynops-ui` (buttons, panels, tables, tokens) | One look across every feature team |
| `fynops-data` | `fynops-data-core` (client, schemas, SQLite worker, simulator) | One source of data. Features never fake their own. The shared module lives in its own package, `fynops-data-core`, like `analytics-core`, because the FynApp already owns the name `fynops-data`. |
| `fynapp-ag-grid-lib` | `esm-ag-grid`, `esm-ag-grid-react` | Reuse as-is |
| `fynops-grid-lib` | `esm-ag-grid-enterprise` | Layers enterprise on top of the shared community grid. It consumes `esm-ag-grid` with `import: false`, so only one community copy exists. |
| `fynops-charts-lib` | `esm-echarts` | Used by `ops-analytics` and the sparkline column in `ops-shipments`. It shows a ~1MB lib loading once for two consumers. |

`fynops-charts-lib` follows the `fynapp-ag-grid-lib` pattern. It declares `shared: { "esm-echarts": { singleton: true, semver } }`, and consumers set `import: false`.

### Shell

`fynops-shell` is a new FynApp. It does not extend `fynapp-shell-mw`. That shell's `shell-layout.ts` is about 1800 lines built around the existing demo and its two regions. FynOps needs routes, and a second shell also shows that the shell is just another FynApp.

The shell does four things:

1. **Route table.** It maps a route to a FynApp name, e.g. `{ path: "/map", app: "ops-map", title: "Fleet map" }`. It loads the app with `kernel.loadFynAppsByName` on first visit and keeps it mounted after that.
2. **Layout.** It renders a top bar, nav, main region and a detail drawer. The drawer lets a second FynApp mount next to the current route. For example, `ops-docs` opens in the drawer while `/shipments` is showing.
3. **Session middleware.** A fake login gives a user and a role (`dispatcher`, `manager`). Features read it through middleware context and hide what the role can't use. This exercises middleware across many apps.
4. **Preload.** It warms the current route's FynApp, plus the most likely next route. It uses the existing preload hint machinery.

Phase 1 keeps the route table inside the shell. Phase 3 moves it into a `fynops.routes.json` file. Then a new feature can ship without a shell rebuild, which is the independent-deploy story.

### Host page

FynOps gets its own page at `/fynops.html`. It does not reuse `/shell.html`, for three reasons:

- `shell.html` boots a fixed provider list for the existing demo, including the Perf Lab suite. FynOps needs a different one.
- FynOps owns routing. `/shell` already has its own app picker and `?perf=` state, and the two would fight.
- Perf Lab numbers on `/shell` stay comparable with past runs.

Routes use the hash (`/fynops.html#/map`). GitHub Pages has no server rewrites, so a path like `/fynops/map` would 404 on reload.

The kernel boot snippet that `shell.html` and `fynops.html` both need should move into a shared template partial, so it is not copied.

`demo/demo-server/templates/pages/fynops.html` is modeled on `shell.html`. It boots SystemJS, federation-js and the kernel. Then it installs a registry resolver that maps `fynapp-react-lib` by semver: `^18` goes to `fynapp-react-18`, `^19` goes to `fynapp-react-19`. Finally it loads the providers and `fynops-shell`.

### FynBus topics

| Topic | Kind | Producer | Consumers |
|---|---|---|---|
| `ops:vehicle.positions` | emit, 1Hz | fynops-data simulator | map, analytics |
| `ops:shipment.get` | request | any | fynops-data handles it |
| `ops:rules.changed` | emit | rules | shipments (repricing), analytics |

Selection and navigation are not bus topics. The bus has no replay, so a feature that mounts late would miss them. The shell owns both. It exposes `selection` as shared state, plus `navigate` and `openDrawer`, through its middleware API. See [`FYNOPS-PHASE1-PLAN.md`](./FYNOPS-PHASE1-PLAN.md).

### Database

`fynops-data` owns an in-browser SQLite database. It acts as the app's backend.

- **Engine:** `@sqlite.org/sqlite-wasm`, the official build. It is about 1MB of wasm plus JS.
- **Storage:** OPFS with the `opfs-sahpool` VFS. Data survives reloads and can grow to hundreds of MB. This VFS needs no COOP/COEP headers, which GitHub Pages can't set. The plain `opfs` VFS needs them, so it is out.
- **Worker:** SQLite runs in a dedicated Web Worker that `fynops-data` starts. No SQL runs on the main thread.
- **Client API:** features call an async client from the shared `fynops-data` module. It has typed methods like `shipments.page(query)` and `rules.save(rule)`. A raw `query(sql, params)` exists for analytics.
- **Latency knob:** the client can add 50 to 300ms of fake delay, so loading states behave like a real network.
- **Fallback:** if OPFS is unavailable, as in some private browsing modes, the worker opens an in-memory database. The app still works but loses persistence.

Features that write: `ops-rules` saves rules, `ops-schedule` saves bookings, and `ops-notes` saves incident reports. All of it survives a reload.

The shipments grid uses ag-grid enterprise's server-side row model. Grouping, sorting and filtering become SQL queries in the worker. This is how the grid is used against a real backend.

**One tab at a time.** `opfs-sahpool` allows a single connection. The worker takes a Web Lock on startup. A second tab waits and shows "open in another tab". A SharedWorker could let tabs share one connection later, but it is out of scope for now.

**Schema and seed versions.** A `meta` table stores the schema version and the seed version. If either differs from the code, the worker drops the database and seeds again. The shell has a "reset data" button that does the same.

### Seed data

The generator is a pure TS module in `fynops-data` with a seeded PRNG. A Node script and the browser worker both import it, so the same seed gives the same data everywhere.

**Prime script.** `apps/fynops/fynops-data/scripts/prime-db.mts` runs the generator into a real SQLite file with Node's built-in `node:sqlite`. It writes `fynops-seed.<hash>.sqlite.gz`. The file is pre-compressed because GitHub Pages won't gzip a binary. The content hash in the name keeps a stale copy from being served out of the CDN or browser cache. Flags:

- `--seed <n>`
- `--scale small|medium|large`, about 10k, 100k and 1M shipments
- `--scenario storm-midwest|port-congestion|carrier-outage`. Each one layers events on the base data, such as late shipments, reroutes and incident reports, so a demo tells a story.

**Default: no seed file.** The default 10k dataset seeds in the browser in about 100ms, which beats downloading a file. Seed files are only for the large scale and the scenario presets.

**Only at publish.** A seed file is never committed and is not part of `fyn bootstrap`. `build-demo-site.mts` runs the prime script and writes the file into the site output (`.temp/docs`). From there it ships to the `gh-pages` branch with the rest of the site. A small `fynops-seed.json` next to it names the hashed file and lists the scenarios.

**Worker startup.** The worker reads `fynops-seed.json`, fetches the seed file, and decompresses it with `DecompressionStream`. Then it imports the file into OPFS with the `opfs-sahpool` `importDb`. If there is no seed file, which is the default and also local `fyn start`, the worker generates the data in the browser instead. "Reset data" re-imports the file, or regenerates it when there is no file.

### Data simulator

The base dataset is 10k shipments, 500 vehicles, 40 warehouses, lanes, carriers and documents. It is generated in the browser. The `medium` (100k) and `large` (1M) scales stay available for stress tests. In-browser seeding runs in the worker in batched transactions. Once the data is loaded, a timer moves vehicles, writes their positions, and emits them on the bus. PDFs for `ops-docs` are generated on the fly by a small generator, so no binary files ship.

The simulator uses a seeded PRNG plus a tiny name and place list. `@faker-js/faker` stays optional. Pulling in only its `en` locale is fine if the data needs more variety.

## Repo layout

FynOps is a real app, not a demo snippet, so it lives at the top level in `apps/fynops/`:

```
apps/fynops/fynops-shell
apps/fynops/fynops-ui
apps/fynops/fynops-data
apps/fynops/fynops-charts-lib
apps/fynops/ops-shipments
...
```

`fynpo.json` uses `autoSearch`, which should find packages under `apps/`. Phase 0 confirms that `fyn bootstrap` builds them. Scaffold each one with `create-fynapp --name <app> --framework <react|svelte|vue> --dir apps/fynops/<app>`.

Each app has to be registered by hand in three places:

- `demo/demo-server/src/dev-proxy.ts` gets a path mapping, e.g. `/ops-map` pointing to `../../../apps/fynops/ops-map`. URLs stay flat as `/<name>/dist`, like every other FynApp. The site build's chunk guard and the `/:pkg/dist/*` cache rules only look one level deep.
- `demo/demo-server/scripts/build-demo-site.mts` gets a `packages` entry.
- The `fynops-shell` route table gets an entry (phase 3: `fynops.routes.json`).

## Risks to spike first

These are the parts most likely to break under SystemJS federation. Phase 0 tests them before any real feature work.

| Risk | Why | Spike |
|---|---|---|
| Web workers from a FynApp | monaco, pdf.js and maplibre spawn workers from URLs. Those must resolve relative to the FynApp's dist, not the page. | Build one FynApp per lib. Load it in the shell and confirm the worker starts. |
| Library CSS | maplibre, ag-grid, fullcalendar and tiptap ship CSS. It has to load with the FynApp and not leak. | Same spikes, check styles |
| Monaco size and loading | Its ESM build is large and uses dynamic imports for languages | Measure the chunk count and first-load cost with only one custom language |
| Basemap tiles | The static site has no tile server | Use a public third-party tile source, such as OpenFreeMap or the MapLibre demo tiles |
| ag-grid enterprise on shared community | `ag-grid-enterprise` imports `ag-grid-community` directly. Those imports must resolve to the shared `esm-ag-grid`, or a second community copy loads and module registration breaks. | Build `fynops-grid-lib`. Confirm grouping works and that only one community copy is in the Network panel. |
| SQLite wasm and worker from a FynApp | The wasm file and the worker script must load from `fynops-data`'s dist. OPFS must work under the demo origin. | Build `fynops-data` with the worker. Seed 100k rows, reload, and confirm the data is still there. Record the in-browser seed time. Then run `prime-db.mts`, import its file, and record the download size and import time. |
| Svelte and Vue next to React | Each needs its own framework runtime | Reuse the `fynapp-8-svelte` and `fynapp-4-vue` setups |

If workers can't load cleanly from a FynApp, that is a kernel or federation gap worth fixing. It is not a reason to drop the feature.

## Phased plan

### Phase 0: spikes

1. Build throwaway FynApps for monaco, pdf.js and maplibre. Each loads its worker and CSS.
2. Build the SQLite worker in `fynops-data`. Seed it and query it from a throwaway FynApp.
3. Record the real minified and gzip size of each lib.

Done when:

- All three libs render in `fynops.html` and each worker runs.
- 100k seeded rows are still there after a reload.
- The measured sizes, the in-browser seed time, and the seed file's size and import time are in this doc.

### Phase 0 results

Done 2026-09-27. All five spikes work in `fynops.html`. None needed a kernel, federation or create-fynapp change. The spikes are loaded with `fynops.html?load=<a>,<b>`, which loads each `/<name>/dist` after the shell.

**Sizes.** Production builds, gzip measured with Python (`gzip -c | wc -c` over-reports in this shell).

| Spike | Raw | Gzip | Biggest pieces |
|---|---|---|---|
| `spike-monaco` | 4.70MB | 1.22MB | main 4.43MB (includes a 165KB inlined font), editor worker 274KB |
| `spike-pdf` | 2.14MB | 0.68MB | worker 1.27MB, main 871KB (pdf.js 459KB, pdf-lib ~412KB) |
| `spike-maplibre` | 1.62MB | 0.43MB | main 1.10MB, worker 513KB |
| `fynops-grid-lib` | 1.22MB | 0.32MB | enterprise only. The shared community grid adds 1.25MB / 0.34MB. |
| `fynops-data` | 1.10MB | 0.47MB | sqlite3.wasm 869KB, worker 226KB |
| **Total** | **10.8MB** | **3.1MB** | These five libs alone already pass the 10MB goal. |

**Timings.**

- SQLite: seeding 100k shipments in the browser takes about 940ms. A reload opens the existing OPFS data in 8ms. Importing a seed file takes about 70ms. A second tab gets "open in another tab".
- Seed files: small is 1.7MB raw / 0.5MB gz, medium 17.1 / 4.5MB, large 171.6 / 43.1MB. Large takes 20s to build. The hash is stable across runs.
- pdf.js: a cold first page takes about 1.3s, mostly worker startup.
- maplibre: moving 2k points costs 0.3 to 0.7ms per tick and holds 60fps.

**How workers and assets load.** This is the pattern every feature follows:

- A worker is its own rollup build, or a copied file. It lands at the top level of `dist/`.
- The app finds it with `import.meta.ROLLUP_FILE_URL_*` or `new URL(file, import.meta.url)`. SystemJS resolves both against the FynApp's dist, not the page.
- Emitted assets need an explicit `fileName` or a flat `assetFileNames`. The factory default puts them in `dist/assets/`, which the site cache rules don't cover.
- CSS goes through postcss with `inject: true`. A font that CSS references must be inlined or emitted. Otherwise it resolves against the page and 404s.

**Plan changes.**

- The shared data module is `fynops-data-core`, in its own package.
- The enterprise grid needs a new ESM wrapper, `misc/esm-ag-grid-enterprise`. Its `ag-grid-community` imports point at the shared `esm-ag-grid`, the same way `esm-ag-grid-react` does.
- monaco's main chunk is 1.1MB gz, so `ops-rules` must stay off the first-load path.
- `ops-docs` should start the pdf.js worker lazily. PDF generation (pdf-lib) moves into the simulator, since documents are data.

**Open items.**

1. **Seed default (decided).** The default is now 10k shipments, seeded in the browser in about 100ms. Seed files are only for large scale and scenarios. At 100k, the 4.5MB seed file was slower than in-browser seeding on links below about 40Mbps.
2. **Cache rules.** The pdf worker is `.mjs`, which the hashed-file rule doesn't match. The fynops-data worker and wasm have unhashed names. Both only revalidate on every load, so this costs cache efficiency but never serves stale files. Fix when FynOps is wired into `build-demo-site.mts`.
3. **Site build.** `build-demo-site.mts` still needs the `prime-db` step and entries for `fynops-data` and `fynops-grid-lib`.
4. **Load order.** The spikes set load order by hand. Phase 1 must confirm that `loadFynAppsByName` pulls in `fynops-grid-lib` and the other providers on its own.
5. **Untested.** The in-memory fallback, because Chromium always has OPFS.
6. **create-fynapp candidates.** Default to flat asset names. The vanilla template's `main.ts` imports `styles.css`, so deleting that file breaks the build.

### Phase 1: shell and first three features

1. `fynops-shell` with the route table, layout, drawer and session middleware
2. `fynops-ui`, `fynops-data`, `fynops-charts-lib`, `fynops-grid-lib`
3. `ops-shipments`, `ops-map`, `ops-analytics`
4. The `fynops.html` host page, plus dev-proxy and build-site entries

Done when:

- Selecting a shipment in the grid pans the map to its vehicle.
- Vehicles move on the map in real time.
- The Network panel shows echarts downloaded once, while both `ops-analytics` and `ops-shipments` use it.
- First load of `/shipments` downloads only the shell, the providers and `ops-shipments`.

### Phase 2: heavy features and multi-version

1. `ops-docs` (pdf.js in the drawer)
2. `ops-rules` (monaco)
3. `ops-schedule` on React 18

Done when:

- `ops-schedule` runs on React 18 while the rest of the page runs React 19. `React.version` shows both at runtime.
- A rule edit in `ops-rules` reprices rows in `ops-shipments` through `ops:rules.changed`.
- Total dist size passes 5MB.

### Phase 3: breadth and independent deploy

1. `ops-notes`, `ops-warehouse` (Svelte), `ops-flows` (Vue)
2. Move the route table into `fynops.routes.json`
3. Lazy locale bundles in `fynops-ui` (`en`, `es`)

Done when:

- Total dist size passes 10MB.
- Rebuilding just `ops-flows` and redeploying its dist changes the live page, with no other app rebuilt.
- Adding a route to `fynops.routes.json` shows a new nav item with no shell rebuild.

### Phase 4: measure and publish

1. Add a size and load report. For each route it lists total bytes available, bytes downloaded on first visit, and bytes reused from cache on the next route.
2. Hook FynOps into Perf Lab telemetry so raw, combined and hints modes can be compared at this scale.
3. Add `fynops.html` to the published demo site and link it from the landing page. Done 2026-09-27: it is linked from the landing page, features nav and 404 page, and listed in the sitemap.

Done when the report runs from the live site and its numbers are recorded in this doc.

## Decisions

- **Folder:** top-level `apps/fynops/`
- **ag-grid:** enterprise, unlicensed with the watermark. Remove it if AG Grid objects.
- **Map tiles:** a third-party tile source is fine on the public demo
- **Database:** SQLite wasm on OPFS (`opfs-sahpool`) in a worker, owned by `fynops-data`
- **Dataset:** 10k shipments by default, generated in the browser. Seed files are built only at publish, only for large scale and scenarios, and never committed.
- **Non-React features:** `ops-warehouse` in Svelte and `ops-flows` in Vue
