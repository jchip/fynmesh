# federation-inspector — design

A visual module browser for pages running `@fynmesh/systemjs` + `federation-js`.
Ships as a standalone IIFE you drop on a page (like systemjs or federation-js
themselves), puts a small badge in a page corner, and opens a dense inspector
overlay on click. The same code is consumable as an ES library so a Chrome
DevTools extension can be built on it without a rewrite.

Status: design. Package lives at `dev-tools/federation-inspector/`.

---

## 1. What it has to show

A person debugging a federated page is trying to answer questions the browser's
own devtools cannot:

| Question | Where the answer lives |
| --- | --- |
| What modules are loaded, and what stage is each in? | `System.records` + `System.stageOf` |
| What does this module depend on? What depends on it? | `LoadRecord.d` (forward), inverted for reverse |
| Which file did it actually come from? | `System.registrations.namesOf(url)` / record id |
| Which federation container owns it? | `__mf_container_*` / `__mf_entry_*` id conventions, `$SS` sources |
| Which versions of a container are live side by side? | `registrations.qualifiersOf(id)` |
| Who shares `esm-react`, at what versions? | `Federation.$SS[scope][key][version].sources` |
| Which copy actually got used, and why that one? | `$SS[...].url` / `.id` + the consumer's requested range |
| Who *asked* for a range that the resolved version does not satisfy? | container `$SC[key].options.semver` + `.rvm`, manifest `consume-shared` |
| Are there two copies of a singleton in play? | two `ShareMeta` versions with a `url` each |
| Which modules came from a combined bundle rather than their own file? | `Federation.bundleUrlFor(url)` |
| What exposes does this container publish, and are they loaded? | `container.$E` + record lookup per chunk id |
| What failed, and what was the stack? | `LoadRecord.f` / `.er` |

Everything above is obtainable from documented or empirically stable surfaces.
Nothing in this design requires a change to systemjs or federation-js.

---

## 2. Runtime surfaces this is built on

### 2.1 systemjs fork — the Record Exposure API (stable, documented)

`rollup-federation/systemjs/docs/api.md` documents these as the formal
extension contract, and `src/types.ts` types them:

- `System.records` — `RecordMap` over live `LoadRecord`s; iterable as `[id, record]`.
- `System.aliases` — bare name → canonical id.
- `System.registrations` — `RegistrationMap`: `get(name, qualifier)`, `has`,
  `qualifiersOf(name)`, `namesOf(url)`, `keys()`. Entries carry `{ url,
  registration, taken, take() }`.
- `System.stageOf(record)` → `instantiating | instantiated | linked |
  awaiting-deps | executing | executed | errored`.
- `System.hook(name, wrap)` — for the optional timeline (see §7).

`LoadRecord` fields used: `id`, `d` (dep records), `n` (namespace), `e`, `er`,
`f` (errored — the reliable flag; `er` may itself be falsy), `E`, `C`, `p`, `m`.

**The inspector reads records; it never writes core fields.** The types file
reserves single/double-letter names for core and says as much.

### 2.2 federation-js — what survives minification

`.terserrc` uses `mangle.properties.only_annotated`, and the annotations do not
predict the result — in **both** directions. Two things cause that:

- `only_annotated` is an **allow-list**. An `@__MANGLE_PROP__` annotation asks
  terser to rename that property, so an annotated name is deliberately gone
  from the shipped build. Reading the source and assuming annotated means
  "kept" inverts it.
- **esbuild drops the annotation** on a `this.x = ...` statement. federation-js
  carries 55 annotations in `src/`; only 36 of them survive into
  `dist/federation-js.dev.js`, the bundle terser then minifies. So the other 19
  names ship intact despite being marked.

Measured by grepping the shipped `dist/federation-js.min.js`:

