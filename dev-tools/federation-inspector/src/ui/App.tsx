/**
 * The overlay shell: launcher, chrome, tabs, filter bar, keyboard.
 *
 * The overlay is deliberately **not modal**. There is no backdrop and the page
 * stays interactive, because the normal way to use this is to click something
 * in the app and watch modules arrive -- a modal would make that impossible
 * and would be the wrong metaphor for an observation tool.
 */

import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import type { ShareScopeNode, Snapshot, ViewName } from "../core/model.js";
import type { Adapter } from "../adapters/types.js";
import {
  analysis,
  canGoBack,
  canGoForward,
  dock,
  expanded,
  goBack,
  goForward,
  groupBy,
  live,
  newSinceOpen,
  open,
  openedWithCount,
  query,
  selected,
  setSnapshot,
  snapshot,
  view,
  visibleModules,
  type Dock,
  type GroupBy,
} from "./state.js";
import {
  ResizeHandles,
  drawnRect,
  drawnSize,
  reflowFloat,
  useHeaderDrag,
} from "./components/Resize.jsx";
import { facetState, filterContainers, filterScopes, toggleFacet } from "../analysis/search.js";
import { Icons, STAGE_LABEL, STAGE_ORDER } from "./components/atoms.jsx";
import { TabStrip } from "./components/TabStrip.jsx";
import { SettingsMenu, handleSettingsKey } from "./components/SettingsMenu.jsx";
import { ModulesView } from "./views/modules.jsx";
import { SharesView } from "./views/shares.jsx";
import { ContainersView } from "./views/containers.jsx";
import { filterFynApps, FynAppsView } from "./views/fynapps.jsx";
import { filterMiddleware, MiddlewareView } from "./views/middleware.jsx";
import { filterIssues, IssuesView } from "./views/issues.jsx";
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
  { id: "fynapps", label: "FynApps" },
  { id: "middleware", label: "Middleware" },
  { id: "containers", label: "Containers" },
  { id: "shares", label: "Shares" },
  { id: "graph", label: "Graph" },
  { id: "issues", label: "Issues" },
  { id: "raw", label: "Raw" },
];

/**
 * The tabs this page has anything to put in.
 *
 * FynApps and Middleware are absent entirely on a page with no
 * `@fynmesh/kernel`, rather than present and empty. An empty table there would
 * read as "this page has zero FynApps", which is a different and much more
 * alarming claim than "this page is not a FynMesh page" -- and it is the second
 * one that is true. They sit ahead of Containers because on a page that does
 * have a kernel they are the views you actually want first.
 */
const KERNEL_TABS = new Set<ViewName>(["fynapps", "middleware"]);

function tabsFor(snap: Snapshot): Array<{ id: ViewName; label: string }> {
  return snap.fynmesh ? TABS : TABS.filter((t) => !KERNEL_TABS.has(t.id));
}

export function App(props: AppProps): JSX.Element {
  const { adapter } = props;

  // Subscribed for the lifetime of the mount, open or closed. A closed panel
  // still has a badge, and the badge's error count is the whole reason to put
  // one on the page -- stopping the poll would freeze it at whatever the page
  // looked like when you last closed the panel. The cost is a `fingerprint()`
  // every 500ms, which checks registry keys and failure flags; the full
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
  const showing = useOpenTransition();

  return (
    <>
      {/*
        * The launcher is hidden while the panel is on screen -- including
        * while it animates away. It is fixed to a page corner and the panel
        * docks to the same corner, so it sat on top of the last two table
        * rows: covering the data it exists to advertise.
        */}
      {props.showLauncher && !showing ? <Launcher corner={props.corner} /> : null}
      {showing ? <Overlay {...props} closing={!open.value} /> : null}
    </>
  );
}

/** how long the exit animation in ui/styles runs; they must agree */
const EXIT_MS = 120;

/**
 * Keep the panel mounted until its exit animation has played.
 *
 * `open` is the intent, and it flips instantly from four places (the button,
 * Escape, the hotkey, the API). Unmounting on that flip is what made closing
 * a cut rather than a movement: the panel was simply gone on the frame the
 * click landed. So the panel stays mounted for one animation past the intent,
 * and `closing` tells it which way to play.
 */
