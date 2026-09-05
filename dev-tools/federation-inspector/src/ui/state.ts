/**
 * UI state, as signals.
 *
 * One store rather than component-local state, because the views are
 * cross-linked: clicking a share key in Shares and switching to Graph has to
 * keep the same thing focused, and an Issue row deep-links by writing the
 * query and the view at once. Signals make that a plain assignment instead of
 * a callback chain through five components.
 *
 * `query` is the single source of filter truth -- facet chips, deep links and
 * what a person types all go through the same string, so the filter state is
 * always copy-pasteable and always reproducible.
 */

import { signal, computed, type Signal } from "@preact/signals";
import type { Snapshot, ViewName } from "../core/model.js";
import { emptySnapshot } from "../core/model.js";
import { analyse, type Analysis } from "../analysis/index.js";
import { filterModules } from "../analysis/search.js";
import type { Density } from "./metrics.js";

export type Dock = "dock-right" | "dock-bottom" | "float" | "full";

/** Position and size of the panel in "float" mode, in CSS pixels. */
export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Theme = "auto" | "light" | "dark";
export type GroupBy = "none" | "container" | "scope" | "kind" | "bundle";
export type SortBy = "seq" | "id" | "deps" | "dependents" | "stage" | "container";

const STORE_KEY = "federation-inspector:ui";

interface Persisted {
  dock?: Dock;
  theme?: Theme;
  size?: number;
  density?: Density;
  float?: FloatRect;
}

function load(): Persisted {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    // a page with storage disabled, or a sandboxed iframe. Defaults are fine;
    // losing a remembered panel width is not worth a try/catch at each read.
    return {};
  }
}

const saved = load();

export const open = signal(false);
export const view = signal<ViewName>("modules");
export const query = signal("");
export const selected = signal<string | undefined>(undefined);
export const expanded = signal<Set<string>>(new Set());
export const dock = signal<Dock>(saved.dock ?? "dock-right");
export const theme = signal<Theme>(saved.theme ?? "auto");
/** type + spacing scale; see ui/metrics.ts */
export const density = signal<Density>(saved.density ?? "normal");
/** panel width when docked right, height when docked bottom */
export const size = signal<number>(saved.size ?? 760);

/**
 * The floating panel's rect.
 *
 * Defaulted lazily against the viewport rather than to a constant, so the
 * first float on a small laptop does not open a window larger than the screen.
 */
export const floatRect = signal<FloatRect>(
  saved.float ?? defaultFloatRect()
);

function defaultFloatRect(): FloatRect {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.min(980, Math.round(vw * 0.72));
  const h = Math.min(680, Math.round(vh * 0.74));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}
export const live = signal(true);
export const groupBy = signal<GroupBy>("none");
export const sortBy = signal<SortBy>("seq");
export const sortDesc = signal(false);
/** graph focus depth */
export const graphHops = signal(2);

export const snapshot: Signal<Snapshot> = signal(emptySnapshot());
export const analysis: Signal<Analysis> = signal(analyse(snapshot.value));

/** modules matching the current query, before grouping */
export const visibleModules = computed(() =>
  filterModules(snapshot.value.modules, query.value)
);

/** how many modules arrived since the panel was opened */
export const openedWithCount = signal(0);
export const newSinceOpen = computed(() =>
  Math.max(0, snapshot.value.modules.length - openedWithCount.value)
);

export function setSnapshot(next: Snapshot): void {
  snapshot.value = next;
  analysis.value = analyse(next);
}

export function persist(): void {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        dock: dock.value,
        theme: theme.value,
        size: size.value,
        density: density.value,
        float: floatRect.value,
      })
    );
  } catch {
    // storage unavailable; the panel simply forgets between reloads
  }
}

/**
 * An in-panel history stack.
 *
 * Drilling from a module into one of its dependencies, three levels down, is
 * the normal way this tool gets used, and without a way back it is a dead end.
 * Bounded, because this is a debugging aid and not a browser.
 */
interface HistoryEntry {
  view: ViewName;
  query: string;
  selected?: string;
}

const back: HistoryEntry[] = [];
const forward: HistoryEntry[] = [];

export const canGoBack = signal(false);
export const canGoForward = signal(false);

function sync(): void {
  canGoBack.value = back.length > 0;
  canGoForward.value = forward.length > 0;
}

function here(): HistoryEntry {
  return { view: view.value, query: query.value, selected: selected.value };
}

function restore(entry: HistoryEntry): void {
  view.value = entry.view;
  query.value = entry.query;
  selected.value = entry.selected;
}

/** Navigate: set the view, and optionally the query and selection at once. */
export function focusOn(nextView: ViewName, nextQuery?: string, select?: string): void {
  back.push(here());
  if (back.length > 50) {
    back.shift();
  }
  forward.length = 0;

  view.value = nextView;
  if (nextQuery !== undefined) {
    query.value = nextQuery;
  }
  if (select !== undefined) {
    selected.value = select;
    const set = new Set(expanded.value);
    set.add(select);
    expanded.value = set;
  }
  sync();
}

export function goBack(): void {
  const entry = back.pop();
  if (!entry) {
    return;
  }
  forward.push(here());
  restore(entry);
  sync();
}

export function goForward(): void {
  const entry = forward.pop();
  if (!entry) {
    return;
  }
  back.push(here());
  restore(entry);
  sync();
}

export function toggleExpanded(id: string): void {
  const set = new Set(expanded.value);
  if (set.has(id)) {
    set.delete(id);
  } else {
    set.add(id);
  }
  expanded.value = set;
}