| Surface | In min build |
| --- | --- |
| `$SS` (share store on the runtime, and on containers) | present |
| `$SC` (container share config) and `$SC[key].options` | present |
| `$E` (container exposes) | present |
| `$C` (container map), `$B` (bindings) | **present** — annotated, but the annotation never reached terser |
| `sources[].id` / `.container` / `.version` inside `$SS` | present |
| `_mfBind` `_mfContainer` `_mfGet` `_mfImport` `_mfInit` `_mfInitScope` `_mfLoaded` `_S` `_B` `_register` `_fetchBundle` | present |
| `resolve` `import` `register` `bundleUrlFor` `declareBundles` | present |
| `$SC[key].rvm`, `$SC[key].versions` | **mangled** to `i` and `o` |
| `getUrlForId`, `_mfGetContainer`, `getRegDefForId` | **mangled** |

The two maps `Container._S` builds inside a `$SC` entry are therefore the real
gap, and `rvm` is unrecoverable: nothing retains it once `_S` has returned, so
the inspector reports it as unavailable (`capability.requiredVersionMaps`)
rather than showing an empty map. `options.semver` — the range a container
declared — is unaffected and still shown.

`versions` is recoverable, because it is not the only record of the same event:
`_S` announces every copy it offers into `Federation.$SS` as
`{id, container, version}`, and it does so exactly when `options.import !==
false`, which is the same test the unmangled path applies. Inverting the share
store by container is therefore how `ContainerVersion.provides` is built (§3.2,
FYM-327) — an equivalent source, not a heuristic.

`$C` and `$B` being readable means the container-registry workaround in §3.2 is
a working choice rather than a forced one: containers are still enumerated from
`System.registrations`, and switching to the authoritative maps is its own
change, not a comment fix.

### 2.3 FynMesh enrichment (optional, never required)

A fynapp container entry assigns `_container.__FYNAPP_MANIFEST__` with `name`,
`version`, `exposes`, `consume-shared` (with `semver` ranges),
`import-exposed`, `shared-providers`. There is also a sibling
`federation.json` per build. Both are **optional enrichment layers**: the
inspector is a federation-js tool, not a FynMesh tool, so this lives in one
pluggable collector and its absence changes nothing but how much detail a
container row can show.

---

## 3. Architecture

The single most important decision:

> **The UI never touches a live loader object. It renders a plain, immutable,
> structured-clone-safe snapshot.**

That one constraint is what makes the Chrome-extension target free rather than a
rewrite: in an extension the panel runs in a different realm, and the only thing
that can cross the bridge is JSON. It also keeps the UI trivially testable
(feed it a fixture) and keeps a slow/failed probe from wedging rendering.

```
                    ┌──────────────────────────────────────┐
   live page realm  │  collectors/  (read-only probes)     │
                    │   systemjs.ts   federation.ts        │
                    │   manifest.ts   bundles.ts           │
                    └───────────────┬──────────────────────┘
                                    │  builds
                    ┌───────────────▼──────────────────────┐
                    │  model.ts   Snapshot  (plain JSON)   │
                    └───────────────┬──────────────────────┘
              ┌─────────────────────┼─────────────────────┐
              │ LiveAdapter         │ RemoteAdapter       │  ← same interface
              │ (same realm)        │ (postMessage / CDP) │
              └─────────────────────┴──────────┬──────────┘
                                               │  Snapshot
                    ┌──────────────────────────▼──────────┐
   any realm        │  analysis/  graph · resolve · diff  │
                    │  ui/        pure snapshot → DOM     │
                    └─────────────────────────────────────┘
```

### 3.1 Package layout

