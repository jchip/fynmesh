/**
 * Resizing and dragging the panel.
 *
 * Pointer capture rather than window listeners, because the pointer leaves the
 * 6px handle on the first millimetre of every drag -- it moves onto the page
 * underneath, which is a different document subtree entirely. Capture keeps
 * the events coming to the handle regardless.
 *
 * Each dock mode is resizable only on the edges it actually owns. A
 * right-docked panel spans the full viewport height, so dragging its top edge
 * would mean nothing; a floating panel owns all four edges and both axes.
 */

import type { JSX } from "preact";
import { useRef } from "preact/hooks";
import { dock, floatRect, persist, size, viewport, type FloatRect } from "../state.js";

export type Edge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_W = 360;
const MIN_H = 240;

/*
 * A dock never covers the whole page.
 *
 * The point of the tool is to watch the app while poking at it, so a dock that
 * can reach 100% is a dock that can hide the thing being inspected -- and a
 * full-width right dock puts its only resize handle off screen, leaving no way
 * to shrink it back.
 */
const DOCK_MAX = 0.9;

/*
 * `documentElement.client*`, not `window.inner*`: the latter counts the
 * classic scrollbar gutter, so on a scrolling page every clamp here was ~15px
 * too generous and let the panel settle just past the visible edge.
 */
function viewW(): number {
  return document.documentElement.clientWidth;
}
function viewH(): number {
  return document.documentElement.clientHeight;
}
/*
 * Read through the signal, not the DOM.
 *
 * Every clamp below runs during a render, and reading `viewport` there is what
 * subscribes the panel to window resizes -- measuring the document directly
 * would give the right answer once and never redraw again. The signal is
 * refreshed by reflowFloat on mount and on every resize; the direct
 * measurement is only the fallback for the first paint.
 */
function currentView(): { w: number; h: number } {
  const v = viewport.value;
  return v.w && v.h ? v : { w: viewW(), h: viewH() };
}
/**
 * A comfortable minimum, unless the viewport disagrees.
 *
 * MIN_W/MIN_H are a usability floor: narrower than that the panel is not worth
 * reading. But a floor applied to a viewport smaller than the floor puts the
 * panel's far edge -- and the resize handle on it -- at a negative coordinate,
 * off screen and impossible to grab. On a viewport that small, fitting wins.
 */
function fit(value: number, min: number, view: number): number {
  return Math.min(view, Math.max(min, value));
}

export function maxDockW(): number {
  const vw = currentView().w;
  return fit(Math.round(vw * DOCK_MAX), MIN_W, vw);
}
export function maxDockH(): number {
  const vh = currentView().h;
  return fit(Math.round(vh * DOCK_MAX), MIN_H, vh);
}

/** Handles for the current dock mode. */
export function ResizeHandles(): JSX.Element | null {
  const mode = dock.value;
  if (mode === "full") {
    return null;
  }
  const edges: Edge[] =
    mode === "dock-right"
      ? ["w"]
      : mode === "dock-bottom"
        ? ["n"]
        : ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

  return (
    <>
      {edges.map((edge) => (
        <ResizeHandle key={edge} edge={edge} />
      ))}
    </>
  );
}

export function clampToViewport(rect: FloatRect): FloatRect {
  const { w: vw, h: vh } = currentView();
  const w = fit(rect.w, MIN_W, vw);
  const h = fit(rect.h, MIN_H, vh);
  /*
   * Asymmetric on purpose.
   *
   * Keeping "80px of panel" on screen is not the same as keeping something
   * *draggable* on screen. The header's grab surface is its left portion --
   * title and tabs -- while the right end is packed with buttons that swallow
   * the pointer. A panel pushed off the left kept only that button strip
   * visible and could not be dragged back by any point on it.
   *
   * So the left edge stays put and only the right may leave the viewport,
   * which guarantees the grab surface is always reachable.
   */
  return {
    x: Math.max(0, Math.min(rect.x, vw - 80)),
    y: Math.max(0, Math.min(rect.y, vh - 40)),
    w,
    h,
  };
}

