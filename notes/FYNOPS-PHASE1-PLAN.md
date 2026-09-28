# FynOps Phase 1 — Plan

Status: done 2026-09-27 (see Results). Parent design: [`FYNOPS-DESIGN.md`](./FYNOPS-DESIGN.md).

## Goal

A working console with three real features on one page:

- `fynops-shell`: hash routes, layout, a detail drawer, fake login.
- Providers: `fynops-ui`, `fynops-charts-lib`, plus `fynops-data` and `fynops-grid-lib` from Phase 0.
- Features: `ops-shipments`, `ops-map`, `ops-analytics`.

The page loads only the shell by name. The kernel pulls in every provider from the manifests. A feature finds its providers through its package.json: create-fynapp records a provider FynApp as a `shared-provider` only when the feature lists it as a dependency.

## Contracts

These are fixed before any parallel work starts. Every task codes against them.

### Loading

`fynops.html` installs one registry resolver and loads only the shell:

```js
fynMeshKernel.setRegistryResolver(async (name, range) => {
  const dir = name === "fynapp-react-lib" ? (range?.startsWith("^18") ? "fynapp-react-18" : "fynapp-react-19") : name;
  const distBase = `${pathPrefix}${dir}/dist/`;
  return { name, version: "0.0.0", url: `${distBase}fynapp.manifest.json`, distBase };
});
await fynMeshKernel.loadFynAppsByName([{ name: "fynops-shell" }]);
```

The shell loads a feature with `loadFynAppsByName([{ name: "ops-map" }])` on the first visit to its route. The kernel walks `shared-providers` and loads `fynops-ui`, `fynops-data` and the rest first. A second call for a loaded app is a no-op. This closes Phase 0 open item 4.

### Shell middleware and views

`fynops-shell` exposes a middleware named `fynops-shell` with `autoApplyScope: ["fynapp"]`, like `shell-layout.ts` does. The kernel applies it to every FynApp loaded after the shell. It puts the shell API on each app's `middlewareContext`:

```ts
interface FynOpsShellApi {
  session: { user: string; role: "dispatcher" | "manager" };
  registerView(view: FynOpsView): void;          // called once from a feature's execute()
  navigate(path: string): void;                   // "#/map"
  openDrawer(app: string, params?: Record<string, string>): void;
  selection: {                                    // backed by an ObservableState in the kernel's middleware registry
    get(): Selection;
    set(next: Selection): void;
    subscribe(fn: (s: Selection) => void): () => void;
  };
}
interface Selection { shipmentId?: number; vehicleId?: number }
interface FynOpsView {
  mount(el: HTMLElement, props: { target: "main" | "drawer"; params: Record<string, string> }): () => void;
}
```

A feature's `./main` does its work in `execute()`:

```ts
execute(runtime) {
  const shell = runtime.middlewareContext.get("fynops-shell");
  shell.registerView({ mount: (el, props) => renderInto(el, props, runtime) });
  return { type: "no-render" };
}
```

`mount` closes over `runtime`, so the feature's bus messages carry its own source. `mount` can run twice, once in main and once in the drawer. The shell keeps a mounted route alive and hides it on navigation, so the grid and map keep their state.

### Data

`fynops-data-core` (shared, singleton) grows these calls. All run SQL in the worker.

| Call | Returns | Used by |
|---|---|---|
| `shipments.rows(req)` | `{ rowData, rowCount }`, the exact argument of the grid's `params.success()`, for grouping, sort, filter and block range | ops-shipments |
| `shipments.get(id)` | one shipment with lane, carrier and vehicle | drawer, map |
| `vehicles.positions()` | current `{id, lon, lat, status}` for every vehicle | ops-map first paint |
| `analytics.onTime(by)`, `analytics.laneCost()`, `analytics.trend(days)` | chart-ready rows | ops-analytics, sparklines |

`req` → SQL translation is a pure function, so it gets unit tests.

The `fynops-data` FynApp owns the simulator. Every second the worker moves vehicles, writes positions, and posts them to the main thread. The FynApp then emits them on its bus.

### Bus topics

