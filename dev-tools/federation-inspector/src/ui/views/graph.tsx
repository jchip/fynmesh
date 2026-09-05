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
import {
  analysis,
  focusOn,
  graphHops,
  graphZoom,
  selected,
  snapshot,
  visibleModules,
} from "../state.js";
import {
  layerLayout,
  neighbourhood,
  reachByDepth,
  type Graph,
} from "../../analysis/graph.js";
import {
  edgeKey,
  elkLayout,
  structureKey,
  type Placement,
  type Point,
} from "../../analysis/elk-layout.js";
import { dehash, hueFor, plural, urlTail } from "../../util/format.js";
import type { ContainerNode, ModuleNode } from "../../core/model.js";

const NODE_W = 168;
const NODE_H = 34;
/*
 * How much text a node's two lines hold, in characters.
 *
 * Both lines are monospace, so this is a width in disguise: at 11px the main
 * line's glyphs are ~6.6px, at 9.5px the sub-line's are ~5.7px, and both start
 * 8px in. 21 and 26 land at 147px and 156px of the 168px node, which leaves
 * the right edge clear without wasting it. The sub-line gets the wider budget
 * because it is the line that carries `container@version`: cutting
 * `fynapp-x1@2.0.0` down to `fynapp-x1@2.0…` would throw away the digit the
 * version was put there to show.
 */
const MAIN_CHARS = 21;
const SUB_CHARS = 26;
/*
 * 80, not 56. Eleven edges arrive at the shared `esm-react` node, and they
 * have to fan out into the gap between layers: at 56 the closest pair of edges
 * ran 1.5px apart, which is one line as far as the eye is concerned.
 */
const GAP_X = 80;
const GAP_Y = 12;
const MAX_NODES = 320;
/** the depths the focus control offers */
const HOPS = [1, 2, 3, 4];

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;
/** one wheel notch, and one press of the +/- buttons */
const ZOOM_STEP = 1.12;
/*
 * Movement before a press becomes a pan rather than a click on a node.
 *
 * 6, not 3. Chrome does not call a press a drag until about 5px, so at 3 a
 * hand that wobbled well inside its own click budget panned the canvas and
 * selected nothing -- the gesture made was a click, and the platform agrees.
 * Measured as a distance rather than per axis so a diagonal drag still starts
 * at 6px instead of at the 8.5px corner of a box.
 */
const PAN_SLOP = 6;

/*
 * How long a click waits to find out whether it is half of a double-click.
 *
 * The platform double-click interval, near enough: long enough to catch a
 * deliberate double, short enough that focusing a node still reads as a
 * response to the press. See the click handlers for why the wait exists.
 */
const DBLCLICK_MS = 250;

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
 *
 * That capture is also why a pan announces itself: from the moment it takes
 * the pointer, the node underneath never receives its pointerleave, so a hover
 * highlight would otherwise survive the canvas sliding out from under it.
 */
function usePanZoom(onPanStart: () => void): {
  wrapRef: { current: HTMLDivElement | null };
  panProps: JSX.HTMLAttributes<HTMLDivElement>;
  zoomBy: (factor: number, clientX?: number, clientY?: number) => void;
  fitTo: (w: number, h: number) => void;
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
        if (Math.hypot(dx, dy) < PAN_SLOP) {
          return;
        }
        p.panning = true;
        onPanStart();
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

  /**
   * Zoom so the whole drawing fits, and go to its top-left.
   *
   * The one control the zoom buttons cannot substitute for: with the panel
   * docked at 759px and a graph 1084 wide, "where is the rest of it" is the
   * first question the view raises and panning is a slow way to answer it.
   */
  const fitTo = (w: number, h: number) => {
    const el = wrapRef.current;
    if (!el || !w || !h) {
      return;
    }
    graphZoom.value = clampZoom(Math.min(el.clientWidth / w, el.clientHeight / h));
    requestAnimationFrame(() => {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    });
  };

  /*
   * Reset is a zoom like any other, so it anchors like one.
   *
   * Assigning the zoom directly left the scroll offsets untouched and let the
   * container clamp them against the now-smaller content, which from 176% at
   * (1350,702) dumped the reader back at (444,66) -- a different part of the
   * graph than the one they were looking at. Routing through zoomBy makes the
   * centre of the viewport hold still, the same promise the -, + and ctrl+wheel
   * paths already make.
   */
  const resetZoom = () => zoomBy(1 / graphZoom.value);

  return { wrapRef, panProps, zoomBy, fitTo, resetZoom };
}

