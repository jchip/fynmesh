/**
 * The overlay shell: launcher, chrome, tabs, filter bar, keyboard.
 *
 * The overlay is deliberately **not modal**. There is no backdrop and the page
 * stays interactive, because the normal way to use this is to click something
 * in the app and watch modules arrive -- a modal would make that impossible
 * and would be the wrong metaphor for an observation tool.
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useComputed } from "@preact/signals";
import type { ViewName } from "../core/model.js";
import type { Adapter } from "../adapters/types.js";
import {
  analysis,
  canGoBack,
  density,
  canGoForward,
  dock,
  expanded,
  floatRect,
  goBack,
  goForward,
  groupBy,
  live,
  newSinceOpen,
  open,
  openedWithCount,
  persist,
  query,
  selected,
  setSnapshot,
  size,
  snapshot,
  theme,
  view,
  visibleModules,
  type Dock,
  type GroupBy,
} from "./state.js";
import type { Density } from "./metrics.js";
import { ResizeHandles, reflowFloat, useHeaderDrag } from "./components/Resize.jsx";
import { toggleFacet } from "../analysis/search.js";
import { Icons, STAGE_LABEL, STAGE_ORDER } from "./components/atoms.jsx";
import { ModulesView } from "./views/modules.jsx";
import { SharesView } from "./views/shares.jsx";
import { ContainersView } from "./views/containers.jsx";
import { IssuesView } from "./views/issues.jsx";
import { RawView } from "./views/raw.jsx";
import { GraphView } from "./views/graph.jsx";
import { ago, ms } from "../util/format.js";

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface AppProps {
  adapter: Adapter;
  corner: Corner;
  showLauncher: boolean;
  hotkey: string | false;
  onClose?: () => void;
}

const TABS: Array<{ id: ViewName; label: string }> = [
  { id: "modules", label: "Modules" },
  { id: "containers", label: "Containers" },
  { id: "shares", label: "Shares" },
  { id: "graph", label: "Graph" },
  { id: "issues", label: "Issues" },
  { id: "raw", label: "Raw" },
];

export function App(props: AppProps): JSX.Element {
  const { adapter } = props;

  // Subscribed for the lifetime of the mount, open or closed. A closed panel
  // still has a badge, and the badge's error count is the whole reason to put
  // one on the page -- stopping the poll would freeze it at whatever the page
  // looked like when you last closed the panel. The cost is a `fingerprint()`
  // every 500ms, which walks registry keys and allocates nothing; the full
  // collect only runs when that changes.
  useEffect(() => {
    let cancelled = false;
    adapter.current().then((s) => {
      if (!cancelled) {
        setSnapshot(s);
      }
    });
    const off = adapter.subscribe((s) => setSnapshot(s));
    return () => {
      cancelled = true;
      off();
    };
  }, [adapter]);

  useEffect(() => {
    adapter.setLive(live.value);
  }, [live.value]);

  useKeyboard(props);

  return (
    <>
      {/*
        * The launcher is hidden while the panel is open. It is fixed to a page
        * corner and the panel docks to the same corner, so it sat on top of
        * the last two table rows -- covering the data it exists to advertise.
        */}
      {props.showLauncher && !open.value ? <Launcher corner={props.corner} /> : null}
      {open.value ? <Overlay {...props} /> : null}
    </>
  );
}

/* ---------------------------------------------------------------- launcher */

function Launcher({ corner }: { corner: Corner }): JSX.Element {
  const totals = useComputed(() => analysis.value.totals);
  return (
    <button
      class={"launcher " + corner}
      title="Open the federation inspector (Ctrl+Shift+M)"
      onClick={() => {
        openedWithCount.value = snapshot.value.modules.length;
        open.value = true;
      }}
    >
      {Icons.logo}
      <span class="count">{totals.value.modules}</span>
      {totals.value.errors ? <span class="badge err">{totals.value.errors}</span> : null}
      {totals.value.warnings ? <span class="badge warn">{totals.value.warnings}</span> : null}
    </button>
  );
}

/* ----------------------------------------------------------------- overlay */