| Topic | Kind | Producer | Consumers |
|---|---|---|---|
| `ops:vehicle.positions` | emit, 1Hz | fynops-data | ops-map, ops-analytics |
| `ops:shipment.get` | request | any | fynops-data handles |

Selection moves out of the bus. The shell owns it as shared state. A feature that mounts late reads the current value, which the bus can't replay. This replaces `ops:shipment.selected` and `ops:route.open` in the design's topic table.

## Tasks

Waves run in parallel inside and in order across. "Fork" means a same-model agent for work that needs design judgment. "Sonnet" is for work that follows an existing recipe.

### Wave A: shell and providers

| Task | Agent | Scope | Done when |
|---|---|---|---|
| A1 shell | fork | `fynops-shell`, `fynops.html` resolver | Routes switch views. The drawer opens. Login sets a role. A stub feature registered through the middleware mounts in main and drawer. |
| A2 UI kit | Sonnet | `fynops-ui-kit` package + `fynops-ui` provider | Button, Panel, Toolbar, StatTile, Badge, Table shell, tokens as CSS variables with light and dark. A stub page renders every piece. |
| A3 charts | Sonnet | `misc/esm-echarts` + `fynops-charts-lib` | Follows the `esm-ag-grid` recipe. A stub renders one chart through the shared module. |
| A4 data | fork | `fynops-data`, `fynops-data-core` | The new calls return rows. The simulator emits positions. Unit tests for the request → SQL translation pass. |

### Wave B: features

| Task | Agent | Scope | Done when |
|---|---|---|---|
| B1 shipments | fork | `ops-shipments` | Server-side grid grouped by lane and carrier, with sort, filter, Excel export and an echarts sparkline column. Row click sets selection and opens the drawer detail view. |
| B2 map | Sonnet | `ops-map` | Ported from `spike-maplibre`. Vehicles move from the bus. It pans to the selected shipment's vehicle. Clicking a vehicle sets selection. |
| B3 analytics | Sonnet | `ops-analytics` | Four charts from the analytics calls. The on-time KPI updates from the position stream. |

### Wave C: integration (lead)

1. Wire every new package into `build-demo-site.mts`, and fix the Phase 0 cache-rule gaps (`.mjs`, unhashed worker and wasm names).
2. Add FynOps startup preload hints with a `FYNOPS_STARTUP_FYNAPPS` list in `shell-preload.mts`. `collectShellPreloadModules` already takes the list as a parameter.
3. Delete `spike-grid`, `spike-maplibre` and `spike-data`, which the real features replace. `spike-monaco` and `spike-pdf` stay for Phase 2.
4. Run the Phase 1 checks below in the browser, then update the design doc.

Each agent writes its summary to `.temp/phase1-<task>.md`. Agents never touch git, `fyn bootstrap`, or files outside their scope. The same lock and browser-session rules as Phase 0 apply.

## Phase 1 checks

From the design doc, plus the contracts above:

- Selecting a shipment in the grid pans the map to its vehicle. It also works the other way round.
- Vehicles move on the map in real time.
- echarts downloads once, while both `ops-analytics` and `ops-shipments` use it.
- A cold load of `#/shipments` downloads only the shell, its providers and `ops-shipments`. `ops-map` and `ops-analytics` load on first visit.
- No page code sets load order. The kernel resolves every provider by name.
- `fyn build-demo` passes with FynOps included.

## Decisions to confirm

1. **Excel export uses ag-grid enterprise's built-in export, not SheetJS.** We already ship enterprise, and the current SheetJS isn't on the npm registry. That drops about 900KB.
2. **Selection is shared state owned by the shell, not a bus event.** See Bus topics.
3. **The UI kit ships its own CSS-variable tokens.** It doesn't build on the `fynapp-design-tokens` middleware. That keeps the kit free of middleware coupling. Theme switching through design-tokens can come later.
4. **Features register views through the shell middleware.** They don't use the `./component` expose or execution override from `shell-layout.ts`. It is framework-neutral, so the Svelte and Vue features in Phase 3 use the same path.

## Results

All checks pass, on both the dev build and the production build. No kernel, federation or create-fynapp change was needed.