```
dev-tools/federation-inspector/
  src/
    index.ts                 library entry (ESM): collect, analyse, mount
    standalone.ts            IIFE entry: auto-mounts launcher + overlay
    core/
      model.ts               Snapshot types — the whole contract
      collect.ts             orchestrates collectors → Snapshot
      capability.ts          probes what this build exposes
      collectors/
        systemjs.ts          records, registrations, aliases, stages
        federation.ts        share store, containers, exposes, bundles
        manifest.ts          __FYNAPP_MANIFEST__ / federation.json (optional)
    analysis/
      graph.ts               forward + reverse deps, cycles, roots, depth
      resolution.ts          per-share "why this version" explanation
      diff.ts                snapshot A→B (for live refresh + timeline)
      search.ts              tokenised filter/fuzzy over the snapshot
    adapters/
      live.ts                same-realm adapter (collect + poll)
      remote.ts              postMessage transport, both ends
    ui/
      overlay.ts             <fed-inspector> host element, shadow root
      launcher.ts            corner badge
      theme.ts               design tokens (CSS custom properties)
      styles.ts              stylesheet as a string, adopted by the shadow root
      components/            table, row-detail, tree, chips, facet-bar, graph
      views/                 modules · containers · shares · graph · issues · raw
    util/
      dom.ts                 ~50-line h()/reactive helper (see §5.1)
      format.ts              url shortening, byte/ms, semver rendering
  rollup.config.js
  package.json
  tsconfig.json
  README.md
```

### 3.2 Container discovery without federation internals

`_mfContainer` files a container under `containerNameToId(name)` =
`"__mf_container_" + name`, and `_mfBind` gives an entry chunk the id
`"__mf_entry_" + containerName + "_" + fileName`. Both go into
`System.registrations`, qualified by container version.

So:

1. `System.registrations.keys()` → every id the loader knows.
2. Ids matching `^__mf_container_(.+)$` yield container **names**.
3. `registrations.qualifiersOf(id)` yields that container's live **versions**
   (opaque strings to the loader, semver to us).
4. `registrations.get(id, version).url` yields the **entry url** per version.
5. `System.records.get(id)` yields the entry's load record — stage, error, and
   its namespace, whose `container` export is the live `Container` (that is the
   published `FederationEntry` shape: `{ init, get, container }`).
6. From the `Container`: `name`, `id`, `version`, `scope`, `$E` (exposes),
   `$SC` (share config with `options.semver`, `options.singleton`, `rvm`,
   `versions`), `$SS`, and `__FYNAPP_MANIFEST__` when present.

Step 5 is the trick that makes the mangled `$C` a non-issue: the container
object is reachable through the loader's own record for the container entry, and
via `$SS[scope][key][version].sources[].container` as a cross-check.

Any container the loader has heard of but whose entry has not executed still
appears — as a row with url + versions and stage `instantiating`, which is
itself useful information ("this remote is still in flight").

### 3.3 Snapshot model (sketch)

```ts
interface Snapshot {
  takenAt: number;                 // performance.now()
  origin: string;                  // location.href, for the extension panel
  capability: Capability;          // what this build let us see
  loaders: LoaderInfo[];           // usually one; the fork is per-instance
  modules: ModuleNode[];
  containers: ContainerNode[];
  scopes: ShareScopeNode[];
  bundles: BundleNode[];           // combined-file → members
  issues: Issue[];                 // derived diagnostics, see §4.5
}

interface ModuleNode {
  id: string;                      // loader id (url, or __mf_* specifier)
  url?: string;                    // resolved url when known
  kind: 'container-entry' | 'exposed' | 'shared' | 'chunk' | 'external' | 'unknown';
  stage: LoadStage;
  aliases: string[];               // names in System.aliases pointing here
  deps: string[];                  // ids
  dependents: string[];            // ids (inverted)
  exports?: string[];              // namespace keys, when executed
  error?: { message: string; stack?: string };
  container?: { name: string; version?: string };
  scope?: string;
  shareKey?: string;               // when this module IS a shared module copy
  bundle?: string;                 // combined file it arrived in
  registration?: {
    qualifiers: string[];          // registrations.qualifiersOf(id)
    taken?: boolean;
    pending?: boolean;             // a registration is waiting, not consumed
  };
}

interface ContainerNode {
  name: string;
  id: string;                      // __mf_container_<name>
  versions: ContainerVersion[];    // side-by-side versions
}

interface ContainerVersion {
  version: string;
  entryId: string;
  entryUrl?: string;
  stage: LoadStage;
  scope: string;
  exposes: Array<{ name: string; chunkId: string; url?: string; stage?: LoadStage }>;
  provides: ShareDecl[];           // from $SC, import !== false
  consumes: ShareDecl[];           // from $SC + manifest consume-shared
  manifest?: unknown;              // __FYNAPP_MANIFEST__, verbatim
  bundles?: Record<string, string[]>;
}

interface ShareDecl {
  key: string;
  requestedRange?: string;         // options.semver
  singleton?: boolean;
  importable?: boolean;            // options.import !== false
  shareScope: string;
  versions: string[];              // versions this container can provide
  rvm?: Record<string, string>;    // importer dir → required version
  resolved?: {                     // filled by analysis/resolution.ts
    version?: string;
    url?: string;
    satisfies: boolean;            // requestedRange vs resolved version
  };
}

interface ShareScopeNode {
  name: string;
  keys: Array<{
    key: string;
    singleton: boolean;            // any declaring container said so
    versions: Array<{
      version: string;
      url?: string;                // set => a copy was loaded from here
      chunkId?: string;
      loaded: boolean;             // there is a record for it
      stage?: LoadStage;
      sources: Array<{ id: string; container: string; version?: string }>;
      consumers: Array<{ container: string; version?: string; range?: string; satisfied: boolean }>;
    }>;
    issues: Issue[];               // multiple live copies, unsatisfied range, ...
  }>;
}
```