/**
 * Container names the snapshot holds more than one live version of.
 *
 * The same test the Containers view calls "N versions live", read off the
 * containers list rather than guessed from an id: a version that appears in a
 * url is a build's directory convention (`fynapp-x1-v2/`) and not something
 * the loader or federation promises, and `demo/fynapp-x1-v1` and
 * `demo/fynapp-x1-v2` both publish the container name `fynapp-x1`. The
 * registrations are what actually know there are two.
 */
export function multiVersionNames(containers: ContainerNode[]): Set<string> {
  const names = new Set<string>();
  for (const c of containers) {
    if (c.versions.length > 1) {
      names.add(c.name);
    }
  }
  return names;
}

/**
 * The container a node belongs to, told apart from its siblings when it has to
 * be.
 *
 * The version is spent only where it buys something. With one live version of
 * a container the name already names one thing, and `fynapp-1@1.0.0` under
 * every chunk of a nine-container page is noise on the line with the least
 * room. But `fynapp-x1` at 1.0.0 and at 2.0.0 are two containers as far as the
 * reader is concerned and their chunks are both `main.js`, so under a bare
 * name a node from each is the same node drawn twice. Where the version does
 * appear it is therefore a fact in itself: this is one of the containers
 * running twice.
 */
function containerLabel(
  container: { name: string; version?: string } | undefined,
  multiVersion: Set<string>
): string | undefined {
  if (!container) {
    return undefined;
  }
  return container.version && multiVersion.has(container.name)
    ? container.name + "@" + container.version
    : container.name;
}

/**
 * What to write on a node.
 *
 * The filename alone is useless here: fifteen of the demo's nodes are called
 * "fynapp-entry.js" and nothing distinguished them. So a container entry is
 * labelled by its container, a shared module by its share key, and everything
 * else by its filename with the container underneath.
 */
