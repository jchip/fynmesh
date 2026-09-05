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
import { dock, floatRect, persist, size, type FloatRect } from "../state.js";

export type Edge = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const MIN_W = 360;
const MIN_H = 240;

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

function clampToViewport(rect: FloatRect): FloatRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(MIN_W, Math.min(rect.w, vw));
  const h = Math.max(MIN_H, Math.min(rect.h, vh));
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

        if (dock.value === "dock-right") {
          size.value = Math.max(MIN_W, Math.min(window.innerWidth, start.current.size - dx));
          return;
        }
        if (dock.value === "dock-bottom") {
          size.value = Math.max(MIN_H, Math.min(window.innerHeight, start.current.size - dy));
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

/** Keep a floating panel on screen when the window shrinks under it. */
export function reflowFloat(): void {
  if (dock.value === "float") {
    floatRect.value = clampToViewport(floatRect.value);
  }
  if (dock.value === "dock-right") {
    size.value = Math.min(size.value, window.innerWidth);
  }
  if (dock.value === "dock-bottom") {
    // 90%, not 100%: `size` is shared with dock-right, so switching from a
    // wide right dock used to produce a panel covering the entire page with
    // nothing of the app left visible behind it.
    size.value = Math.min(size.value, Math.round(window.innerHeight * 0.9));
  }
}