`Capability` records, per probe: `records`, `registrations`, `aliases`,
`stageOf`, `shareStore`, `containerRegistry`, `shareConfig`, `manifest`,
`bundleMap` — each `true | false`, with a human string for the banner
("federation-js appears minified: container internals limited").

---

## 4. The UI

### 4.1 Shell

- **Launcher.** A fixed badge, default bottom-right, corner configurable
  (`bottom-right | bottom-left | top-right | top-left`) and draggable; position
  persisted in `localStorage`. 26px tall pill: a small hex/graph glyph, the
  module count, and — only when non-zero — a red error count and an amber issue
  count. `z-index: 2147483646`, inside a Shadow DOM host so the page's CSS
  cannot reach it and its CSS cannot reach the page. Precedent in this repo:
  `core/kernel/src/dev-error-overlay.ts` uses the same shadow-host approach.
- **Overlay.** Right-docked panel by default, drag-to-resize, with
  `full` / `dock-right` / `dock-bottom` modes. Backdrop is *not* modal — the
  page stays interactive, because you often want to click the page and watch
  modules arrive. `Esc` closes, `Ctrl/Cmd+Shift+M` toggles, `/` focuses search.
- **Header (single 32px row).** Tabs · global search · live-refresh toggle with
  an "N new since open" counter · snapshot age · export button (copies the
  snapshot JSON, which is also what you attach to a bug report).

### 4.2 Density rules

The brief is "pack as much as possible per row, not cramped". Concretely, as
tokens in `theme.ts`:

- Row height **24px**, cell padding `2px 6px`, hairline `1px` separators —
  no card padding, no rounded row containers, no shadow per row.
- Type: `11.5px/1.35` for ids and urls in `ui-monospace`, `11px` system-ui for
  labels and chips. Numbers tabular (`font-variant-numeric: tabular-nums`) so
  columns line up.
- Chips are 16px tall, `10px` text, `2px` radius, no border — a tinted
  background only. A row may carry up to four before they collapse to `+N`.
- Hierarchy comes from **weight and color, not whitespace**: id at
  `--fg-strong`, url tail at `--fg-dim`, metadata at `--fg-faint`.
- Long ids are **middle-truncated** (`react-dom/…/client.js`), never wrapped;
  full value in `title` and in the expanded detail.
- Sticky column header, sticky group headers when grouped.
- The window is a container query context: below ~720px the url and dependent
  columns drop out, below ~520px it becomes a two-line row. Nothing reflows
  into empty space.

Target: ~40 module rows visible in a 1080px-tall panel without scrolling.

### 4.3 Views

**Modules** (default). Virtualised table (see §5.2).