function Overlay(props: AppProps): JSX.Element {
  const r = floatRect.value;
  const style =
    dock.value === "dock-right"
      ? { width: size.value + "px" }
      : dock.value === "dock-bottom"
        ? { height: size.value + "px" }
        : dock.value === "float"
          ? { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" }
          : {};

  // A window resize can leave a floating panel off-screen or a docked one
  // wider than the viewport, and neither is recoverable by dragging.
  useEffect(() => {
    window.addEventListener("resize", reflowFloat);
    return () => window.removeEventListener("resize", reflowFloat);
  }, []);

  return (
    <div class={"overlay " + dock.value} style={style} role="dialog" aria-label="Federation inspector">
      <ResizeHandles />
      <Header {...props} />
      <CapabilityBanner />
      {view.value === "modules" ? <FilterBar /> : <SimpleFilterBar />}
      <div class="body">{renderView(view.value)}</div>
    </div>
  );
}

function renderView(name: ViewName): JSX.Element {
  switch (name) {
    case "containers":
      return <ContainersView />;
    case "shares":
      return <SharesView />;
    case "graph":
      return <GraphView />;
    case "issues":
      return <IssuesView />;
    case "raw":
      return <RawView />;
    default:
      return <ModulesView />;
  }
}

function Header(props: AppProps): JSX.Element {
  const totals = useComputed(() => analysis.value.totals);
  const snap = snapshot.value;
  const drag = useHeaderDrag();

  const tabCount = (id: ViewName): JSX.Element | null => {
    switch (id) {
      case "modules":
        return <span class="n">{totals.value.modules}</span>;
      case "containers":
        return snap.containers.length ? <span class="n">{snap.containers.length}</span> : null;
      case "shares":
        return totals.value.shares ? <span class="n">{totals.value.shares}</span> : null;
      case "issues":
        // the count is every issue; the colour is the worst severity among
        // them. Showing only the error count read as "1 issue" next to a list
        // of three.
        return snap.issues.length ? (
          <span
            class={
              "n" + (totals.value.errors ? " err" : totals.value.warnings ? " warn" : "")
            }
          >
            {snap.issues.length}
          </span>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div class="header" {...drag}>
      <span class="title">
        {Icons.logo}
        <span class="hide-sm">federation</span>
      </span>

      <span class="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            class="tab"
            role="tab"
            aria-selected={view.value === t.id}
            onClick={() => (view.value = t.id)}
          >
            {t.label}
            {tabCount(t.id)}
          </button>
        ))}
      </span>

      <span class="meta hide-md" title={`collected in ${ms(snap.collectMs)}`}>
        {ago(snap.takenAt)}
        {newSinceOpen.value ? ` · +${newSinceOpen.value} new` : ""}
      </span>

      <span class="actions">
      <button
        class="iconbtn"
        title="Back"
        disabled={!canGoBack.value}
        style={{ opacity: canGoBack.value ? 1 : 0.35 }}
        onClick={goBack}
      >
        {Icons.back}
      </button>
      <button
        class="iconbtn"
        title="Forward"
        disabled={!canGoForward.value}
        style={{ opacity: canGoForward.value ? 1 : 0.35 }}
        onClick={goForward}
      >
        {Icons.forward}
      </button>

      <button
        class="iconbtn"
        aria-pressed={live.value}
        title={live.value ? "Live updates on — click to pause" : "Paused — click to resume"}
        onClick={() => (live.value = !live.value)}
      >
        {live.value ? Icons.pause : Icons.play}
      </button>
      <button class="iconbtn" title="Refresh now" onClick={() => props.adapter.refresh()}>
        {Icons.refresh}
      </button>
      <button
        class="iconbtn hide-sm"
        title="Copy the snapshot as JSON"
        onClick={() => copySnapshot()}
      >
        {Icons.copy}
      </button>
      <button
        class="iconbtn hide-sm"
        title={"Dock: " + dock.value}
        onClick={() => {
          const order: Dock[] = ["dock-right", "dock-bottom", "float", "full"];
          dock.value = order[(order.indexOf(dock.value) + 1) % order.length];
          persist();
        }}
      >
        {Icons.dock}
      </button>
      <button
        class="iconbtn text"
        title={"Text size: " + density.value + " (click to change)"}
        onClick={() => {
          const order: Density[] = ["compact", "normal", "relaxed"];
          density.value = order[(order.indexOf(density.value) + 1) % order.length];
          persist();
        }}
      >
        {density.value === "compact" ? "A-" : density.value === "relaxed" ? "A+" : "A"}
      </button>
      <button
        class="iconbtn hide-sm"
        title={"Theme: " + theme.value}
        onClick={() => {
          const order = ["auto", "light", "dark"] as const;
          theme.value = order[(order.indexOf(theme.value) + 1) % order.length];
          persist();
        }}
      >
        {Icons.theme}
      </button>
      <button
        class="iconbtn"
        title="Close (Esc)"
        onClick={() => {
          open.value = false;
          props.onClose?.();
        }}
      >
        {Icons.close}
      </button>
      </span>
    </div>
  );
}

