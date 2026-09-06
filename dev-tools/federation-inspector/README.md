# federation-inspector

A visual module browser for pages running [`@fynmesh/systemjs`](https://github.com/jchip/rollup-federation/tree/main/systemjs) and
[`federation-js`](https://github.com/jchip/rollup-federation/tree/main/federation-js). Drop one script tag next to them, get a
badge in the corner of the page, and click it for a dense panel showing every
module the loader knows, every federation container, every share scope, and
what actually resolved against what.

The same code is an ES library, so a Chrome DevTools extension can be built on
it without a rewrite.

```html
<script src="/federation-inspector.js"></script>
```

## What it answers

Things the browser's own devtools cannot tell you about a federated page:

| Question | Where |
| --- | --- |
| What is loaded, and what stage is each module in? | Modules |
| What depends on this? What does it depend on? | Modules, Graph |
| Which container owns this chunk? | Modules |
| Which versions of a container are live side by side? | Containers |
| Who shares `esm-react`, at what versions, from where? | Shares |
| Which copy did each app actually get, and does its semver range allow it? | Shares, Containers |
| **Are there two copies of a singleton in play?** | Issues |
| Which modules arrived inside a combined bundle? | Modules |
| What failed, and what else is stuck behind it? | Issues |

## Usage

### Standalone

Configuration goes on the script tag:

```html
<script src="/federation-inspector.js"
        data-corner="top-right"
        data-theme="dark"
        data-hotkey="ctrl+i"
        data-open="true"></script>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-auto` | `true` | mount automatically; `false` to call `mount()` yourself |
| `data-corner` | `bottom-right` | `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `data-theme` | remembered, else `auto` | `auto`, `light`, `dark` -- setting it overrides what the panel remembers |
| `data-density` | remembered, else `normal` | `compact`, `normal`, `relaxed` text size |
| `data-hotkey` | `ctrl+shift+m` | toggle combination, or `false` for none |
| `data-open` | `false` | open the panel immediately |
| `data-launcher` | `true` | `false` hides the badge (hotkey/API only) |
| `data-poll` | `500` | live-refresh interval in ms, or `false` |

`data-theme` and `data-density` are the two attributes the panel itself can
change, and it remembers what you set. Omitting the attribute keeps the
remembered value; supplying one is an instruction and wins over it.

The bundle also installs `globalThis.FederationInspector`:

```js
FederationInspector.instance.open("shares");
FederationInspector.instance.close();
const snapshot = FederationInspector.collect();
```

### As a library

```ts
import { collect, analyse, mount } from "federation-inspector";

const snapshot = collect();      // plain JSON, no live loader objects
analyse(snapshot);               // graph, share resolution, diagnostics
const handle = mount({ open: true, corner: "top-left" });
```

Importing the library has **no side effects** — nothing is mounted, no hook is
installed, no global is written.

### Keyboard

| Key | Action |
| --- | --- |
| `Ctrl+Shift+M` | toggle the panel |
| `Esc` | clear the filter, then close |
| `[` / `]` | previous / next tab |
| `j` / `k`, arrows | move the row cursor |
| `Enter` | expand the selected row |

### The graph

| Gesture | Action |
| --- | --- |
| drag | pan the canvas |
| `Ctrl`/`Cmd` + wheel, trackpad pinch | zoom about the pointer |
| wheel | scroll |
| click a node | focus its neighbourhood (a beat later, see below) |
| double-click a node | open it in Modules |
| `−` / `%` / `+` | zoom out, reset to 100%, zoom in |

Focusing a node re-lays out the graph around it, which moves the node you just
clicked -- so the click waits one double-click interval before it acts. That is
the price of keeping both gestures on the same target: without the pause the
second click of a double-click landed on empty canvas, because the first click
had already slid the node out from under the pointer.

Layout is [ELK](https://github.com/kieler/elkjs)'s layered algorithm —
crossing minimisation and orthogonal edge routing — bundled into the drop-in,
not fetched. It runs once per *shape*: the panel re-collects every 500ms, and a
graph that re-laid-out on each pass would move under you while you read it. A
module changing stage therefore redraws in place. Until the first layout
resolves (and if it ever fails) the view falls back to the built-in layered
placement, which is instant and unrouted.

### Filter grammar

The search box is the single source of filter state, so any view can be
reproduced from one string:

```
esm-react              fuzzy match on id + url
container:fynapp-1     stage:errored     kind:exposed
scope:fynmesh          share:esm-react   version:19
bundle:true            orphan:true       error:true
deps:>3                dependents:>=1
id:<full or part>      url:<full or part>
-stage:executed        any term negates with a leading "-"
```

`id:` and `url:` match alike — a case-insensitive substring — so half of an id
finds the module you half-remember. Deep links write the whole id, which no
other module's id contains, so they still land on the one module.

## How it reads the page

Read-only, and non-invasive by default. It installs no loader hook, mutates no
record, and calls no federation method that could load or resolve anything.

Its sources are:

- **`@fynmesh/systemjs`'s Record Exposure API** — `System.records`,
  `System.aliases`, `System.registrations`, `System.stageOf`. Documented,
  stable, and the reason this tool needs no cooperation from the page.
- **`Federation.$SS`** — the share store: scope → key → version → providers.
- **Container objects**, reached through the loader rather than through
  federation's own registry (see below), for `$E` (exposes), `$SC` (share
  config with the requested semver ranges), and `__FYNAPP_MANIFEST__` where a
  FynMesh build supplies one.

### Working with a minified federation build

`federation-js` ships terser-minified with property mangling, and the mangling
is not uniform. Measured against the shipped `federation-js.min.js`: `$SS`,
`$SC`, `$E` and the `_mf*` methods survive; `$C` — the runtime's container
registry — and `_mfGetContainer` do not.

So containers are enumerated from the **loader**, not the runtime. federation
files every container under a deterministic id (`__mf_container_<name>`,
qualified by version) and `System.registrations` holds it with its entry url;
the record for that url exports the live `Container`, because every generated
container entry does `exports({ container, get, init })`.

Anything still unreadable is reported as a capability note in a banner at the
top of the panel, rather than silently rendering an empty table. With no
federation on the page at all, it is a perfectly good SystemJS module browser.

### Live refresh

While open, the panel re-collects every 500ms behind a cheap fingerprint check
(record count, failed record identities, registration count, share-store shape),
so a full collect only runs when the fingerprint changes. A module rejection
refreshes diagnostics even when no new module has arrived. Ordinary stage
advancement still waits for the next fingerprint change or a manual refresh.

## Architecture

The UI renders a plain, structured-clone-safe `Snapshot` and never touches a
live loader object. That one constraint is what makes a devtools extension a
packaging exercise rather than a rewrite — in an extension the panel runs in a
different realm and only JSON can cross.

```
core/        collectors + Snapshot model      no DOM, no framework
analysis/    graph, share resolution, issues  pure functions over a Snapshot
adapters/    LiveAdapter | RemoteAdapter      same interface, either realm
ui/          Preact + signals in a Shadow DOM renders a Snapshot, nothing else
```

Everything it needs is compiled into the drop-in: Preact, signals and the ELK
layout engine. Nothing is imported through the page's SystemJS or federation,
nothing is fetched at runtime, and no module is registered with the loader —
an observer that participated in what it observes would be reporting on
itself. (This is why ELK's *bundled* build is used rather than its worker
build, which fetches `elk-worker.js` on first layout.)

`adapters/remote.ts` ships both ends of a `postMessage` bridge:
`serveRemote(transport)` in a content script, `new RemoteAdapter(transport)` in
a devtools panel, and the existing UI on top of it unchanged.

## Development

```sh
fyn            # install
fyn run build  # tsc + rollup + terser -> dist/
fyn run test   # vitest
```

Outputs:

| File | Format | For |
| --- | --- | --- |
| `dist/federation-inspector.js` | IIFE, Preact bundled in | the drop-in |
| `dist/federation-inspector.min.js` | IIFE, minified | production drop-in |
| `dist/index.js` | ESM, Preact external | library / extension |
| `dist/*.d.ts` | — | types |

Design notes: [`../../notes/federation-inspector-design.md`](../../notes/federation-inspector-design.md).