function useOpenTransition(): boolean {
  const isOpen = open.value;
  const [showing, setShowing] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShowing(true);
      return;
    }
    // the next opening gets to claim the caret again -- keyed to the intent,
    // not to the exit animation, so a quick close-and-reopen still behaves
    // like an opening
    caretClaimed = false;
    if (!showing) {
      return;
    }
    // matched to the animation, not to a repaint: an animationend listener
    // would also fire for animations *inside* the panel
    const t = setTimeout(() => setShowing(false), reducedMotion() ? 0 : EXIT_MS);
    return () => clearTimeout(t);
  }, [isOpen, showing]);

  return showing;
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
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

/**
 * The panel's root element while it is on screen, or null.
 *
 * There is exactly one, and the key handler needs it to decide whether a
 * keystroke belongs to us or to the page: `document.activeElement` cannot
 * answer that, because the panel lives in a shadow root and the document only
 * ever reports the host element, whatever is focused inside it.
 */
let panelEl: HTMLElement | null = null;

/**
 * The overlay's classes for one frame.
 *
 * `opening` and `closing` are the two enter/leave animations, and each dock
 * mode names its own keyframes -- so `opening` is not a synonym for "not
 * closing". Left on for the panel's whole life it replays the enter animation
 * every time the dock changes, because that swaps the `animation-name`
 * underneath it. It comes off once the animation has ended.
 */
export function overlayClass(dock: Dock, closing: boolean, entering: boolean): string {
  return "overlay " + dock + (closing ? " closing" : entering ? " opening" : "");
}

function Overlay(props: AppProps & { closing: boolean }): JSX.Element {
  /*
   * Drawn from the remembered geometry clamped to the *current* viewport, and
   * subscribed to `viewport` so a window resize redraws it. The clamp is not
   * written back: narrowing the window and widening it again returns the panel
   * to the size it had, rather than stranding it at the narrowest the window
   * has ever been.
   */
  const r = drawnRect();
  // this mount *is* one opening: the panel unmounts once it has closed
  const [entering, setEntering] = useState(true);
  const drawn = drawnSize();
  const style =
    dock.value === "dock-right"
      ? { width: drawn + "px" }
      : dock.value === "dock-bottom"
        ? { height: drawn + "px" }
        : dock.value === "float"
          ? { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" }
          : {};

  // A window resize can leave a floating panel off-screen or a docked one
  // wider than the viewport, and neither is recoverable by dragging. The same
  // is true of a geometry restored from localStorage on a smaller screen than
  // the one it was saved on, so the first pass runs on mount.
  useEffect(() => {
    reflowFloat();
    window.addEventListener("resize", reflowFloat);
    return () => window.removeEventListener("resize", reflowFloat);
  }, []);

  return (
    <div
      // held module-side so the key handler can ask "did this keystroke come
      // from inside the panel?" -- see `useKeyboard`
      ref={(el) => {
        panelEl = el;
      }}
      class={overlayClass(dock.value, props.closing, entering)}
      // animation events bubble, and rows inside the panel have animations of
      // their own -- only the overlay's own end says the enter is over
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) setEntering(false);
      }}
      style={style}
      role="dialog"
      aria-label="Federation inspector"
      aria-hidden={props.closing}
    >
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
    case "fynapps":
      return <FynAppsView />;
    case "middleware":
      return <MiddlewareView />;
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
      case "fynapps":
        return snap.fynmesh?.apps.length ? (
          <span class={"n" + (fynappErrors(snap) ? " err" : "")}>{snap.fynmesh.apps.length}</span>
        ) : null;
      case "middleware":
        return snap.fynmesh?.middlewares.length ? (
          <span class="n">{snap.fynmesh.middlewares.length}</span>
        ) : null;
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
    <>
    <div class="header" {...drag}>
      <span class="title">
        {Icons.logo}
        <span class="name">FynMesh Module Federation Inspector</span>
      </span>

      <span class="spacer" />

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
      {/* Theme, text size, dock and copy sit behind one labelled trigger
          rather than as four icon buttons, so they are there at every panel
          width instead of being the first things a narrow panel drops. Dock,
          the one control that changes the panel's shape, used to go at 557px
          -- exactly when the panel was the wrong shape. */}
      <SettingsMenu />
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
    <TabStrip tabs={tabsFor(snap).map((tab) => ({ ...tab, count: tabCount(tab.id) }))}
      active={view.value} onSelect={(id) => (view.value = id)} />
    </>
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