/**
 * What this build would not let us read.
 *
 * Shown rather than swallowed because an empty Containers tab on a minified
 * page otherwise looks like "there are no containers", which is a much worse
 * answer than "the container internals are mangled in this build".
 */
function CapabilityBanner(): JSX.Element | null {
  const notes = snapshot.value.capability.notes;
  const errors = snapshot.value.errors;
  if (!notes.length && !errors.length) {
    return null;
  }
  return (
    <div class="banner">
      <span class="sev">limited</span>
      <span>
        <ul>
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          {errors.map((e, i) => (
            <li key={"e" + i}>{e}</li>
          ))}
        </ul>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- filter bar */

/**
 * The one search box.
 *
 * Its element is held module-side so the `/` shortcut can reach it: there is
 * exactly one at a time, and routing the focus through a ref is simpler and
 * more robust than querying the shadow root for a class.
 */
let searchEl: HTMLInputElement | null = null;

function SearchBox({ placeholder }: { placeholder: string }): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // the panel is opened to look for something; give it the caret
    searchEl = input.current;
    input.current?.focus();
    return () => {
      if (searchEl === input.current) {
        searchEl = null;
      }
    };
  }, []);
  return (
    <span class="search">
      {Icons.search}
      <input
        ref={input}
        value={query.value}
        placeholder={placeholder}
        spellcheck={false}
        onInput={(e) => (query.value = (e.currentTarget as HTMLInputElement).value)}
        aria-label="Filter"
      />
      {query.value ? (
        <button class="clear" title="Clear" onClick={() => (query.value = "")}>
          ✕
        </button>
      ) : null}
    </span>
  );
}

function SimpleFilterBar(): JSX.Element {
  const label =
    view.value === "shares"
      ? "filter share keys"
      : view.value === "containers"
        ? "filter containers"
        : view.value === "issues"
          ? "filter issues"
          : "filter";
  return (
    <div class="filterbar">
      <SearchBox placeholder={label} />
      <span class="spacer" />
      <ViewSummary />
    </div>
  );
}

function FilterBar(): JSX.Element {
  const facets = useComputed(() => analysis.value.facets);

  return (
    <div class="filterbar">
      <SearchBox placeholder="filter — try container:fynapp-1 or stage:errored" />

      <span class="facets hide-sm">
        {STAGE_ORDER.filter((s) => facets.value.stage.has(s)).map((s) => (
          <button
            key={s}
            class="facet"
            aria-pressed={query.value.includes("stage:" + s)}
            title={"Only " + STAGE_LABEL[s]}
            onClick={() => (query.value = toggleFacet(query.value, "stage", s))}
          >
            <span class={"stage " + s} style={{ width: "6px", height: "6px" }} />
            {STAGE_LABEL[s]}
            <span class="n">{facets.value.stage.get(s)}</span>
          </button>
        ))}
      </span>

      <span class="spacer" />

      <span class="grouplabel hide-md">group</span>
      <select
        class="selectish hide-md"
        value={groupBy.value}
        onChange={(e) => (groupBy.value = (e.currentTarget as HTMLSelectElement).value as GroupBy)}
        aria-label="Group by"
      >
        <option value="none">none</option>
        <option value="container">container</option>
        <option value="scope">scope</option>
        <option value="kind">kind</option>
        <option value="bundle">bundle</option>
      </select>

      <ViewSummary />
    </div>
  );
}

