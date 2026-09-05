/**
 * Dependency graph derivation.
 *
 * The loader gives forward edges only, and only once a module is linked. This
 * turns that into the things a reader actually asks for: what depends on this,
 * how far is it from an entry point, is it in a cycle, and what does a focused
 * neighbourhood around it look like.
 */

import type { ModuleNode, Snapshot } from "../core/model.js";

export interface Graph {
  /** id -> node, for O(1) lookup from any view */
  byId: Map<string, ModuleNode>;
  /** id -> dependency ids present in the snapshot */
  out: Map<string, string[]>;
  /** id -> dependent ids */
  in: Map<string, string[]>;
  /** ids nothing depends on: entries, or modules imported directly */
  roots: string[];
  /** ids with no dependencies of their own */
  leaves: string[];
  /** shortest distance from any root; Infinity for a node no root reaches */
  depth: Map<string, number>;
  /** strongly connected components with more than one member, plus self-loops */
  cycles: string[][];
  /** ids that participate in some cycle */
  inCycle: Set<string>;
}

export function buildGraph(snapshot: Snapshot): Graph {
  const byId = new Map<string, ModuleNode>();
  for (const m of snapshot.modules) {
    byId.set(m.id, m);
  }

  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const m of snapshot.modules) {
    out.set(m.id, []);
    inn.set(m.id, []);
  }
  for (const m of snapshot.modules) {
    const list = out.get(m.id)!;
    for (const d of m.deps) {
      if (!byId.has(d.id)) {
        continue;
      }
      list.push(d.id);
      inn.get(d.id)!.push(m.id);
    }
  }

  const roots: string[] = [];
  const leaves: string[] = [];
  for (const m of snapshot.modules) {
    if (inn.get(m.id)!.length === 0) {
      roots.push(m.id);
    }
    if (out.get(m.id)!.length === 0) {
      leaves.push(m.id);
    }
  }

  const depth = bfsDepth(roots, out);
  const cycles = tarjan(snapshot.modules.map((m) => m.id), out);
  const inCycle = new Set<string>();
  for (const c of cycles) {
    for (const id of c) {
      inCycle.add(id);
    }
  }

  return { byId, out, in: inn, roots, leaves, depth, cycles, inCycle };
}

function bfsDepth(roots: string[], out: Map<string, string[]>): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const r of roots) {
    depth.set(r, 0);
    queue.push(r);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const d = depth.get(id)!;
    for (const next of out.get(id) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}

/**
 * Tarjan's SCC, iterative.
 *
 * Iterative rather than recursive because a deep dependency chain in a large
 * app is thousands of nodes long and the recursive form blows the stack --
 * which, in a devtools overlay, would take the page down with it.
 */
function tarjan(ids: string[], out: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: string[][] = [];
  let counter = 0;

  for (const start of ids) {
    if (index.has(start)) {
      continue;
    }
    // frame: [node, next child position]
    const work: Array<[string, number]> = [[start, 0]];

    while (work.length) {
      const frame = work[work.length - 1];
      const [v, pos] = frame;

      if (pos === 0) {
        index.set(v, counter);
        low.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
      }

      const children = out.get(v) ?? [];
      if (pos < children.length) {
        frame[1]++;
        const w = children[pos];
        if (!index.has(w)) {
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
        continue;
      }

      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
      }

      if (low.get(v) === index.get(v)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== v);
        // a single node is only a cycle if it depends on itself
        if (component.length > 1 || (out.get(v) ?? []).includes(v)) {
          result.push(component);
        }
      }
    }
  }
  return result;
}

/**
 * The neighbourhood of `id` within `hops` edges, in both directions.
 *
 * The graph view uses this rather than drawing the whole registry: a few
 * thousand nodes is unreadable regardless of layout, and what a reader wants
 * is almost always "this module and what surrounds it".
 */
export function neighbourhood(
  graph: Graph,
  id: string,
  hops: number
): { nodes: Set<string>; edges: Array<[string, string]> } {
  const nodes = new Set<string>([id]);
  let frontier = [id];

  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const n of [...(graph.out.get(current) ?? []), ...(graph.in.get(current) ?? [])]) {
        if (!nodes.has(n)) {
          nodes.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
    if (!frontier.length) {
      break;
    }
  }

  const edges: Array<[string, string]> = [];
  for (const from of nodes) {
    for (const to of graph.out.get(from) ?? []) {
      if (nodes.has(to)) {
        edges.push([from, to]);
      }
    }
  }
  return { nodes, edges };
}

