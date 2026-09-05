/**
 * The Graph view.
 *
 * Deliberately not a force simulation. This panel re-collects every 500ms, and
 * a force layout would redraw differently each time -- the picture would move
 * under you while you read it. A deterministic layered layout redraws
 * identically for identical input, so a refresh that adds one module moves one
 * module.
 *
 * It also does not attempt the whole registry. A few thousand nodes is
 * unreadable at any layout quality, so the default is the neighbourhood around
 * whatever is selected, with a control to widen it. Colour is by container, on
 * the same name-hash the chips use, so a node keeps its identity across views.
 */

import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useComputed } from "@preact/signals";
import { analysis, focusOn, graphHops, graphZoom, selected, visibleModules } from "../state.js";
import { layerLayout, neighbourhood, type Graph } from "../../analysis/graph.js";
import {
  edgeKey,
  elkLayout,
  structureKey,
  type Placement,
  type Point,
} from "../../analysis/elk-layout.js";
import { dehash, hueFor, plural, urlTail } from "../../util/format.js";
import type { ModuleNode } from "../../core/model.js";

const NODE_W = 168;
const NODE_H = 34;
const GAP_X = 56;
const GAP_Y = 12;
const MAX_NODES = 320;

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;
/** one wheel notch, and one press of the +/- buttons */
const ZOOM_STEP = 1.12;
/** movement before a press becomes a pan rather than a click on a node */
const PAN_SLOP = 3;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * Drag to pan, ctrl/cmd-wheel to zoom.
 *
 * Panning moves the scroll container rather than a transform, so the
 * scrollbars, the wheel and the keyboard keep working and agree with each
 * other -- a transform would leave the scrollbars describing a viewport that
 * no longer exists.
 *
 * The pointer is captured only once it has moved PAN_SLOP, and not on
 * pointerdown. Capturing immediately would redirect the pointerup and swallow
 * the click on the node underneath, so selecting a node by clicking it would
 * stop working; capturing late means a click stays a click and a drag stops
 * being one.
 */
