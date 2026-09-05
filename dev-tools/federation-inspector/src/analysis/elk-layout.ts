/**
 * Graph layout, by ELK.
 *
 * The hand-rolled layered layout in `graph.ts` places nodes correctly but
 * orders them naively: it never tries to reduce edge crossings, and every edge
 * is drawn as a bezier straight through whatever is in the way. On a
 * neighbourhood of any size that reads as spaghetti. ELK does the parts that
 * are genuinely hard -- layer assignment, crossing minimisation, node
 * placement and edge routing -- and hands back coordinates and polylines.
 *
 * Three properties of this panel constrain how it is used:
 *
 * - **Deterministic.** The snapshot is re-collected every 500ms. A layout that
 *   moved on each pass would make the view unreadable, so the seed is fixed
 *   and the layout is recomputed only when the set of nodes or edges actually
 *   changes -- see `structureKey`.
 * - **Self-contained.** The bundled build is imported, not the worker build:
 *   the worker build fetches `elk-worker.js` at runtime, and this tool is a
 *   drop-in script that must not fetch anything, register anything with the
 *   page's loader, or otherwise affect what it is observing.
 * - **Never fatal.** Layout is the one step here that can throw on input the
 *   collectors accepted, so callers keep the old layered layout as a fallback.
 */

import ELK from "elkjs/lib/elk.bundled.js";

export interface Point {
  x: number;
  y: number;
}

export interface Placement {
  /** the structure this was computed for */
  key: string;
  positions: Map<string, Point>;
  /** edgeKey(from, to) -> the polyline to draw, both endpoints included */
  routes: Map<string, Point[]>;
  width: number;
  height: number;
}

export interface LayoutMetrics {
  nodeW: number;
  nodeH: number;
  /** space between layers */
  gapX: number;
  /** space between nodes within a layer */
  gapY: number;
}

/** id separator: a space cannot appear in a module id, so this cannot collide */
const SEP = " ";

/**
 * What the layout depends on, and nothing else.
 *
 * Not the module data: a module changing stage, gaining an alias or being
 * re-fetched must not move the picture. Only its shape may.
 */
export function structureKey(ids: string[], edges: Array<[string, string]>): string {
  return ids.join(SEP) + "//" + edges.map((e) => e[0] + ">" + e[1]).join(SEP);
}

export function edgeKey(from: string, to: string): string {
  return from + ">" + to;
}

interface Engine {
  layout: (graph: unknown) => Promise<ElkResult>;
}

interface ElkResult {
  width?: number;
  height?: number;
  children?: Array<{ id: string; x?: number; y?: number }>;
  edges?: Array<{
    sources?: string[];
    targets?: string[];
    sections?: Array<{ startPoint: Point; endPoint: Point; bendPoints?: Point[] }>;
  }>;
}

let elk: Engine | undefined;

/**
 * Constructed on first layout, not on import.
 *
 * Importing the library is already 1.5MB of parse; standing the engine up on
 * top of that would be paid by every page the inspector is dropped on,
 * including the ones that never open the Graph tab.
 */
function engine(): Engine {
  elk ??= new (ELK as unknown as new () => Engine)();
  return elk;
}

export async function elkLayout(
  ids: string[],
  edges: Array<[string, string]>,
  metrics: LayoutMetrics
): Promise<Placement> {
  const key = structureKey(ids, edges);
  const present = new Set(ids);

  // ELK ids are opaque and ours are urls, so indices keep the graph cheap to
  // serialise and sidestep any question of what a legal id is
  const idOf = new Map<string, string>();
  ids.forEach((id, i) => idOf.set(id, "n" + i));

  const seen = new Set<string>();
  const elkEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  for (const [from, to] of edges) {
    // a self-loop has no layered position to occupy, and a repeated edge just
    // draws the same line twice
    if (from === to || !present.has(from) || !present.has(to)) {
      continue;
    }
    const k = edgeKey(from, to);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    elkEdges.push({
      id: "e" + seen.size,
      sources: [idOf.get(from)!],
      targets: [idOf.get(to)!],
    });
  }

  const pad = {
    x: Math.round(metrics.gapX / 2),
    y: metrics.gapY,
  };
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(metrics.gapX),
      "elk.spacing.nodeNode": String(metrics.gapY),
      "elk.spacing.edgeNode": String(Math.max(6, Math.round(metrics.gapY / 2))),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(
        Math.max(6, Math.round(metrics.gapY / 2))
      ),
      // ties break in the order the nodes arrive, which is the collector's
      // order: stable between passes, so the picture is stable too
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.cycleBreaking.strategy": "DEPTH_FIRST",
      "elk.randomSeed": "1",
      "elk.padding": `[top=${pad.y},left=${pad.x},bottom=${pad.y},right=${pad.x}]`,
    },
    children: ids.map((id) => ({
      id: idOf.get(id)!,
      width: metrics.nodeW,
      height: metrics.nodeH,
    })),
    edges: elkEdges,
  };

  const laid = await engine().layout(graph);

  const ours = new Map<string, string>();
  idOf.forEach((elkId, id) => ours.set(elkId, id));

  const positions = new Map<string, Point>();
  for (const child of laid.children ?? []) {
    const id = ours.get(child.id);
    if (id) {
      positions.set(id, { x: child.x ?? 0, y: child.y ?? 0 });
    }
  }

  const routes = new Map<string, Point[]>();
  for (const e of laid.edges ?? []) {
    const from = ours.get(e.sources?.[0] ?? "");
    const to = ours.get(e.targets?.[0] ?? "");
    const section = e.sections?.[0];
    if (!from || !to || !section) {
      continue;
    }
    routes.set(edgeKey(from, to), [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
  }

  return {
    key,
    positions,
    routes,
    width: Math.max(laid.width ?? 0, metrics.nodeW + metrics.gapX),
    height: Math.max(laid.height ?? 0, metrics.nodeH + metrics.gapY),
  };
}
