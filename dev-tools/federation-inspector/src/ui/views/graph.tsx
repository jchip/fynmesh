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
import { useComputed } from "@preact/signals";
import { analysis, focusOn, graphHops, selected, visibleModules } from "../state.js";
import { layerLayout, neighbourhood, type Graph } from "../../analysis/graph.js";
import { dehash, hueFor, urlTail } from "../../util/format.js";
import type { ModuleNode } from "../../core/model.js";

const NODE_W = 168;
const NODE_H = 34;
const GAP_X = 56;
const GAP_Y = 12;
const MAX_NODES = 320;

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

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
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

    const { layers, position } = layerLayout(ids, edges);
    const tallest = Math.max(...layers.map((l) => l.length), 1);
    const height = tallest * (NODE_H + GAP_Y) + GAP_Y;
    const width = layers.length * (NODE_W + GAP_X) + GAP_X;

    const xy = (id: string) => {
      const p = position.get(id)!;
      const rows = layers[p.layer].length;
      const offset = (height - rows * (NODE_H + GAP_Y)) / 2;
      return {
        x: GAP_X / 2 + p.layer * (NODE_W + GAP_X),
        y: offset + GAP_Y + p.order * (NODE_H + GAP_Y),
      };
    };

    return { ids, edges, xy, width, height, graph, focus, truncated: ids.length >= MAX_NODES };
  });

  const m = model.value;

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
        <span class="meta">
          {m.ids.length} nodes · {m.edges.length} edges
          {m.truncated ? ` · capped at ${MAX_NODES}` : ""}
        </span>
      </div>

      <div class="graphwrap">
        <svg width={m.width} height={m.height} role="img" aria-label="module dependency graph">
          <g>
            {m.edges.map(([from, to], i) => {
              const a = m.xy(from);
              const b = m.xy(to);
              const x1 = a.x + NODE_W;
              const y1 = a.y + NODE_H / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_H / 2;
              const mid = (x1 + x2) / 2;
              const hot = from === m.focus || to === m.focus;
              const cycle = m.graph.inCycle.has(from) && m.graph.inCycle.has(to);
              return (
                <path
                  key={i}
                  class={"gedge" + (cycle ? " cycle" : hot ? " hot" : "")}
                  d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                />
              );
            })}
          </g>
          <g>
            {m.ids.map((id) => {
              const node = m.graph.byId.get(id)!;
              const p = m.xy(id);
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
                  style={{ cursor: "pointer" }}
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
