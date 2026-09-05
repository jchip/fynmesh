/**
 * The stylesheet, as one string adopted into the shadow root.
 *
 * Inline rather than a separate file because the standalone build has to be a
 * single droppable script -- a second asset to deploy would defeat the point.
 *
 * **Every size derives from `--scale`.** A devtools panel is read for long
 * stretches on whatever monitor happens to be there, so "as dense as it can
 * be" is the wrong target -- density that costs legibility costs more than it
 * saves. The default sits at a comfortable 13px for ids and a 28px row, and
 * the density control multiplies the whole system rather than adjusting one
 * font, so proportions hold at every setting.
 *
 * What density still means here:
 *
 *   - no per-row card, no shadow, hairline separators
 *   - hierarchy from weight and colour, never from whitespace
 *   - tabular numerals so numeric columns line up
 *   - long ids middle-truncated, never wrapped
 *
 * Everything is scoped by the shadow root, so selectors stay short and the
 * page cannot reach in (nor these reach out).
 */

import { ROW_H_BASE, SCALE } from "./metrics.js";

export const STYLES = `
:host {
  --scale: ${SCALE.normal};

  /* type scale -- one multiplier, so the proportions survive any density */
  --fs-id: calc(var(--scale) * 13.5px);    /* module ids, urls, values */
  --fs-ui: calc(var(--scale) * 13px);  /* labels, tabs, buttons */
  --fs-sm: calc(var(--scale) * 12px);  /* chips, secondary text */
  --fs-xs: calc(var(--scale) * 11px);  /* column headers, field names */

  --row-h: calc(var(--scale) * ${ROW_H_BASE}px);
  --h-header: calc(var(--scale) * 40px);
  --h-tab: calc(var(--scale) * 27px);
  --h-chip: calc(var(--scale) * 20px);
  --h-input: calc(var(--scale) * 28px);
  --pad-x: calc(var(--scale) * 12px);
  --gap-col: calc(var(--scale) * 9px);
  /* the two glyph columns; the header renders spacers of the same width so
     its labels sit over the data they name (see COLUMNS in views/modules) */
  --w-stage: calc(var(--scale) * 10px);
  --w-kind: calc(var(--scale) * 13px);

  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

  --bg: #ffffff;
  --bg-alt: #f7f8fa;
  --bg-sunken: #eceff3;
  --bg-hover: rgba(37, 99, 235, 0.06);
  --bg-sel: rgba(37, 99, 235, 0.11);
  --border: #e3e6ec;
  --border-strong: #c9cfd9;
  --fg-strong: #12161d;
  --fg: #333c49;
  --fg-dim: #626c7b;
  --fg-faint: #7f8a99;
  --accent: #2563eb;
  --ok: #12905a;
  --warn: #a24a05;
  --err: #cf3329;
  --chip: rgba(18, 22, 29, 0.06);
  --shadow: 0 8px 28px rgba(16, 22, 34, 0.18);

  all: initial;
  font-family: var(--sans);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
}

:host([data-density="compact"]) { --scale: ${SCALE.compact}; }
:host([data-density="relaxed"]) { --scale: ${SCALE.relaxed}; }

:host([data-theme="dark"]) { color-scheme: dark; }

@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) {
    color-scheme: dark;
    --bg: #14171c;
    --bg-alt: #191d24;
    --bg-sunken: #0e1115;
    --bg-hover: rgba(107, 164, 255, 0.09);
    --bg-sel: rgba(107, 164, 255, 0.16);
    --border: #262c35;
    --border-strong: #3a424e;
    --fg-strong: #f0f3f7;
    --fg: #c8d0da;
    --fg-dim: #949dab;
    --fg-faint: #7e8896;
    --accent: #6ba4ff;
    --ok: #3ecf8e;
    --warn: #eab308;
    --err: #ff7b7b;
    --chip: rgba(255, 255, 255, 0.08);
    --shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  }
}

:host([data-theme="dark"]) {
  --bg: #14171c;
  --bg-alt: #191d24;
  --bg-sunken: #0e1115;
  --bg-hover: rgba(107, 164, 255, 0.09);
  --bg-sel: rgba(107, 164, 255, 0.16);
  --border: #262c35;
  --border-strong: #3a424e;
  --fg-strong: #f0f3f7;
  --fg: #c8d0da;
  --fg-dim: #949dab;
  --fg-faint: #7e8896;
  --accent: #6ba4ff;
  --ok: #3ecf8e;
  --warn: #eab308;
  --err: #ff7b7b;
  --chip: rgba(255, 255, 255, 0.08);
  --shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}

* { box-sizing: border-box; }

button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}
button:focus-visible,
input:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ---------------------------------------------------------------- launcher */

.launcher {
  position: fixed;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 7px;
  height: calc(var(--scale) * 30px);
  padding: 0 10px 0 9px;
  border: 1px solid var(--border-strong);
  border-radius: calc(var(--scale) * 15px);
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow);
  font: 500 var(--fs-ui)/1 var(--sans);
  user-select: none;
  transition: opacity 0.12s ease;
  opacity: 0.86;
}
.launcher:hover { opacity: 1; }
.launcher.bottom-right { right: 14px; bottom: 14px; }
.launcher.bottom-left  { left: 14px;  bottom: 14px; }
.launcher.top-right    { right: 14px; top: 14px; }
.launcher.top-left     { left: 14px;  top: 14px; }

.launcher .glyph {
  width: calc(var(--scale) * 15px);
  height: calc(var(--scale) * 15px);
  color: var(--accent);
  flex: none;
}
.launcher .count { font-variant-numeric: tabular-nums; color: var(--fg-dim); }
.launcher .badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(var(--scale) * 17px);
  height: calc(var(--scale) * 17px);
  padding: 0 5px;
  border-radius: calc(var(--scale) * 9px);
  font: 600 var(--fs-sm)/1 var(--sans);
  font-variant-numeric: tabular-nums;
  color: #fff;
}
.launcher .badge.err { background: var(--err); }
.launcher .badge.warn { background: var(--warn); color: #fff; }

/* ----------------------------------------------------------------- overlay */

/*
 * Opening and closing are movements, not cuts.
 *
 * Each dock enters from the edge it belongs to -- the right dock from the
 * right, the bottom dock from below, a floating panel up from where the badge
 * was -- so the panel appears to come from somewhere rather than being
 * switched on. Short, because this sits in front of a page someone is working
 * on: 140ms in, 120ms out, and the out has to match EXIT_MS in ui/App.
 *
 * Translate and opacity only, deliberately: a scale would make every
 * getBoundingClientRect inside the panel report scaled numbers, and the
 * virtual table measures row heights that way and caches them. A panel that
 * animated its scale would remember the wrong row heights.
 */
@keyframes fi-in-right { from { opacity: 0; transform: translateX(20px); } }
@keyframes fi-in-bottom { from { opacity: 0; transform: translateY(20px); } }
@keyframes fi-in-float { from { opacity: 0; transform: translateY(10px); } }
@keyframes fi-out-right { to { opacity: 0; transform: translateX(20px); } }
@keyframes fi-out-bottom { to { opacity: 0; transform: translateY(20px); } }
@keyframes fi-out-float { to { opacity: 0; transform: translateY(10px); } }

.overlay.opening { animation: fi-in-float 0.14s cubic-bezier(0.2, 0, 0, 1); }
.overlay.dock-right.opening { animation-name: fi-in-right; }
.overlay.dock-bottom.opening { animation-name: fi-in-bottom; }

.overlay.closing {
  animation: fi-out-float 0.12s ease-in forwards;
  /* on its way out it is scenery: clicks belong to the page again */
  pointer-events: none;
}
.overlay.dock-right.closing { animation-name: fi-out-right; }
.overlay.dock-bottom.closing { animation-name: fi-out-bottom; }

@media (prefers-reduced-motion: reduce) {
  .overlay.opening,
  .overlay.closing {
    animation: none;
  }
  .overlay.closing { opacity: 0; }
}

.overlay {
  position: fixed;
  z-index: 2147483645;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow);
  overflow: hidden;
  container-type: inline-size;
}
.overlay.dock-right  { top: 0; right: 0; bottom: 0; border-width: 0 0 0 1px; }
.overlay.dock-bottom { left: 0; right: 0; bottom: 0; border-width: 1px 0 0; }
.overlay.full        { inset: 12px; border-radius: 6px; }
.overlay.float       { border-radius: 6px; }

/*
 * Resize handles.
 *
 * Every dock mode is resizable on whatever edges it actually owns: a
 * right-docked panel spans the full height so only its left edge can move, a
 * bottom-docked one only its top edge, and a floating panel all four plus the
 * corners. They are 6px hit targets sitting just inside the border, and the
 * corners are 12px so they are catchable without precision aiming.
 */
.rz { position: absolute; z-index: 4; background: transparent; touch-action: none; }
.rz:hover,
.rz.dragging { background: var(--accent); opacity: 0.35; }
.rz.n { top: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
.rz.s { bottom: 0; left: 0; right: 0; height: 6px; cursor: ns-resize; }
.rz.w { left: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.rz.e { right: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.rz.nw, .rz.ne, .rz.sw, .rz.se {
  width: 14px;
  height: 14px;
  z-index: 5;
  border-radius: 3px;
}
.rz.nw { top: 0; left: 0; cursor: nwse-resize; }
.rz.ne { top: 0; right: 0; cursor: nesw-resize; }
.rz.sw { bottom: 0; left: 0; cursor: nesw-resize; }
.rz.se { bottom: 0; right: 0; cursor: nwse-resize; }

/* the header doubles as the drag handle when the panel is floating */
.overlay.float .header { cursor: grab; }
.overlay.float .header.grabbing { cursor: grabbing; }
.overlay.float .header button,
.overlay.float .header input { cursor: default; }

/* ------------------------------------------------------------------ header */

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--h-header);
  padding: 0 6px 0 var(--pad-x);
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
  flex: none;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  font: 600 var(--fs-ui)/1 var(--sans);
  color: var(--fg-strong);
  flex: none;
}
.title .glyph {
  width: calc(var(--scale) * 14px);
  height: calc(var(--scale) * 14px);
  color: var(--accent);
}

/*
 * Tabs shrink, actions do not. At a narrow dock width the action group used to
 * be pushed off the panel entirely -- including Close, which left no way to
 * dismiss the overlay with the mouse.
 */
.tabs {
  display: flex;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar { display: none; }
/*
 * A tab strip with tabs off the end says so.
 *
 * There is no scrollbar (a horizontal bar across a 26px strip is worse than
 * the thing it solves), so a scrolled-away tab was simply invisible -- and the
 * history arrows sitting next to the strip read as its scroll controls. The
 * fades are set from JS (useTabScroll) because whether it overflows depends on
 * the panel width, the text size and the live counts together.
 */
.tabs.more-l { mask-image: linear-gradient(to right, transparent, #000 16px); }
.tabs.more-r { mask-image: linear-gradient(to left, transparent, #000 16px); }
.tabs.more-l.more-r {
  mask-image: linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 16px), transparent);
}
.actions { display: flex; align-items: center; gap: 1px; flex: none; }
.tab {
  padding: 0 9px;
  height: var(--h-tab);
  border-radius: 3px;
  font: 500 var(--fs-ui)/var(--h-tab) var(--sans);
  color: var(--fg-dim);
  white-space: nowrap;
}
.tab:hover { background: var(--chip); color: var(--fg); }
.tab[aria-selected="true"] {
  background: var(--bg);
  color: var(--fg-strong);
  box-shadow: inset 0 0 0 1px var(--border-strong);
}
.tab .n {
  margin-left: 5px;
  font-variant-numeric: tabular-nums;
  color: var(--fg-faint);
}
.tab[aria-selected="true"] .n { color: var(--fg-dim); }
.tab .n.err { color: var(--err); font-weight: 700; }
.tab .n.warn { color: var(--warn); font-weight: 700; }

.spacer { flex: 1 1 auto; min-width: 8px; }

.meta {
  font: 400 var(--fs-sm)/1 var(--sans);
  color: var(--fg-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--scale) * 26px);
  height: calc(var(--scale) * 26px);
  border-radius: 3px;
  color: var(--fg-dim);
  flex: none;
}
.iconbtn:hover { background: var(--chip); color: var(--fg-strong); }
.iconbtn[aria-pressed="true"] { color: var(--accent); background: var(--bg-sel); }
.iconbtn svg { width: calc(var(--scale) * 15px); height: calc(var(--scale) * 15px); }
/*
 * The copy button is the one control whose effect is entirely off-screen, so
 * it acknowledges itself: the outcome colour snaps on at click time and then
 * fades back over ~0.6s once the class comes off, which reads as "done" the
 * way an instant revert does not.
 */
.copybtn { transition: color 0.6s ease 0.2s, background 0.6s ease 0.2s; }
.copybtn.flash { transition: none; }
.copybtn.flash.ok { color: var(--ok); background: var(--chip); }
.copybtn.flash.fail { color: var(--err); background: var(--chip); }
@media (prefers-reduced-motion: reduce) {
  .copybtn { transition: none; }
}

.iconbtn.text {
  width: auto;
  padding: 0 7px;
  font: 600 var(--fs-sm)/1 var(--sans);
}

/* -------------------------------------------------------------- filter bar */

.filterbar {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: calc(var(--scale) * 38px);
  padding: calc(var(--scale) * 5px) var(--pad-x);
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex: none;
  flex-wrap: wrap;
}

.search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: var(--h-input);
  padding: 0 8px;
  min-width: 210px;
  flex: 1 1 210px;
  max-width: 420px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--bg-alt);
}
.search:focus-within { border-color: var(--accent); }
.search svg {
  width: calc(var(--scale) * 13px);
  height: calc(var(--scale) * 13px);
  color: var(--fg-faint);
  flex: none;
}
.search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font: 400 var(--fs-id)/1 var(--mono);
  color: var(--fg-strong);
}
.search input::placeholder { color: var(--fg-faint); }
.search .clear { color: var(--fg-faint); font-size: var(--fs-ui); line-height: 1; }
.search .clear:hover { color: var(--fg-strong); }

.facets { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.facet {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: calc(var(--scale) * 23px);
  padding: 0 9px;
  border-radius: 3px;
  background: var(--chip);
  font: 500 var(--fs-sm)/1 var(--sans);
  color: var(--fg-dim);
  white-space: nowrap;
}
.facet:hover { color: var(--fg-strong); }
.facet[aria-pressed="true"] { background: var(--bg-sel); color: var(--accent); }
.facet .n { font-variant-numeric: tabular-nums; opacity: 0.75; }
/*
 * A facet that would change nothing -- a graph depth reaching no further than
 * the one below it. Left in the row rather than hidden, because the reader is
 * entitled to see that the setting exists and that it is spent, and its title
 * says which depth already reached those nodes.
 */
.facet:disabled { opacity: 0.4; cursor: default; }
.facet:disabled:hover { color: var(--fg-dim); }

.selectish {
  height: calc(var(--scale) * 24px);
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-alt);
  color: var(--fg-dim);
  font: 500 var(--fs-sm)/1 var(--sans);
}
.selectish:hover { color: var(--fg-strong); border-color: var(--border-strong); }
.grouplabel { font: 400 var(--fs-sm)/1 var(--sans); color: var(--fg-faint); }

/* ------------------------------------------------------------------- table */

.body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }

.scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.thead {
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 3;
  height: calc(var(--scale) * 27px);
  padding: 0 var(--pad-x);
  gap: var(--gap-col);
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
  font: 600 var(--fs-xs)/1 var(--sans);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fg-dim);
  user-select: none;
}
/*
 * A sortable header label is a <button>, and the UA stylesheet gives buttons
 * 'text-transform: none' -- so the uppercasing on .thead reached the plain
 * cells and skipped the sortable ones, and the strip read "SOURCE" beside
 * "module container dep". Only the sortable cells get the pointer, too: the
 * other three offered a hand cursor over nothing clickable.
 */
.thead .col { text-transform: inherit; }
.thead button.col { cursor: pointer; }
.thead button.col:hover { color: var(--fg-strong); }
.thead .col.sorted { color: var(--accent); }

.rows { position: relative; }

.row {
  display: flex;
  align-items: center;
  height: var(--row-h);
  padding: 0 var(--pad-x);
  gap: var(--gap-col);
  border-bottom: 1px solid var(--border);
  font: 400 var(--fs-id)/1 var(--mono);
  color: var(--fg);
  cursor: default;
  white-space: nowrap;
}
.row:hover { background: var(--bg-hover); }
.row[aria-selected="true"] { background: var(--bg-sel); }
.row.cursor { box-shadow: inset 2px 0 0 var(--accent); }

.col {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  /* a cell clips its own content: a chip wider than its column used to spill
     into the numeric columns and sit under the digits */
  overflow: hidden;
}
.col.num {
  justify-content: flex-end;
  font-variant-numeric: tabular-nums;
  color: var(--fg-dim);
  flex: none;
}
.col.grow { flex: 1 1 auto; }

/*
 * The module cell gives way in a strict order: prefix, then filename, then
 * chips.
 *
 * Not by shrink factors. Flexbox spreads a deficit across every shrinkable
 * item in proportion to factor x base width, so *some* of it always lands on
 * the items that should have gone last -- with a 50:1 ratio the filename still
 * lost 1.8px, which is exactly the ".js" off the end of it. An order needs
 * items that cannot shrink at all.
 *
 * So the filename and the chips are 'flex-shrink: 0' and bounded by
 * 'max-width: 100%'. They hold their full width while anything else has width
 * to give, and ellipsize only once they are wider than the box that contains
 * them -- which is to say, only when they are all that is left. The prefix,
 * the one thing that is repeated on every row, absorbs everything before that.
 *
 * ('.tail' was once 'flex: none' with no bound, which is the failure this is
 * carefully not: it could not shrink, could not clip, and was painted 134px
 * over the share-key chip beside it.)
 */
.id {
  display: flex;
  align-items: baseline;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
}
/*
 * The prefix is truncated in JS, not by CSS.
 *
 * 'direction: rtl' + ellipsis looked like a neat way to drop the *front* of a
 * path, but it is a bidi reorder: a lead ending in "/" had the slash moved to
 * the visual start, so every row read "…:///localhost:3000/fynapp-1/dist" with
 * the separator gone from between the directory and the filename. See
 * leadFor() in views/modules.
 */
.id .lead {
  color: var(--fg-dim);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.id .tail {
  color: var(--fg-strong);
  flex: 0 0 auto;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url {
  color: var(--fg-dim);
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.errtext { color: var(--err); overflow: hidden; text-overflow: ellipsis; }
.stagetext { color: var(--fg-dim); font: 400 var(--fs-sm)/1 var(--sans); }

/* stage indicator: shape + colour, never colour alone */
.stage {
  width: calc(var(--scale) * 9px);
  height: calc(var(--scale) * 9px);
  flex: none;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px currentColor;
}
.stage.executed { background: currentColor; color: var(--ok); }
.stage.linked,
.stage.instantiated { color: var(--accent); }
.stage.instantiating,
.stage.executing { color: var(--accent); animation: pulse 1.1s ease-in-out infinite; }
.stage.awaiting-deps { color: var(--warn); }
.stage.registered { color: var(--fg-faint); border-radius: 2px; }
.stage.errored {
  color: var(--err);
  background: currentColor;
  border-radius: 2px;
  transform: rotate(45deg);
}
@keyframes pulse { 50% { opacity: 0.32; } }

.kind {
  flex: none;
  width: calc(var(--scale) * 13px);
  text-align: center;
  font: 400 var(--fs-sm)/1 var(--sans);
  color: var(--fg-faint);
}

/*
 * 'text-overflow' does not reach a flex container's children, so the chip is a
 * flex box for layout and every piece of text inside it is a '.chiptext' that
 * does its own ellipsis. Without this a long container name was cut mid-glyph
 * with no ellipsis at all.
 */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: var(--h-chip);
  max-width: 100%;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--chip);
  font: 500 var(--fs-sm)/1 var(--sans);
  color: var(--fg-dim);
  overflow: hidden;
  white-space: nowrap;
  /* holds its width until it is the last thing in the cell; see .id above */
  flex: 0 0 auto;
  min-width: 0;
}
.chip .chiptext {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.chip .chipver { flex: none; opacity: 0.75; }
.chip.container {
  background: color-mix(in srgb, hsl(var(--hue) 65% 50%) 16%, transparent);
  color: color-mix(in srgb, hsl(var(--hue) 70% 34%) 92%, var(--fg));
}
/* the container tint has to lift in dark mode or it reads as grey */
:host([data-theme="dark"]) .chip.container {
  color: color-mix(in srgb, hsl(var(--hue) 70% 74%) 92%, var(--fg));
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) .chip.container {
    color: color-mix(in srgb, hsl(var(--hue) 70% 74%) 92%, var(--fg));
  }
}
.chip.ver { font-variant-numeric: tabular-nums; }
.chip.ok  { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
.chip.warn{ background: color-mix(in srgb, var(--warn) 18%, transparent); color: var(--warn); }
.chip.err { background: color-mix(in srgb, var(--err) 15%, transparent); color: var(--err); }
.chip.accent { background: var(--bg-sel); color: var(--accent); }
.chip.mark { padding: 0 4px; font-weight: 700; }

.sgl {
  flex: none;
  font: 700 var(--fs-xs)/1 var(--sans);
  color: var(--accent);
  border: 1px solid currentColor;
  border-radius: 2px;
  padding: 2px 3px;
}

/* --------------------------------------------------------------- expansion */

.detail {
  padding: calc(var(--scale) * 10px) calc(var(--scale) * 12px) calc(var(--scale) * 12px)
    calc(var(--scale) * 30px);
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
  font: 400 var(--fs-ui)/1.55 var(--sans);
  color: var(--fg);
}
.detail dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 16px;
  margin: 0 0 10px;
}
.detail dt {
  font: 600 var(--fs-xs)/calc(var(--scale) * 21px) var(--sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-dim);
  white-space: nowrap;
}
.detail dd {
  margin: 0;
  min-width: 0;
  font: 400 var(--fs-ui)/calc(var(--scale) * 21px) var(--mono);
  color: var(--fg-strong);
  overflow-wrap: anywhere;
}
.detail dd.dim { color: var(--fg-dim); }
.detail h4 {
  margin: 10px 0 4px;
  font: 600 var(--fs-xs)/1 var(--sans);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-dim);
}
.detail pre {
  margin: 5px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg);
  font: 400 var(--fs-sm)/1.5 var(--mono);
  color: var(--err);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 200px;
  overflow: auto;
}
.linklist { display: flex; flex-wrap: wrap; gap: 5px; }
.link {
  font: 400 var(--fs-sm)/calc(var(--scale) * 20px) var(--mono);
  color: var(--accent);
  padding: 0 5px;
  border-radius: 2px;
  background: var(--chip);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* .link is worn by buttons, spans and now an <a>; the anchor's UA underline
   would make one of them look different from the rest for no reason */
.link { text-decoration: none; }
.link:hover { background: var(--bg-sel); }
a.link:hover { text-decoration: underline; }
.link.missing { color: var(--err); text-decoration: line-through; }
.link.plain { color: var(--fg-dim); cursor: default; }

/* ----------------------------------------------------------- generic lists */

.section { border-bottom: 1px solid var(--border); }
.section > .head {
  display: flex;
  align-items: center;
  gap: 7px;
  height: calc(var(--scale) * 34px);
  padding: 0 var(--pad-x);
  background: var(--bg-alt);
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--border);
  font: 600 var(--fs-ui)/1 var(--sans);
  color: var(--fg-strong);
}
.section > .head .sub {
  font: 400 var(--fs-sm)/1 var(--sans);
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree { font: 400 var(--fs-id)/1 var(--mono); }
.tree .node {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: var(--row-h);
  padding: 0 var(--pad-x);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
/*
 * A tree row clips itself.
 *
 * The rows are nowrap flex lines of chips and links, and at a narrow panel
 * width they simply ran past the right edge of the panel -- 62px of row, with
 * the entry link mostly outside it, unreachable and unreadable. Clipping the
 * row and letting its links ellipsize keeps every row inside the panel.
 */
.tree .node { overflow: hidden; }
.tree .node > .link { min-width: 0; flex: 0 1 auto; }
.tree .node > .faint,
.tree .node > .muted { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* marks and badges are single glyphs: clipping one destroys it, so they hold
   their size and the text beside them gives way instead */
.tree .node > .chip.mark,
.tree .node > .sgl,
.tree .node > .stage { flex: none; }
.tree .node:hover { background: var(--bg-hover); }
.tree .node.l1 { padding-left: calc(var(--pad-x) + var(--scale) * 12px); }
.tree .node.l2 { padding-left: calc(var(--pad-x) + var(--scale) * 30px); }
.tree .node.l3 {
  padding-left: calc(var(--pad-x) + var(--scale) * 48px);
  background: var(--bg-alt);
}
.tree .label {
  color: var(--fg-strong);
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree .label.ver { font-variant-numeric: tabular-nums; }
.tree .muted { color: var(--fg-dim); font: 400 var(--fs-sm)/1 var(--sans); }
.tree .faint { color: var(--fg-dim); font: 400 var(--fs-sm)/1 var(--sans); }
.tree .mono { font-family: var(--mono); }
.tree .wrapline {
  white-space: normal;
  align-items: flex-start;
  padding-top: calc(var(--scale) * 6px);
  padding-bottom: calc(var(--scale) * 6px);
  line-height: 1.6;
}
.tree .rowlabel {
  width: calc(var(--scale) * 82px);
  flex: none;
  padding-top: 2px;
}
.tree .inline {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

.twisty {
  width: calc(var(--scale) * 13px);
  flex: none;
  color: var(--fg-faint);
  font-size: var(--fs-xs);
  text-align: center;
  transition: transform 0.1s ease;
}
.twisty.open { transform: rotate(90deg); }

/* ------------------------------------------------------------------ issues */

.issue {
  display: flex;
  gap: 10px;
  padding: calc(var(--scale) * 11px) var(--pad-x);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.issue:hover { background: var(--bg-hover); }
.issue .sev {
  flex: none;
  width: calc(var(--scale) * 17px);
  height: calc(var(--scale) * 17px);
  margin-top: 1px;
  border-radius: 3px;
  display: grid;
  place-items: center;
  font: 700 var(--fs-sm)/1 var(--sans);
  color: #fff;
}
.issue .sev.error { background: var(--err); }
.issue .sev.warn { background: var(--warn); }
.issue .sev.info { background: var(--fg-faint); }
.issue .txt { min-width: 0; }
.issue .t {
  display: block;
  font: 600 var(--fs-id)/1.4 var(--sans);
  color: var(--fg-strong);
  overflow-wrap: anywhere;
}
.issue .d {
  display: block;
  margin-top: 3px;
  font: 400 var(--fs-ui)/1.55 var(--sans);
  color: var(--fg-dim);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.issue .code {
  font: 400 var(--fs-xs)/1 var(--mono);
  color: var(--fg-faint);
  margin-left: 7px;
}

/* -------------------------------------------------------------- json / raw */

.json { padding: 8px var(--pad-x); font: 400 var(--fs-ui)/1.6 var(--mono); }
.json .k { color: var(--accent); }
.json .s { color: var(--ok); }
.json .n { color: var(--warn); }
.json .b { color: var(--err); }
.json .line { display: flex; gap: 5px; white-space: pre-wrap; overflow-wrap: anywhere; }
.json .toggle { color: var(--fg-faint); cursor: pointer; user-select: none; }
.json .count { color: var(--fg-faint); }

/* ------------------------------------------------------------------- graph */

/*
 * Drag anywhere to pan; ctrl/cmd + wheel to zoom. The grab cursor is what says
 * so -- there is no other affordance on a canvas, and a graph three screens
 * wide with only scrollbars reads as broken.
 */
.graphwrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  cursor: grab;
  overscroll-behavior: contain;
}
.graphwrap.panning { cursor: grabbing; user-select: none; }
.graphwrap svg { display: block; }
.gnode { cursor: pointer; }
/* mid-pan the pointer belongs to the canvas, not to whatever is under it */
.graphwrap.panning .gnode { cursor: grabbing; }
.gnode rect { stroke-width: 1; }
.gnode text {
  font: 400 calc(var(--scale) * 11px)/1 var(--mono);
  fill: var(--fg-strong);
  pointer-events: none;
}
.gnode text.sub { fill: var(--fg-dim); font-size: calc(var(--scale) * 9.5px); }
.gedge { fill: none; stroke: var(--border-strong); stroke-width: 1; }
.gedge.hot { stroke: var(--accent); stroke-width: 1.5; }
.gedge.cycle { stroke: var(--err); stroke-width: 1.5; }
.gnode.dimmed { opacity: 0.25; }
/*
 * The hovered node's edges, and everything else.
 *
 * Emphasis only, with no colour of its own: an edge that is red for being in a
 * cycle stays red while it is pointed at, and the accent goes on meaning
 * "touches the focus" and nothing else. Ordered after .hot and .cycle because
 * these carry the same specificity and have to win the width.
 *
 * 0.18 is where a 1px hairline stops competing without disappearing. The graph
 * has to keep its shape while one part of it is being read, or the highlight
 * answers "what connects to this" by deleting the context that made the
 * question worth asking. Opacity on the path fades its arrowhead with it,
 * which is why this tone needs no marker of its own.
 */
.gedge.lit { stroke-width: 2; }
.gedge.faded { opacity: 0.18; }

/* ------------------------------------------------------------------ banner */

.banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: calc(var(--scale) * 8px) var(--pad-x);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--warn) 10%, var(--bg));
  font: 400 var(--fs-ui)/1.55 var(--sans);
  color: var(--fg);
  flex: none;
}
.banner .sev { color: var(--warn); font-weight: 700; flex: none; }
.banner ul { margin: 2px 0 0; padding-left: 16px; }

.empty {
  padding: 34px 20px;
  text-align: center;
  color: var(--fg-dim);
  font: 400 var(--fs-id)/1.7 var(--sans);
}
.empty code {
  font: 400 var(--fs-ui)/1 var(--mono);
  color: var(--fg-strong);
  background: var(--chip);
  padding: 2px 5px;
  border-radius: 2px;
}

/* ------------------------------------------------------ narrow-panel rules */

/*
 * Three pixels short of the round numbers on purpose.
 *
 * The query is measured against the container's *content* box and .overlay has
 * a 1px border, and 'max-width' is inclusive -- so a 560px query was
 * still hiding things at an outer panel width of 562. The names are the outer
 * widths they are meant to describe.
 */
@container (max-width: 897px) { .hide-md { display: none !important; } }
@container (max-width: 697px) {
  .hide-sm { display: none !important; }
  /* buy back ~130px of strip before falling back to scrolling it */
  .tab { padding: 0 6px; }
  .tab .n { display: none; }
}
@container (max-width: 557px) {
  .hide-xs { display: none !important; }
  .search { max-width: none; }
}
`;