/** whether this opening of the panel has already taken the caret */
let caretClaimed = false;

function SearchBox({ placeholder }: { placeholder: string }): JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchEl = input.current;
    // The panel is usually opened to look for something, so it takes the caret
    // -- but never *away* from someone who is already typing. The hotkey can
    // fire while a page form has the caret (that is what a global hotkey is
    // for), and an observer that empties the field you were filling in has
    // changed the page, which is the one thing this tool must not do.
    /*
     * Once per opening, not once per mount.
     *
     * Crossing between Modules and any other tab swaps FilterBar for
     * SimpleFilterBar, which remounts this box -- so tabbing with `]` handed
     * the caret to the filter, and the next `]` was typed into it instead of
     * moving on. The claim belongs to the act of opening the panel, and
     * `caretClaimed` is reset when it closes.
     */
    if (!caretClaimed && !isEditable(deepActiveElement())) {
      caretClaimed = true;
      input.current?.focus();
    }
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
        : view.value === "fynapps"
          ? "filter fynapps — try status:failed"
          : view.value === "middleware"
            ? "filter middleware — try mw:design-tokens"
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
            // Parsed, not searched: `-stage:executed` *contains* "stage:executed"
            // but means the opposite of it, and a chip drawn pressed for the
            // filter that is hiding those rows explains nothing and mis-announces
            // itself to a screen reader.
            aria-pressed={facetState(query.value, "stage", s) === "on"}
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
 *
 * Every branch counts through the very function its view renders with, never a
 * second test kept in step by hand. The hand-written one for Shares had
 * already fallen behind `container:` and read "0 / 7" over two visible rows;
 * the copies for Containers and Issues agreed with their lists only because
 * they were copies, and would have parted from them the moment either side
 * learned a facet the other did not. A number that argues with the list under
 * it is worse than no number.
 */