function ResizeHandle({ edge }: { edge: Edge }): JSX.Element {
  const start = useRef({ x: 0, y: 0, size: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });

  return (
    <div
      class={"rz " + edge}
      role="separator"
      aria-orientation={edge === "n" || edge === "s" ? "horizontal" : "vertical"}
      aria-label={"Resize panel (" + edge + ")"}
      onPointerDown={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.setPointerCapture(e.pointerId);
        el.classList.add("dragging");
        start.current = {
          x: e.clientX,
          y: e.clientY,
          size: size.value,
          rect: { ...floatRect.value },
        };
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (!el.hasPointerCapture(e.pointerId)) {
          return;
        }
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;

        // the same cap as reflowFloat: clamping only on a dock switch left the
        // drag itself free to produce the covered-page state it guards against
        // the cap is applied last: on a viewport narrower than MIN_W the cap
        // is the smaller of the two, and a minimum that wins there is a panel
        // whose own resize handle is off screen
        if (dock.value === "dock-right") {
          size.value = fit(start.current.size - dx, MIN_W, maxDockW());
          return;
        }
        if (dock.value === "dock-bottom") {
          size.value = fit(start.current.size - dy, MIN_H, maxDockH());
          return;
        }

        // floating: an edge moves that side, a corner moves both
        const r = start.current.rect;
        const next = { ...r };
        if (edge.includes("w")) {
          // dragging the left edge moves the origin and changes width by the
          // same amount, so the right edge stays put
          const w = Math.max(MIN_W, r.w - dx);
          next.x = r.x + (r.w - w);
          next.w = w;
        }
        if (edge.includes("e")) {
          next.w = Math.max(MIN_W, r.w + dx);
        }
        if (edge.includes("n")) {
          const h = Math.max(MIN_H, r.h - dy);
          next.y = r.y + (r.h - h);
          next.h = h;
        }
        if (edge.includes("s")) {
          next.h = Math.max(MIN_H, r.h + dy);
        }
        floatRect.value = clampToViewport(next);
      }}
      onPointerUp={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.releasePointerCapture(e.pointerId);
        el.classList.remove("dragging");
        persist();
      }}
      onPointerCancel={(e) => {
        (e.currentTarget as HTMLElement).classList.remove("dragging");
      }}
    />
  );
}

/**
 * Drag the floating panel by its header.
 *
 * Returns the props to spread onto the header. Buttons and inputs inside it
 * keep working because the handler ignores a pointerdown whose target is
 * interactive -- otherwise grabbing the panel and clicking a tab would be the
 * same gesture.
 */
export function useHeaderDrag(): JSX.HTMLAttributes<HTMLDivElement> {
  const start = useRef({ x: 0, y: 0, rect: { x: 0, y: 0, w: 0, h: 0 } });

  if (dock.value !== "float") {
    return {};
  }

  return {
    onPointerDown(e) {
      const target = e.target as HTMLElement;
      if (target.closest("button, input, select, .rz")) {
        return;
      }
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      el.classList.add("grabbing");
      start.current = { x: e.clientX, y: e.clientY, rect: { ...floatRect.value } };
    },
    onPointerMove(e) {
      const el = e.currentTarget as HTMLElement;
      if (!el.hasPointerCapture(e.pointerId)) {
        return;
      }
      const r = start.current.rect;
      floatRect.value = clampToViewport({
        ...r,
        x: r.x + (e.clientX - start.current.x),
        y: r.y + (e.clientY - start.current.y),
      });
    },
    onPointerUp(e) {
      const el = e.currentTarget as HTMLElement;
      el.releasePointerCapture(e.pointerId);
      el.classList.remove("grabbing");
      persist();
    },
  };
}

/**
 * Note the new viewport so the panel redraws against it.
 *
 * Nothing is written back to `size` or `floatRect` here: the stored geometry
 * is what a person asked for and outlives any one window size. Making the
 * window narrow and wide again therefore returns the panel to the width it
 * had, instead of leaving it at the narrowest the window ever was.
 */
export function reflowFloat(): void {
  const w = viewW();
  const h = viewH();
  if (viewport.value.w !== w || viewport.value.h !== h) {
    viewport.value = { w, h };
  }
}

/**
 * The geometry to draw with: the remembered intent, clamped to what fits.
 *
 * `size` is shared between the two docks -- it means width docked right and
 * height docked bottom -- so the same number has to be clamped against
 * whichever axis it is being used on.
 */
export function drawnSize(): number {
  return dock.value === "dock-bottom"
    ? Math.min(size.value, maxDockH())
    : Math.min(size.value, maxDockW());
}

export function drawnRect(): FloatRect {
  const { w: vw, h: vh } = currentView();
  const want = floatRect.value;
  const r = clampToViewport(want);
  /*
   * A panel the viewport had to shrink is pulled fully back into view.
   *
   * Dragging a panel half off the right edge is a deliberate gesture -- park
   * it, watch the app -- so position alone is left exactly as it was found.
   * But a panel whose *size* the viewport just cut was not parked by anyone:
   * it is only hanging off the edge because the window moved under it, and it
   * should end up whole and on screen.
   */
  return {
    ...r,
    x: r.w < want.w ? Math.max(0, Math.min(r.x, vw - r.w)) : r.x,
    y: r.h < want.h ? Math.max(0, Math.min(r.y, vh - r.h)) : r.y,
  };
}