```
 ●  ⬒  fynapp-1 · __mf_entry_fynapp-1_fynapp-entry.js      1.0.0   d5  ▲2   executed   /demo/fynapp-1/dist/fynapp-entry.js
 ●  ◆  esm-react                                  react 19.0.0 ⓢ    d1  ▲7   executed   …/pkg-esm-react-19/dist/react.js
 ◐  ▫  ./App-BvOD4S9o.js                       fynapp-1@1.0.0      d3  ▲1   linked     …/fynapp-1/dist/App-BvOD4S9o.js
 ✕  ▫  ./broken-CHU6jq.js                      fynapp-4@1.0.0      d0  ▲1   errored    TypeError: x is not a function
```

- col 1 stage dot (color + shape, never color alone: ● executed, ◐ in flight,
  ◑ awaiting-deps, ○ registered-not-instantiated, ✕ errored)
- col 2 kind glyph (container entry / exposed / shared / chunk / external)
- col 3 id, middle-truncated, with the container prefix rendered as a dim chip
- col 4 version chip + singleton marker
- col 5 `d<n>` deps, col 6 `▲<n>` dependents — both click-through
- col 7 stage word, col 8 url tail (or the error message when errored)

Click expands **in-place** (a nested detail block inside the table, not a modal
and not a second pane — a modal would hide the list you are cross-referencing):
full id, full url, resolved-from, bundle it arrived in, registration entry
(qualifiers, url, `taken`/pending), export names, dep list and dependent list as
clickable rows, share participation, and the error stack when failed.

Controls above the table: search box; facet chips for stage / kind / container /
scope, each showing its count and toggling; `group by: none · container · scope ·
share key · bundle`; `sort: load order · id · deps · dependents · stage`.

**Containers.** One block per container, versions side by side when there are
several — the case this whole framework exists for, so it gets first-class
layout rather than a nested expander:

```
fynapp-x1                                                    2 versions live
├ 1.0.0  scope fynmesh   entry …/fynapp-x1-v1/dist/fynapp-entry.js  executed
│  exposes ./main ●  ./config ○                    consumes esm-react ^18 → 18.3.1 ✓
└ 2.0.0  scope fynmesh   entry …/fynapp-x1-v2/dist/fynapp-entry.js  executed
   exposes ./main ●                                consumes esm-react ^19 → 19.0.0 ✓
```

