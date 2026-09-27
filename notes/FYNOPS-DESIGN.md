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

- **Static site.** The demo deploys to GitHub Pages, so there is no backend. All data comes from an in-browser simulator.
- **Seeded data.** Same seed, same dataset. That keeps Perf Lab runs comparable, like `analytics-core` does today.
- **Real libraries only.** Size comes from libraries a real ops team would use. No padding.

## Architecture

```
fynops.html (host page: boots kernel, sets registry resolver)
  └─ fynops-shell        routing, layout, auth/session middleware, route table
       ├─ providers (loaded first, shared)
       │    fynops-react-lib    esm-react 19 (reuse fynapp-react-19)
       │    fynops-ui           UI kit + design tokens
       │    fynops-data         data client, zod schemas, seeded simulator
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
| `ops-shipments` | `/shipments` | 100k-row grid with grouping, pivot and Excel export | ag-grid enterprise (shared), SheetJS ~900KB | React 19 |
| `ops-map` | `/map` | Live fleet positions, routes, geofences | maplibre-gl ~800KB | React 19 |
| `ops-analytics` | `/analytics` | On-time rate, lane cost, trends | echarts (shared) | React 19 |
| `ops-docs` | `/docs` | Bills of lading and invoices in a PDF viewer | pdfjs-dist ~1MB + worker | React 19 |
| `ops-rules` | `/rules` | Pricing and routing rules in a small DSL | monaco-editor ~3MB + workers | React 19 |
| `ops-schedule` | `/schedule` | Dock and driver scheduling | fullcalendar ~250KB | **React 18** (the "legacy team") |
| `ops-notes` | `/incidents` | Incident reports with rich text | tiptap/prosemirror ~400KB | React 19 |
| `ops-warehouse` | `/warehouse` | 3D slot view of a warehouse | three.js ~650KB | **Svelte** |
| `ops-flows` | `/flows` | Shipment lifecycle and exception flow diagrams | mermaid ~2MB | **Vue** |

The sizes are estimates. Phase 0 measures the real numbers.

`ops-shipments` uses ag-grid enterprise without a license key. It runs with a watermark and console warnings. If AG Grid objects, we drop back to community, which loses grouping, pivot and built-in Excel export.

### Shared module providers

| Provider | Shares | Why it is its own FynApp |
|---|---|---|
| `fynapp-react-19` / `fynapp-react-18` | `esm-react`, `esm-react-dom` | Reuse as-is. Both load, so `ops-schedule` gets 18. |
| `fynops-ui` | `fynops-ui` (buttons, panels, tables, tokens) | One look across every feature team |
| `fynops-data` | `fynops-data` (client, schemas, simulator) | One source of data. Features never fake their own. |
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
| `ops:shipment.selected` | emit | shipments, map, schedule | map, docs, warehouse, notes |
| `ops:vehicle.positions` | emit, 1Hz | fynops-data simulator | map, analytics |
| `ops:shipment.get` | request | any | fynops-data handles it |
| `ops:rules.changed` | emit | rules | shipments (repricing), analytics |
| `ops:route.open` | emit | any | shell (navigates or opens drawer) |

The bus has no replay, so a feature that mounts late calls `ops:shipment.get` for the current selection. The shell keeps "current selection" in middleware shared state and answers it.

### Data simulator

`fynops-data` builds a seeded dataset: about 100k shipments, 2k vehicles, 40 warehouses, lanes, carriers and documents. A timer moves vehicles and emits positions on the bus. PDFs for `ops-docs` are generated on the fly by a small generator, so no binary files ship.

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

- `demo/demo-server/src/dev-proxy.ts` gets a path mapping, e.g. `/fynops/ops-map` pointing to `../../../apps/fynops/ops-map`.
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
| Svelte and Vue next to React | Each needs its own framework runtime | Reuse the `fynapp-8-svelte` and `fynapp-4-vue` setups |

If workers can't load cleanly from a FynApp, that is a kernel or federation gap worth fixing. It is not a reason to drop the feature.

## Phased plan

### Phase 0: spikes

1. Build throwaway FynApps for monaco, pdf.js and maplibre. Each loads its worker and CSS.
2. Record the real minified and gzip size of each lib.

Done when all three render in `fynops.html` and each worker runs. The measured sizes go into this doc.

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
3. Add `fynops.html` to the published demo site and link it from the landing page.

Done when the report runs from the live site and its numbers are recorded in this doc.

## Decisions

- **Folder:** top-level `apps/fynops/`
- **ag-grid:** enterprise, unlicensed with the watermark. Remove it if AG Grid objects.
- **Map tiles:** a third-party tile source is fine on the public demo
- **Non-React features:** `ops-warehouse` in Svelte and `ops-flows` in Vue