function usePanZoom(): {
  wrapRef: { current: HTMLDivElement | null };
  panProps: JSX.HTMLAttributes<HTMLDivElement>;
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void;
  resetZoom: () => void;
} {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pan = useRef({ x: 0, y: 0, left: 0, top: 0, down: false, panning: false });

  /*
   * Keep the point under the cursor still.
   *
   * Zooming about the top-left corner is the usual accident: the thing being
   * read slides off screen at every step, and on a graph three screens wide
   * that means losing it entirely.
   */
  const zoomBy = (factor: number, clientX?: number, clientY?: number) => {
    const el = wrapRef.current;
    const from = graphZoom.value;
    const to = clampZoom(from * factor);
    if (!el || to === from) {
      graphZoom.value = to;
      return;
    }
    const box = el.getBoundingClientRect();
    const ax = clientX === undefined ? box.width / 2 : clientX - box.left;
    const ay = clientY === undefined ? box.height / 2 : clientY - box.top;
    const cx = el.scrollLeft + ax;
    const cy = el.scrollTop + ay;
    const k = to / from;
    graphZoom.value = to;
    // after the frame the content is k times bigger; before it, the container
    // would clamp the new scroll offsets against the old, smaller extent
    requestAnimationFrame(() => {
      el.scrollLeft = cx * k - ax;
      el.scrollTop = cy * k - ay;
    });
  };

  const panProps: JSX.HTMLAttributes<HTMLDivElement> = {
    onPointerDown(e) {
      const el = wrapRef.current;
      if (!el || e.button !== 0) {
        return;
      }
      pan.current = {
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
        down: true,
        panning: false,
      };
    },
    onPointerMove(e) {
      const el = wrapRef.current;
      const p = pan.current;
      if (!el || !p.down) {
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (!p.panning) {
        if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) {
          return;
        }
        p.panning = true;
        el.classList.add("panning");
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
      el.scrollLeft = p.left - dx;
      el.scrollTop = p.top - dy;
    },
    onPointerUp(e) {
      const el = wrapRef.current;
      const p = pan.current;
      p.down = false;
      if (p.panning) {
        p.panning = false;
        el?.classList.remove("panning");
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    onPointerCancel() {
      pan.current.down = false;
      pan.current.panning = false;
      wrapRef.current?.classList.remove("panning");
    },
    onWheel(e) {
      // ctrl/cmd + wheel is the platform zoom gesture, and a trackpad pinch
      // arrives as exactly that. A plain wheel keeps scrolling the container.
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
    },
  };

  return { wrapRef, panProps, zoomBy, resetZoom: () => (graphZoom.value = 1) };
}

/**
 * What to write on a node.
 *
 * The filename alone is useless here: fifteen of the demo's nodes are called
 * "fynapp-entry.js" and nothing distinguished them. So a container entry is
 * labelled by its container, a shared module by its share key, and everything
 * else by its filename with the container underneath.
 */
function labelFor(node: ModuleNode): { main: string; sub?: string } {
  if (node.kind === "container-entry" && node.container) {
    return {
      main: node.container.name,
      sub: node.container.version ? "@" + node.container.version : "entry",
    };
  }
  if (node.shareKey) {
    return { main: node.shareKey, sub: node.version ?? node.container?.name };
  }
  return {
    main: dehash(urlTail(node.id, 1) || node.id),
    sub: node.container?.name,
  };
}

/**
 * An orthogonal route, with its corners rounded.
 *
 * ELK returns right-angle polylines. Drawn as-is they read as a circuit
 * diagram and, at the density of a module graph, the corners pile up into
 * visual noise; a small arc at each bend keeps the orthogonal structure while
 * letting the eye follow one line through a junction.
 */
function roundedPath(points: Point[], radius = 6): string {
  if (points.length < 2) {
    return "";
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(corner.x - prev.x, corner.y - prev.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2
    );
    const from = towards(corner, prev, r);
    const to = towards(corner, next, r);
    d += ` L${from.x},${from.y} Q${corner.x},${corner.y} ${to.x},${to.y}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x},${last.y}`;
}

function towards(from: Point, to: Point, by: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * by, y: from.y + (dy / len) * by };
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/**
 * The layout to draw while ELK is still working, and if it ever fails.
 *
 * Same layered idea, without crossing minimisation or routing: nodes sit on a
 * grid of layers and edges are drawn as beziers straight between them. It is
 * worse to read and it is instant, which is exactly the trade for a first
 * frame -- and it means a layout engine that throws costs quality, not a view.
 */
function fallbackPlacement(ids: string[], edges: Array<[string, string]>): Placement {
  const { layers, position } = layerLayout(ids, edges);
  const tallest = Math.max(...layers.map((l) => l.length), 1);
  const height = tallest * (NODE_H + GAP_Y) + GAP_Y;
  const width = layers.length * (NODE_W + GAP_X) + GAP_X;

  const positions = new Map<string, Point>();
  for (const id of ids) {
    const p = position.get(id);
    if (!p) {
      continue;
    }
    const rows = layers[p.layer].length;
    const offset = (height - rows * (NODE_H + GAP_Y)) / 2;
    positions.set(id, {
      x: GAP_X / 2 + p.layer * (NODE_W + GAP_X),
      y: offset + GAP_Y + p.order * (NODE_H + GAP_Y),
    });
  }
  return { key: structureKey(ids, edges), positions, routes: new Map(), width, height };
}

/**
 * Lay the graph out with ELK, once per shape.
 *
 * Keyed on the structure and not on the snapshot: the panel re-collects every
 * 500ms, and a layout per collection would both cost a second of CPU a minute
 * and shuffle the picture under whoever is reading it.
 */
function useElkLayout(
  key: string,
  ids: string[],
  edges: Array<[string, string]>
): { placement?: Placement; pending: boolean } {
  const [placement, setPlacement] = useState<Placement | undefined>(undefined);

  useEffect(() => {
    let live = true;
    elkLayout(ids, edges, { nodeW: NODE_W, nodeH: NODE_H, gapX: GAP_X, gapY: GAP_Y })
      .then((p) => {
        if (live) {
          setPlacement(p);
        }
      })
      .catch((err) => {
        // the fallback layout is already on screen; say why it is staying
        console.warn("[federation-inspector] graph layout failed", err);
      });
    return () => {
      live = false;
    };
  }, [key]);

  return { placement, pending: placement?.key !== key };
}

export function GraphView(): JSX.Element {
  const model = useComputed(() => {
    const graph = analysis.value.graph;
    const focus = selected.value;

    let ids: string[];
    let edges: Array<[string, string]>;

    if (focus && graph.byId.has(focus)) {
      const n = neighbourhood(graph, focus, graphHops.value);
      ids = [...n.nodes];
      edges = n.edges;
    } else {
      // no selection: the filtered set, capped -- an unfiltered registry is
      // not something a reader can take in, and pretending otherwise wastes
      // the view
      ids = visibleModules.value.slice(0, MAX_NODES).map((m) => m.id);
      const set = new Set(ids);
      edges = [];
      for (const id of ids) {
        for (const to of graph.out.get(id) ?? []) {
          if (set.has(to)) {
            edges.push([id, to]);
          }
        }
      }
    }

    if (ids.length > MAX_NODES) {
      ids = ids.slice(0, MAX_NODES);
      const set = new Set(ids);
      edges = edges.filter(([a, b]) => set.has(a) && set.has(b));
    }

    return {
      ids,
      edges,
      graph,
      focus,
      key: structureKey(ids, edges),
      fallback: fallbackPlacement(ids, edges),
      truncated: ids.length >= MAX_NODES,
    };
  });

  const m = model.value;
  const { wrapRef, panProps, zoomBy, resetZoom } = usePanZoom();
  const z = graphZoom.value;
  const { placement, pending } = useElkLayout(m.key, m.ids, m.edges);
  // the routed layout when it is for this shape, the instant one until then
  const place = placement && placement.key === m.key ? placement : m.fallback;
  const xy = (id: string) => place.positions.get(id) ?? { x: 0, y: 0 };

  if (!m.ids.length) {
    return (
      <div class="empty">
        Nothing to draw. Select a module, or clear the filter to see the
        dependency graph.
      </div>
    );
  }

  return (
    <>
      <div class="filterbar" style={{ borderTop: 0 }}>
        <span class="grouplabel">
          {m.focus ? (
            <>
              focused on <b>{urlTail(m.focus, 1) || m.focus}</b>
            </>
          ) : (
            "showing the filtered set"
          )}
        </span>
        {m.focus ? (
          <>
            <span class="grouplabel">depth</span>
            {[1, 2, 3, 4].map((h) => (
              <button
                key={h}
                class="facet"
                aria-pressed={graphHops.value === h}
                onClick={() => (graphHops.value = h)}
              >
                {h}
              </button>
            ))}
            <button class="selectish" onClick={() => (selected.value = undefined)}>
              clear focus
            </button>
          </>
        ) : null}
        <span class="spacer" />
        <span class="grouplabel hide-sm">zoom</span>
        <button class="facet" title="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
          −
        </button>
        <button
          class="selectish"
          title="Reset zoom to 100% (ctrl/cmd + wheel zooms about the pointer)"
          onClick={resetZoom}
        >
          {Math.round(z * 100)}%
        </button>
        <button class="facet" title="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
          +
        </button>
        <span class="meta hide-sm">
          {plural(m.ids.length, "node")} · {plural(m.edges.length, "edge")}
          {m.truncated ? ` · capped at ${MAX_NODES}` : ""}
          {pending ? " · routing…" : ""}
        </span>
      </div>

      <div class="graphwrap" ref={wrapRef} {...panProps}>
        <svg
          width={Math.round(place.width * z)}
          height={Math.round(place.height * z)}
          viewBox={`0 0 ${place.width} ${place.height}`}
          role="img"
          aria-label="module dependency graph"
        >
          <g>
            {m.edges.map(([from, to], i) => {
              const hot = from === m.focus || to === m.focus;
              const cycle = m.graph.inCycle.has(from) && m.graph.inCycle.has(to);
              const route = place.routes.get(edgeKey(from, to));
              const a = xy(from);
              const b = xy(to);
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              return (
                <path
                  key={i}
                  class={"gedge" + (cycle ? " cycle" : hot ? " hot" : "")}
                  d={
                    route
                      ? roundedPath(route)
                      : `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`
                  }
                />
              );
            })}
          </g>
          <g>
            {m.ids.map((id) => {
              const node = m.graph.byId.get(id)!;
              const p = xy(id);
              const hue = node.container ? hueFor(node.container.name) : 220;
              const isFocus = id === m.focus;
              const label = labelFor(node);
              return (
                <g
                  key={id}
                  class={"gnode" + (m.focus && !isFocus && !isNeighbour(m, id) ? " dimmed" : "")}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => (selected.value = id)}
                  onDblClick={() => focusOn("modules", "id:" + id, id)}
                >
                  <title>
                    {id}
                    {node.container ? `\ncontainer: ${node.container.name}` : ""}
                    {`\nstage: ${node.stage}`}
                  </title>
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx="4"
                    fill={
                      node.stage === "errored"
                        ? "var(--bg-alt)"
                        : `hsl(${hue} 62% 50% / 0.14)`
                    }
                    stroke={
                      isFocus
                        ? "var(--accent)"
                        : node.stage === "errored"
                          ? "var(--err)"
                          : "var(--border-strong)"
                    }
                    stroke-width={isFocus ? 2 : 1}
                  />
                  <text x="8" y={label.sub ? 14 : NODE_H / 2 + 4}>
                    {clip(label.main, 21)}
                  </text>
                  {label.sub ? (
                    <text class="sub" x="8" y="26">
                      {clip(label.sub, 24)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </>
  );
}

/** Direct neighbours of the focused node, which stay undimmed. */
function isNeighbour(m: { graph: Graph; focus?: string }, id: string): boolean {
  if (!m.focus) {
    return true;
  }
  return (
    (m.graph.out.get(m.focus) ?? []).includes(id) ||
    (m.graph.in.get(m.focus) ?? []).includes(id)
  );
}