/**
 * The count at the right of the filter bar.
 *
 * Per-view, because the filter string is shared across tabs (deep links depend
 * on that) and a modules count shown while looking at Shares is just wrong --
 * it read "9 / 46" over a list of share keys.
 */
function ViewSummary(): JSX.Element {
  const snap = snapshot.value;

  let shown: number;
  let total: number;
  let noun: string;

  switch (view.value) {
    case "containers": {
      const q = query.value.trim().toLowerCase().replace(/^container:/, "");
      total = snap.containers.length;
      shown = q ? snap.containers.filter((c) => c.name.toLowerCase().includes(q)).length : total;
      noun = "containers";
      break;
    }
    case "shares": {
      const q = query.value.trim().toLowerCase().replace(/^share:/, "");
      const keys = snap.scopes.flatMap((sc) => sc.keys.map((k) => ({ scope: sc.name, key: k.key })));
      total = keys.length;
      shown = q
        ? keys.filter((k) => k.key.toLowerCase().includes(q) || k.scope.toLowerCase().includes(q))
            .length
        : total;
      noun = "share keys";
      break;
    }
    case "issues": {
      const q = query.value.trim().toLowerCase();
      total = snap.issues.length;
      shown = q
        ? snap.issues.filter(
            (i) =>
              i.title.toLowerCase().includes(q) ||
              i.detail.toLowerCase().includes(q) ||
              i.code.includes(q)
          ).length
        : total;
      noun = "issues";
      break;
    }
    default:
      total = snap.modules.length;
      shown = visibleModules.value.length;
      noun = "modules";
  }

  return (
    <span class="meta" title={shown + " of " + total + " " + noun}>
      {shown === total ? String(total) : shown + " / " + total}
    </span>
  );
}

/* ------------------------------------------------------------------- keys */

function useKeyboard(props: AppProps): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchesHotkey(e, props.hotkey)) {
        e.preventDefault();
        if (!open.value) {
          openedWithCount.value = snapshot.value.modules.length;
        }
        open.value = !open.value;
        return;
      }
      if (!open.value) {
        return;
      }

      const target = e.composedPath()[0] as HTMLElement | undefined;
      const typing = target?.tagName === "INPUT" || target?.tagName === "SELECT";

      if (e.key === "Escape") {
        if (typing && query.value) {
          query.value = "";
          return;
        }
        open.value = false;
        props.onClose?.();
        return;
      }
      if (typing) {
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchEl?.focus();
        searchEl?.select();
        return;
      }
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        const i = TABS.findIndex((t) => t.id === view.value);
        const next = (i + (e.key === "]" ? 1 : TABS.length - 1)) % TABS.length;
        view.value = TABS[next].id;
        return;
      }
      if (e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        moveCursor(e.key === "j" || e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" && selected.value) {
        e.preventDefault();
        const set = new Set(expanded.value);
        if (set.has(selected.value)) {
          set.delete(selected.value);
        } else {
          set.add(selected.value);
        }
        expanded.value = set;
      }
    };

    // capture, so the page cannot swallow the hotkey before we see it
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [props.hotkey]);
}

function moveCursor(delta: number): void {
  const list = visibleModules.value;
  if (!list.length) {
    return;
  }
  const current = list.findIndex((m) => m.id === selected.value);
  const next = current < 0 ? (delta > 0 ? 0 : list.length - 1) : current + delta;
  selected.value = list[Math.max(0, Math.min(list.length - 1, next))].id;
}

function matchesHotkey(e: KeyboardEvent, hotkey: string | false): boolean {
  if (!hotkey) {
    return false;
  }
  const parts = hotkey.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const wantCtrl = parts.includes("ctrl");
  const wantMeta = parts.includes("cmd") || parts.includes("meta");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  return (
    e.key.toLowerCase() === key &&
    e.ctrlKey === wantCtrl &&
    e.metaKey === wantMeta &&
    e.shiftKey === wantShift &&
    e.altKey === wantAlt
  );
}

function copySnapshot(): void {
  const text = JSON.stringify(snapshot.value, null, 2);
  navigator.clipboard?.writeText(text).catch(() => {
    // clipboard needs a permission or a secure context; fall back to the
    // console, which is always available and is where this is going anyway
    console.log("[federation-inspector] snapshot:", snapshot.value);
  });
}