function ViewSummary(): JSX.Element | null {
  const snap = snapshot.value;

  // Raw and Graph are not lists and the filter does not narrow them, so a
  // count here would be describing a different tab's contents.
  if (view.value === "raw" || view.value === "graph") {
    return null;
  }

  let shown: number;
  let total: number;
  let noun: string;

  switch (view.value) {
    case "fynapps": {
      const apps = snap.fynmesh?.apps ?? [];
      total = apps.length;
      shown = filterFynApps(apps, query.value).length;
      noun = "fynapps";
      break;
    }
    case "middleware": {
      const mws = snap.fynmesh?.middlewares ?? [];
      total = mws.length;
      shown = filterMiddleware(mws, query.value).length;
      noun = "middleware";
      break;
    }
    case "containers": {
      total = snap.containers.length;
      shown = filterContainers(snap.containers, query.value).length;
      noun = "containers";
      break;
    }
    case "shares": {
      total = countShareKeys(snap.scopes);
      shown = countShareKeys(filterScopes(snap.scopes, query.value));
      noun = "share keys";
      break;
    }
    case "issues": {
      total = snap.issues.length;
      shown = filterIssues(snap.issues, query.value).length;
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

function countShareKeys(scopes: ShareScopeNode[]): number {
  return scopes.reduce((n, s) => n + s.keys.length, 0);
}

/** a FynApp whose bootstrap threw -- the tab count turns red for it */
function fynappErrors(snap: Snapshot): boolean {
  return !!snap.fynmesh?.apps.some((a) => a.status === "failed");
}

/* ------------------------------------------------------------------- keys */

/**
 * What the panel is allowed to take from the page.
 *
 * This is an observer dropped onto someone else's page, so the page keeps its
 * keyboard. Only two keys are global: the hotkey the host configured (that is
 * what configuring it means) and Escape, which never calls preventDefault so
 * the page still gets its own -- an always-available way out of a panel you
 * cannot see the close button of. (An open settings menu is the one place
 * Escape is consumed: it closes the menu rather than the panel, and that
 * keystroke started inside the panel.)
 *
 * Everything else -- `/`, `[`/`]`, j/k and the arrows -- is a single
 * unmodified keystroke, which is to say it is a character or a caret movement
 * that belongs to whatever the person is typing into. Those only fire when the
 * keystroke started *inside the panel*, and never while a field there has the
 * caret. Nothing is preventDefault'ed outside the panel, so the page's own
 * shortcuts, forms and scroll behave exactly as they would with no inspector
 * on the page.
 */
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

      // composedPath, not e.target: the panel is in a shadow root, so an event
      // from our search box is retargeted to the host element by the time the
      // document sees it. The path is the only place the real element survives.
      const path = e.composedPath();
      const target = path[0] as HTMLElement | undefined;
      const inPanel = !!panelEl && path.includes(panelEl);
      const typing = isEditable(target);

      // The settings menu owns Escape while it is open, and every key while
      // the caret is inside it: a select's arrows move between its options,
      // not the row cursor, and Escape closes the menu before it closes the
      // panel.
      if (panelEl && handleSettingsKey(e, path, panelEl)) {
        return;
      }

      if (e.key === "Escape") {
        // only our own search box clears; a page field's Escape is the page's
        if (inPanel && typing && query.value) {
          query.value = "";
          return;
        }
        open.value = false;
        props.onClose?.();
        return;
      }
      if (!inPanel || typing) {
        return;
      }
      /*
       * Everything below is a single unmodified keystroke, and the modifier
       * check is what makes that true rather than merely intended. Without it
       * the panel ate Cmd+] and Cmd+[ -- browser Forward and Back on macOS --
       * and turned Shift+ArrowDown, which means "extend the selection", into a
       * cursor move. A chord belongs to the browser or the page; the bare key
       * is the only one this panel has a claim on.
       */
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
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
        // the same list the header draws, or the cycle steps onto a tab that
        // is not offered on this page
        const tabs = tabsFor(snapshot.value);
        const i = tabs.findIndex((t) => t.id === view.value);
        const next = (i + (e.key === "]" ? 1 : tabs.length - 1)) % tabs.length;
        view.value = tabs[next].id;
        return;
      }
      if (e.key === "j" || e.key === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        moveCursor(e.key === "j" || e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" && selected.value) {
        // Enter belongs to the focused control, even when a module remains
        // selected. Inspect the composed path for controls containing an icon
        // or living in a nested shadow root before claiming row expansion.
        if (path.slice(0, path.indexOf(panelEl!)).some(isActivationControl)) {
          return;
        }
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

    // Capture, so the page cannot swallow the hotkey before we see it. Seeing
    // a key first is not a claim on it: every branch above either belongs to
    // the panel or leaves the event untouched for the page to handle.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [props.hotkey]);
}

function isActivationControl(target: EventTarget): boolean {
  const el = target as Element;
  return (
    el.tagName === "BUTTON" ||
    el.tagName === "SUMMARY" ||
    (el.tagName === "A" && el.hasAttribute("href")) ||
    ["button", "link", "tab", "menuitem", "checkbox", "radio", "switch"].includes(
      el.getAttribute?.("role") ?? ""
    )
  );
}

/**
 * Is this element somewhere a keystroke turns into text or a caret move?
 *
 * TEXTAREA and contenteditable are the two that get forgotten, and forgetting
 * them is what let the panel eat `j` out of a page's comment box. `isContentEditable`
 * is inherited, so it answers for a node deep inside an editable region too.
 */
function isEditable(el: Element | null | undefined): boolean {
  if (!el) {
    return false;
  }
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

/**
 * The focused element, following shadow roots down.
 *
 * `document.activeElement` stops at the first host -- on a page whose own
 * widgets are custom elements it reports the widget, not the field inside it,
 * and every such field would look like fair game to steal focus from.
 */
function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
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