/**
 * How many nodes `neighbourhood` reaches at each depth from 1 to `maxHops`.
 *
 * The graph's depth control has to say what a setting buys before it is
 * pressed: on the demo page depth 3 and depth 4 both return the same 14 nodes
 * because the neighbourhood has already closed, and a button that redraws an
 * identical graph is indistinguishable from a button that does nothing at all.
 *
 * It goes back through `neighbourhood` for each depth rather than growing one
 * search, so the number on a button cannot drift from the graph the button
 * draws. Counts are enough to compare two depths: the neighbourhoods are
 * nested by construction -- depth h+1 keeps everything depth h reached -- so
 * equal sizes mean the same set.
 *
 * Cached per graph and focus. `buildGraph` runs on every 500ms collection, so
 * a strong cache would grow for as long as the panel stays open; a WeakMap
 * drops the whole entry with the graph it was computed for. Within one
 * snapshot the view re-renders on every hover, zoom and pan, and this is what
 * keeps each of those from re-running four searches.
 */
const reachCache = new WeakMap<Graph, Map<string, number[]>>();

export function reachByDepth(graph: Graph, id: string, maxHops: number): number[] {
  let byFocus = reachCache.get(graph);
  if (!byFocus) {
    byFocus = new Map();
    reachCache.set(graph, byFocus);
  }
  const key = maxHops + " " + id;
  const hit = byFocus.get(key);
  if (hit) {
    return hit;
  }
  const counts: number[] = [];
  for (let h = 1; h <= maxHops; h++) {
    counts.push(neighbourhood(graph, id, h).nodes.size);
  }
  byFocus.set(key, counts);
  return counts;
}

/**
 * Assign nodes to layers for the graph view.
 *
 * Longest-path layering, then a fixed number of median-heuristic sweeps to
 * reduce crossings. Deliberately deterministic -- a force simulation would
 * redraw differently on every refresh, and this view refreshes every 500ms,
 * so a stable picture is worth more than an optimal one.
 */
export function layerLayout(
  nodes: string[],
  edges: Array<[string, string]>
): { layers: string[][]; position: Map<string, { layer: number; order: number }> } {
  const set = new Set(nodes);
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n, []);
    inn.set(n, []);
  }
  for (const [a, b] of edges) {
    if (set.has(a) && set.has(b) && a !== b) {
      out.get(a)!.push(b);
      inn.get(b)!.push(a);
    }
  }

  // longest path from a source, ignoring back edges so a cycle cannot loop
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const assign = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) {
      return known;
    }
    if (visiting.has(id)) {
      return 0; // back edge inside a cycle
    }
    visiting.add(id);
    let best = 0;
    for (const p of inn.get(id) ?? []) {
      best = Math.max(best, assign(p) + 1);
    }
    visiting.delete(id);
    layer.set(id, best);
    return best;
  };
  for (const n of nodes) {
    assign(n);
  }

  const layers: string[][] = [];
  for (const n of nodes) {
    const l = layer.get(n)!;
    (layers[l] ??= []).push(n);
  }
  for (let i = 0; i < layers.length; i++) {
    layers[i] ??= [];
  }

  // median heuristic, alternating direction
  const orderOf = new Map<string, number>();
  const reindex = () => {
    for (const row of layers) {
      row.forEach((id, i) => orderOf.set(id, i));
    }
  };
  reindex();
  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const range = downward
      ? [...layers.keys()].slice(1)
      : [...layers.keys()].slice(0, -1).reverse();
    for (const li of range) {
      const neighbours = downward ? inn : out;
      layers[li].sort((a, b) => median(a, neighbours, orderOf) - median(b, neighbours, orderOf));
      reindex();
    }
  }

  const position = new Map<string, { layer: number; order: number }>();
  layers.forEach((row, li) => {
    row.forEach((id, oi) => position.set(id, { layer: li, order: oi }));
  });
  return { layers, position };
}

function median(
  id: string,
  neighbours: Map<string, string[]>,
  orderOf: Map<string, number>
): number {
  const positions = (neighbours.get(id) ?? [])
    .map((n) => orderOf.get(n))
    .filter((n): n is number => n !== undefined)
    .sort((a, b) => a - b);
  if (!positions.length) {
    return orderOf.get(id) ?? 0;
  }
  const mid = positions.length >> 1;
  return positions.length % 2
    ? positions[mid]
    : (positions[mid - 1] + positions[mid]) / 2;
}