| Check | Result |
|---|---|
| Grid selection pans the map | A row click sets the selection and opens the drawer. The map then flies to that vehicle and highlights it. |
| Map selection reaches the grid | A vehicle click sets `{ vehicleId, shipmentId }` in the shared state and opens the shipment in the drawer. |
| Vehicles move in real time | 500 vehicles, 1Hz, over `ops:vehicle.positions`. The drawer's vehicle position updates live too. |
| echarts downloads once | One `esm-echarts` request, used by both `ops-shipments` sparklines and `ops-analytics`. |
| Cold `#/shipments` loads only what it needs | React 19, the shell, `ops-shipments` and its six providers. `ops-map` and `ops-analytics` load on first visit. |
| The kernel resolves providers by name | `fynops.html` names only `fynops-shell`, and each feature is loaded by name. |
| `fyn build-demo` passes | All eight packages ship. The data worker and `sqlite3.wasm` get the revalidate rule. |

**Shipped size.** Phase 1 ships 6.6MB raw and 2.0MB gzip across ten FynApps, counting the shared React 19 and community grid. The feature apps themselves are tiny: `ops-shipments` 5.9KB gz, `ops-analytics` 3.6KB gz, and the shell 4.4KB gz. The weight sits in the shared libraries and the map. monaco and pdf.js add about 1.9MB gz in Phase 2.

**Contract changes during the build.**

- `shipments.rows()` returns `{ rowData, rowCount }`, the grid's `success()` argument.
- A feature must list each provider FynApp in its package.json `dependencies`. That is how create-fynapp records `shared-providers`, and the kernel resolves providers from them.
- The kernel runs an auto-applied middleware's `setup` once per target app, not once overall. The shell middleware keeps its state in a shared module for that reason.

**Changed during integration.** The simulator had every vehicle `en_route` forever, so the live status tiles never moved. Vehicles now spend 12 ticks `loading` at each warehouse, and every 40th vehicle is in `maintenance`.

**Open items.**

1. The dev proxy sends no `Cache-Control`, `ETag` or `Last-Modified` on FynApp files. After a rebuild, the browser can keep an old `fynapp-entry.js`. This predates FynOps. A `no-cache` header on the dev proxy would fix it.
2. With the server-side row model, grid Excel export covers loaded rows only. The UI says so.
3. The UI kit's badge status colors are close together for a categorical chart. The analytics donut adds labels to compensate. Worth a palette pass in the kit.
4. agent-browser sessions sometimes stop producing frames after long use. Closing and reopening the session fixes it.


## Load performance on Fast 4G

A cold reload of `#/shipments` with DevTools "Fast 4G" (about 1 MB/s, 165ms RTT), cache disabled, production build. The page and the sqlite worker were both throttled. Script: `.temp/perf/cold-load.mjs`.

| Milestone | Before | After |
|---|---|---|
| Nav paints | 590ms | 695ms |
| Loading spinner | none | 695ms |
| Providers bootstrapped | 1620ms | 1035ms |
| Grid on screen | 3277ms | 1685ms |
| 20 rows | 3400ms | 2073ms |

What changed:

- **Kernel.** `buildGraph` walks sibling dependencies at the same time. Before, it awaited each one, so six providers cost six round trips.
- **Kernel.** `loadFynAppsByName` emits `FYNAPP_LOADING` and `FYNAPP_LOADED` for each app it loads, with `requestedBy`.
- **Page.** `fynops.html` hints the open route's feature and providers at low priority. The script sits in `head_start`, ahead of the stylesheets, because an inline script waits for them.
- **ops-shipments.** The sparklines import echarts on first use, so its 290KB comes after the rows.
- **Shell.** `ViewHost` shows a spinner and "n of m FynApps" until the view mounts.

What is left:

- The nav is 100ms later. The dev proxy is HTTP/1.1, so low-priority hints share bandwidth with the shell. A server that honors priority should close most of that gap.
- `sqlite3.wasm` (341KB) is now the last thing the rows wait for. Its fetch starts in the worker, which can't reuse a page preload. With the cache enabled, a content-hashed name and an immutable cache rule would let a page preload warm it.