Each consumes line is a resolution row: requested range → resolved version, a ✓
or a ✗ with the reason. Exposes show their own load stage so you can see which
exposed module has actually been pulled. When `__FYNAPP_MANIFEST__` is present
the block also gets `import-exposed` (this app imports *that* app's expose) and
`shared-providers`, which is the cross-app wiring nothing else surfaces.

**Shares.** The tab that earns the tool. Grouped scope → key → version:

```
scope: fynmesh
  esm-react  ⓢ singleton                                    ⚠ 2 copies live
    19.0.0   ✔ loaded  …/pkg-esm-react-19/dist/react.js
             sources    fynapp-react-lib@19.0.0
             consumers  fynapp-1@1.0.0 ^19.0.0 ✓ · fynapp-6@1.0.0 ^19 ✓
    18.3.1   ✔ loaded  …/pkg-esm-react-18/dist/react.js
             sources    fynapp-react-18@1.0.0
             consumers  fynapp-2@1.0.0 ^18.0.0 ✓
```

The ⚠ header is the payoff: a singleton with two loaded versions is the exact
shape of the React-#525 class of bug, and today you find it by reading console
noise. Also flagged: a consumer whose range excludes the resolved version, a
share key with sources but no `url` (declared, never provided), and a key whose
`rvm` entries disagree.

**Graph.** Lazy-loaded view. Deterministic layered DAG (longest-path layering,
median heuristic for crossing reduction) drawn in SVG — no layout library, no
force simulation, so it is stable between refreshes and diffable by eye. Nodes
tinted by container, sized by dependent count; container/share boundaries drawn
as dashed hulls. Click a node to focus (dims everything outside its N-hop
neighbourhood); double-click to open it in Modules. For >400 nodes it defaults
to a focused subgraph rooted at the selected module, with a control to widen.
Cycles highlighted in red.

**Issues.** Every derived diagnostic in one list, most severe first, each row
deep-linking into the view that shows it. §4.5.

**Raw.** The snapshot as a collapsible JSON tree, plus a copy button. Escape
hatch for anything the views do not model, and the attachment for a bug report.

### 4.4 Cross-cutting interaction

- Everything that names a module, container, or share key is a link; the
  selection is one shared piece of state, so selecting `esm-react` in Shares and
  switching to Graph keeps it focused.
- Back/forward within the overlay (an internal history stack) so drilling into
  a dep chain is reversible.
- Search is one box with a small query grammar: bare text is a fuzzy match over
  id+url, `container:fynapp-1`, `stage:errored`, `scope:fynmesh`,
  `share:esm-react`, `kind:exposed`, `>deps:3`. Facet chips write into the same
  box, so the UI state is one URL-shaped string — which is also what the
  deep-link in an Issue row sets.
- Light and dark, driven by `prefers-color-scheme` with an explicit override in
  the header; both palettes defined as tokens on the shadow root.
- Accessible: real `<table>` semantics with `aria-expanded` rows, full keyboard
  path (`j/k` move, `Enter` expand, `[`/`]` switch tabs), focus-visible rings,
  and no state conveyed by color alone.

### 4.5 Derived diagnostics

`analysis/` computes these; they need no extra instrumentation:

| Issue | Detection |
| --- | --- |
| Singleton with multiple loaded versions | `$SS[scope][key]` has >1 version with a `url` and any declarer set `singleton` |
| Consumer range unsatisfied by resolved version | `satisfy(parseRange(range), resolvedVersion)` is false |
| Share declared but never provided | `ShareMeta` version with `sources` but no `url`/`id` |
| Duplicate module under two ids | two records whose `url`s are equal — the "one file, one address" fault federation warns about |
| Dependency cycle | Tarjan SCC over the dep graph |
| Errored module and its blast radius | `record.f`, plus the reverse-dep closure |
| Registration pending, never consumed | `registrations` entry with `registration` set and `taken` falsy, and no record |
| Container declared but entry never executed | container id in `registrations`, record missing or stage < executed |
| Combined bundle missed | `$bU`-driven warning path — only when the bundle map is readable |
| Orphan module | no dependents and not a container entry or exposed module |

Severity: error (errored module, unsatisfied singleton), warn (duplicate copy,
cycle, unsatisfied range), info (orphan, pending registration).

---

## 5. Implementation choices

### 5.1 UI layer: Preact + signals

`ui/` is written in Preact with `@preact/signals`, rendering into a Shadow
root. Reasons this over the alternatives:

- **The build does not grow.** `rollup-plugin-esbuild` is already the sibling
  packages' transform, and esbuild handles JSX natively
  (`jsx: 'automatic', jsxImportSource: 'preact'`). Svelte would have meant a
  new rollup plugin plus a TypeScript preprocess step.
- **Signals suit the shape of this UI.** One `snapshot` signal, one `query`
  signal, one `selection` signal; every view is a `computed` over them. A
  refresh replaces the snapshot and only the derived slices that actually
  changed re-render -- which matters, because the live poll replaces the whole
  snapshot every 500ms.
- **JSX beats template syntax for the width-adaptive table.** Columns are data
  (an array of column descriptors filtered by available width) and rows render
  by mapping over it; that is a natural expression in JSX and awkward in a
  template DSL.

`core/` and `analysis/` import nothing from `ui/` and have no Preact
dependency, so the extension's page-side agent bundles neither.

Bundle size is explicitly *not* a constraint on this tool (it is a devtools
overlay, not a runtime dependency), so the UI is built for legibility rather
than byte count. It still ships with no dependency beyond Preact.

### 5.2 Rendering a large registry

A real page can hold a few thousand records. The module table virtualises with a
fixed 24px row height and a windowed render (`overflow-y` spacer + absolute
rows), so DOM node count stays proportional to the viewport, not the registry.
Filtering and sorting run over the snapshot arrays, not the DOM.

### 5.3 Refresh, without instrumenting the loader by default

Default behaviour is **read-only**: collect on open, and while open re-collect
on a 500ms timer guarded by a cheap dirty check (record count + registration key
count + share-store shape hash). A full collect on a large registry is a few ms;
the dirty check makes the common idle case free.

`FederationInspector.attach()` is opt-in and additive: it wraps `System.hook`
(`resolve`, `instantiate`, `register`, `onload`) and the federation `_mf*`
entry points to record a **timeline** — resolve decisions with their inputs,
fetches with durations, share resolutions with the candidate set considered.
That turns "why did it pick 18.3.1" from an inference into a recording. It is
off by default because wrapping the loader is a mutation of the page under
inspection, and the tool's first promise is that looking does not change
anything.

### 5.4 Multiple loader instances

The fork's `records`, `registrations` and import map are per-instance, and
federation explicitly supports several loaders over one prototype. The collector
takes a loader (default `globalThis.System`) and the snapshot holds a
`loaders[]` array, so a page with more than one is shown as such rather than
silently reporting the first.

### 5.5 Degradation

Every probe is wrapped; a throw records a capability as false with the reason
instead of failing the collect. With federation absent entirely the tool is
still a perfectly good SystemJS module browser — the Containers and Shares tabs
say so and step aside. That also makes it useful outside this repo.

---

## 6. Public API

```ts
// library (ESM) — src/index.ts
export function collect(opts?: { loader?: SystemJSLoader; federation?: any }): Snapshot;
export function analyse(snapshot: Snapshot): Analysis;   // graph, issues, resolution
export function mount(opts?: MountOptions): InspectorHandle;
export function createRemoteAdapter(transport: Transport): Adapter;  // extension
export type { Snapshot, ModuleNode, ContainerNode, ShareScopeNode, Issue };

interface MountOptions {
  target?: HTMLElement;        // default: document.body
  corner?: Corner;             // default: 'bottom-right'
  launcher?: boolean;          // default: true — false to mount overlay only
  open?: boolean;              // default: false
  hotkey?: string | false;     // default: 'Ctrl+Shift+M'
  theme?: 'auto' | 'light' | 'dark';
  pollMs?: number | false;     // default: 500
  adapter?: Adapter;           // default: live adapter over globalThis.System
}

interface InspectorHandle {
  open(view?: ViewName, select?: string): void;
  close(): void;
  refresh(): Snapshot;
  snapshot(): Snapshot;
  attach(): () => void;        // opt-in timeline instrumentation; returns detach
  destroy(): void;
}
```

Standalone (`dist/federation-inspector.js`) exposes the same object as
`globalThis.FederationInspector` and auto-mounts on load, unless its own script
tag carries `data-auto="false"`; `data-corner`, `data-theme`, `data-hotkey` and
`data-open` map to the matching options.

```html
<script src="/federation-inspector.js"></script>
<!-- or -->
<script src="/federation-inspector.js" data-auto="false"></script>
<script>FederationInspector.mount({ corner: 'top-right', open: true })</script>
```

### Chrome extension path (not built here, but unblocked)

`adapters/remote.ts` provides both ends of a `Transport`
(`{ post(msg), on(fn) }`): a page-side agent that collects and posts snapshots,
and a panel-side adapter presenting the same `Adapter` interface the UI already
consumes. An extension is then: a content script bundling the page agent, a
devtools panel bundling `ui/` + `analysis/` over the remote adapter, and a
manifest. No inspector code changes.

---

## 7. Build

Mirrors `federation-js`: rollup + `rollup-plugin-esbuild` (with esbuild's
automatic JSX runtime pointed at Preact), terser for the min build, `tsc` for
declarations. Preact and `@preact/signals` are bundled in, not externalised --
the standalone build has to be a single file. CSS lives in `ui/styles.ts` as a template string
and is adopted into the shadow root via `CSSStyleSheet`/`adoptedStyleSheets`
(with a `<style>` fallback) — no second file to deploy.

| Output | Format | Purpose |
| --- | --- | --- |
| `dist/federation-inspector.js` | IIFE + sourcemap | drop-in dev bundle, auto-mounts |
| `dist/federation-inspector.min.js` | IIFE, terser | production drop-in |
| `dist/index.js` | ESM | library consumers, extension |
| `dist/*.d.ts` | — | `tsc` declarations |

Scripts follow the sibling package: `build = xrun -s clean tsc rollup minify`,
plus `test` on vitest. Registered in `rollup-federation/fynpo.json` by the
existing `packages: ["*"]` glob; **not** added to `command.publish.includePackages`
until we decide to publish it.

---

## 8. Status

Built. `dev-tools/federation-inspector/`, tracked as FYM-301 (epic)
with FYM-302..306.

| Layer | State |
| --- | --- |
| `core/` model, capability probing, collectors | done, 33 tests |
| `analysis/` graph, semver, resolution, issues, search | done |
| `adapters/` live + remote (postMessage both ends) | done |
| `ui/` shell, Modules, Containers, Shares, Graph, Issues, Raw | done |
| build: rollup + esbuild + terser + tsc | done |
| `attach()` timeline instrumentation | not built — §5.3, still the right shape. FYM-330 may be what finally motivates it |
| FynMesh / FynApp support | designed, not built — epic FYM-322 |
| Chrome extension | **dropped** (FYM-31, `wont_do`). The in-page badge works on any page, so a DevTools panel buys little; `adapters/remote.ts` keeps it unblocked if revisited |

Two implementation notes worth carrying forward, both found by tests against a
fake loader built to the real contracts:

**A specifier is not a module.** federation registers a chunk twice on
purpose -- the specifier (`./chunk-abc.js`) carries only a url, and the url
carries the registration, which is its "one file, one address" rule. Walking
`registrations.keys()` naively therefore shows every code-split chunk twice and
fires the duplicate-address diagnostic on a page where nothing is wrong. The
collector now folds a specifier whose url already has a record into that
module as an alias, and keeps a specifier index so an exposes map or a share
source holding one can find the module it names.

**Semver is ours, not federation's.** `federation-js`'s own `semver.ts` is what
actually decides resolution, and it is unreachable inside that bundle's IIFE.
`analysis/semver.ts` is therefore a report of what *should* have matched, not a
replay -- and it returns `undefined` rather than `false` for a range it cannot
parse, so the inspector never manufactures an issue out of its own limits.

## 9. Questions, answered

All three were decided on 2026-09-05. Kept here with their reasoning rather
than deleted, so the next person does not re-open them cold.

- **Ship it in the demo?** *Yes, done.* FYM-309 loads it at idle after first
  paint, served from its own `dist`. Note what that decision forecloses: any
  strategy that works by wrapping runtime functions early — a monkey-patched
  snapshot, for instance — needs to load *before* the containers register, and
  this deliberately does not.

- **Publish?** *No.* It stays private. The guard is `"private": true` in its
  own `package.json`, and only that: fynpo 3.0.5 reads neither
  `excludePackages` nor `includePackages` (the latter is used only by this
  repo's own `release-gate` task), so an exclude entry would be dead config.
  Before FYM-318 the real protection was fynpo's nested-repo auto-skip, which
  the move removed — worth knowing if the guard is ever revisited.

- **A first-class snapshot method on the runtime?** *Yes — `Federation.__I()`,
  in the normal dist.* FYM-326. Three things about it are worth carrying:

  1. **The justification here was wrong.** It is not that probing is blocked —
     §2.2's table is mistaken in both directions, and the container-registry
     workaround in §3.2 solves a problem that does not exist. The real
     justification is authoritative semver replay from *inside* the IIFE,
     which nothing outside can do.
  2. **It does not remove the probing.** Older runtimes still need the §3.2
     path as a fallback, so `__I()` is an accelerator, not a deletion.
  3. **A separate mangled add-on was considered and rejected.** Terser's
     `nameCache` does make it work — an add-on seeded from the main build's
     cache emits identical short names — but at 271 gzipped bytes it is
     *larger* than the 207 it would save by staying out of the main dist, and
     it pays for that with a committed name cache and silent-garbage failure
     on version drift.