export function labelFor(
  node: ModuleNode,
  multiVersion: Set<string>
): { main: string; sub?: string } {
  if (node.kind === "container-entry" && node.container) {
    // the main line is already the name, so the sub-line carries the version
    // alone -- and here it carries it always, because a container entry is the
    // one node whose whole identity is which version it is
    return {
      main: node.container.name,
      sub: node.container.version ? "@" + node.container.version : "entry",
    };
  }
  if (node.shareKey) {
    return {
      main: node.shareKey,
      sub: node.version ?? containerLabel(node.container, multiVersion),
    };
  }
  return {
    main: dehash(urlTail(node.id, 1) || node.id),
    sub: containerLabel(node.container, multiVersion),
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

/** marker id -> fill, matching the three edge tones in ui/styles */
const ARROWS: Array<[string, string]> = [
  ["ga", "var(--border-strong)"],
  ["ga-hot", "var(--accent)"],
  ["ga-cycle", "var(--err)"],
];

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

/**
 * The selection this graph can draw, and the one it cannot.
 *
 * `selected` is a single signal shared by every tab, and the tabs do not all
 * write module ids into it: Containers and Shares select a container name
 * (`fynapp-x1`), a version row selects an entry url. So arriving here with a
 * selection that is not a node is the ordinary way this view is reached and
 * not a corner case, and the answer is worked out once: everything downstream
 * -- the label, the depth control, the hot edges, the dimming -- then agrees
 * about what is focused, because there is one place that decided.
 */
export function resolveFocus(
  graph: Graph,
  selection: string | undefined
): { focus?: string; missing?: string } {
  return selection && graph.byId.has(selection)
    ? { focus: selection }
    : { missing: selection };
}

export function GraphView(): JSX.Element {
  const model = useComputed(() => {
    const graph = analysis.value.graph;
    const { focus, missing } = resolveFocus(graph, selected.value);

    let ids: string[];
    let edges: Array<[string, string]>;

    if (focus) {
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
      missing,
      // what each depth setting would reach, so the control can say so before
      // it is pressed. Empty when there is nothing focused to widen around --
      // including a selection this graph does not contain.
      reach: focus ? reachByDepth(graph, focus, HOPS[HOPS.length - 1]) : [],
      multiVersion: multiVersionNames(snapshot.value.containers),
      key: structureKey(ids, edges),
      fallback: fallbackPlacement(ids, edges),
      truncated: ids.length >= MAX_NODES,
    };
  });

  const m = model.value;

  /*
   * Which node the pointer is resting on, and nothing else.
   *
   * Eleven edges arrive at the shared `esm-react` node and share its 34px
   * side, so "what connects to this" is a question the drawing cannot answer
   * at rest, however wide the layer gap gets. An edge is a sibling of the node
   * it leaves, so no selector reaches it from that node's `:hover` -- the
   * highlight has to be state. It is state about the pointer alone: the model,
   * the selection and the ELK layout are all untouched, so a hover costs a
   * re-render of exactly the same shape and never a re-layout.
   */
  const [hovered, setHovered] = useState<string | undefined>(undefined);

  const { wrapRef, panProps, zoomBy, fitTo, resetZoom } = usePanZoom(() =>
    setHovered(undefined)
  );

  /*
   * Click focuses, double-click opens in Modules -- and the two fight unless
   * the first click is held.
   *
   * Focusing swaps the model from the filtered set to the neighbourhood, a new
   * shape, so the layout re-runs and the node slides away (376px, in the case
   * that found this) long before the second click of a double arrives. The
   * second click lands on empty canvas, the two clicks share no target, and no
   * dblclick is ever dispatched for the node: the documented gesture could not
   * fire at all.
   *
   * So the focus change waits one double-click interval and a second click
   * cancels it. Of the ways out this is the only one that keeps both gestures
   * on the node: refusing to re-lay-out on click would defeat what the click
   * is for, and moving "open" onto a modifier would quietly retire a gesture
   * the README teaches. The price is a beat of latency before the graph
   * re-focuses, which is cheaper than a gesture that does nothing.
   */
  const clickTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const onNodeClick = (id: string) => {
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      selected.value = id;
    }, DBLCLICK_MS);
  };
  const onNodeDblClick = (id: string) => {
    window.clearTimeout(clickTimer.current);
    focusOn("modules", "id:" + id, id);
  };
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
        {/*
          * Name the selection the graph could not draw, rather than saying
          * nothing about it.
          *
          * Dropping the label would be honest too, and cheaper. But this state
          * is reached by clicking `fynapp-x1` in Containers and switching tab,
          * and the reader arriving that way has to be told which of the two
          * things happened: silence leaves them reading the filtered set with
          * no hint that their own click is why they are not looking at what
          * they picked. One clause answers that; a missing label does not.
          */}
        <span class="grouplabel">
          {m.focus ? (
            <>
              focused on <b>{urlTail(m.focus, 1) || m.focus}</b>
            </>
          ) : m.missing ? (
            <>
              showing the filtered set; <b>{urlTail(m.missing, 1) || m.missing}</b> is
              not a module in this graph
            </>
          ) : (
            "showing the filtered set"
          )}
        </span>
        {m.focus || m.missing ? (
          <>
            {m.reach.length ? (
              <>
                <span class="grouplabel">depth</span>
                {HOPS.map((h) => {
                  const nodes = m.reach[h - 1];
                  // the neighbourhoods are nested, so reaching the same count
                  // as the depth below means reaching the same nodes: this
                  // button would redraw the picture already on screen
                  const closed = h > 1 && nodes === m.reach[h - 2];
                  /*
                   * Never take away the depth the reader is standing on. A
                   * control going dead under the pointer reads as a fault, the
                   * pressed state has to live somewhere, and `aria-pressed` on
                   * a disabled button is a contradiction. So a closed depth is
                   * disabled only while it is not the current one.
                   */
                  const dead = closed && graphHops.value !== h;
                  return (
                    <button
                      key={h}
                      class="facet"
                      aria-pressed={graphHops.value === h}
                      disabled={dead}
                      title={
                        closed
                          ? `depth ${h} reaches the same ${plural(nodes, "node")} as depth ${h - 1}`
                          : `depth ${h} reaches ${plural(nodes, "node")}`
                      }
                      onClick={() => (graphHops.value = h)}
                    >
                      {h}
                      <span class="n">{nodes}</span>
                    </button>
                  );
                })}
              </>
            ) : null}
            {/* the same signal either way, but there is no focus to clear
                when the graph never found the selection */}
            <button class="selectish" onClick={() => (selected.value = undefined)}>
              {m.focus ? "clear focus" : "clear selection"}
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
        <button
          class="selectish"
          title="Fit the whole graph in the panel"
          onClick={() => fitTo(place.width, place.height)}
        >
          fit
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
          {/*
            * Direction is the one thing a dependency graph must say, and a
            * line says it only by convention. One marker per edge tone,
            * because `context-stroke` is not honoured everywhere and a marker
            * inherits nothing else from the path that uses it.
            */}
          <defs>
            {ARROWS.map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,1 L7,4 L0,7 z" fill={color} />
              </marker>
            ))}
          </defs>
          {/*
            * Hover outranks focus, for as long as it lasts.
            *
            * Focus dimming is the standing state a click leaves behind; a
            * hover is a question asked with the pointer and withdrawn when it
            * moves on. So while a node is hovered the lit set is that node,
            * its incident edges and whatever is at their far ends, and
            * everything else falls back -- including the rest of the focus
            * neighbourhood, which would otherwise leave a dozen bright nodes
            * competing with the answer. Nothing else changes hands: the accent
            * ring on the focused node and the red of a cycle are identity and
            * severity rather than emphasis, so hover is spent entirely on
            * opacity and stroke width and never on colour. That is also why it
            * needs no fourth arrowhead marker -- an edge keeps its own tone,
            * and `opacity` on the path takes its marker down with it.
            */}
          <g>
            {m.edges.map(([from, to], i) => {
              const hot = from === m.focus || to === m.focus;
              const cycle = m.graph.inCycle.has(from) && m.graph.inCycle.has(to);
              const incident = hovered !== undefined && (from === hovered || to === hovered);
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
                  class={
                    "gedge" +
                    (cycle ? " cycle" : hot ? " hot" : "") +
                    (hovered === undefined ? "" : incident ? " lit" : " faded")
                  }
                  marker-end={`url(#${cycle ? "ga-cycle" : hot ? "ga-hot" : "ga"})`}
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
              const label = labelFor(node, m.multiVersion);
              const dimmed =
                hovered === undefined
                  ? !!m.focus && !isFocus && !isNeighbour(m.graph, m.focus, id)
                  : id !== hovered && !isNeighbour(m.graph, hovered, id);
              return (
                <g
                  key={id}
                  class={"gnode" + (dimmed ? " dimmed" : "")}
                  transform={`translate(${p.x},${p.y})`}
                  onClick={() => onNodeClick(id)}
                  onDblClick={() => onNodeDblClick(id)}
                  onPointerEnter={() => setHovered(id)}
                  onPointerLeave={() => setHovered(undefined)}
                >
                  <title>
                    {id}
                    {node.container
                      ? `\ncontainer: ${node.container.name}${
                          node.container.version ? "@" + node.container.version : ""
                        }`
                      : ""}
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
                    {clip(label.main, MAIN_CHARS)}
                  </text>
                  {label.sub ? (
                    <text class="sub" x="8" y="26">
                      {clip(label.sub, SUB_CHARS)}
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

/**
 * Is `id` one edge from `centre`, in either direction?
 *
 * Takes the centre rather than reading the focus out of the model, because the
 * standing focus and a transient hover ask the same question of the same
 * graph, and there is no reason for two answers to it.
 */
function isNeighbour(graph: Graph, centre: string, id: string): boolean {
  return (
    (graph.out.get(centre) ?? []).includes(id) ||
    (graph.in.get(centre) ?? []).includes(id)
  );
}
