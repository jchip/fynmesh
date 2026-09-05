/**
 * Everything derived from a snapshot, in one pass.
 *
 * Kept separate from collection so it can run in a different realm: the
 * devtools-extension panel receives a snapshot over a message port and calls
 * `analyse` on its own side, with no access to the page.
 *
 * `resolveShares` writes back into the snapshot (consumers, resolved blocks)
 * because those belong to the snapshot's own shape rather than to a view --
 * a snapshot exported from the Raw tab should carry them.
 */

import type { Snapshot } from "../core/model.js";
import { buildGraph, type Graph } from "./graph.js";
import { resolveShares } from "./resolution.js";
import { findIssues } from "./issues.js";

export interface Analysis {
  graph: Graph;
  /** counts by stage, kind, container and scope, for the facet bar */
  facets: {
    stage: Map<string, number>;
    kind: Map<string, number>;
    container: Map<string, number>;
    scope: Map<string, number>;
  };
  totals: {
    modules: number;
    containers: number;
    shares: number;
    errors: number;
    warnings: number;
  };
}

/**
 * Derived results, keyed by the snapshot they came from.
 *
 * Both the adapter and the UI call `analyse` on each new snapshot -- the
 * adapter so a library consumer gets a resolved one, the UI because it owns the
 * `Analysis` object. That is two graph builds and two full diagnostic passes
 * per refresh, on every 500ms tick that changed anything. A snapshot is
 * immutable once analysed, so the second call can simply return the first
 * result. WeakMap so a superseded snapshot is still collectable.
 */
const cache = new WeakMap<Snapshot, Analysis>();

export function analyse(snapshot: Snapshot): Analysis {
  const cached = cache.get(snapshot);
  if (cached) {
    return cached;
  }

  resolveShares(snapshot);
  const graph = buildGraph(snapshot);
  snapshot.issues = findIssues(snapshot, graph);

  const facets = {
    stage: new Map<string, number>(),
    kind: new Map<string, number>(),
    container: new Map<string, number>(),
    scope: new Map<string, number>(),
  };
  const bump = (map: Map<string, number>, key: string | undefined) => {
    if (key === undefined) {
      return;
    }
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const m of snapshot.modules) {
    bump(facets.stage, m.stage);
    bump(facets.kind, m.kind);
    bump(facets.container, m.container?.name);
    bump(facets.scope, m.scope);
  }

  let shares = 0;
  for (const scope of snapshot.scopes) {
    shares += scope.keys.length;
  }

  const result: Analysis = {
    graph,
    facets,
    totals: {
      modules: snapshot.modules.length,
      containers: snapshot.containers.length,
      shares,
      errors: snapshot.issues.filter((i) => i.severity === "error").length,
      warnings: snapshot.issues.filter((i) => i.severity === "warn").length,
    },
  };
  cache.set(snapshot, result);
  return result;
}

export { buildGraph, neighbourhood, layerLayout } from "./graph.js";
export type { Graph } from "./graph.js";
export { resolveShares, consumersOf } from "./resolution.js";
export { findIssues } from "./issues.js";
export {
  parseQuery,
  filterModules,
  matches,
  toggleFacet,
  fuzzy,
} from "./search.js";
export type { Term } from "./search.js";
export { satisfies, maxSatisfying, compareVersionStrings, parseVersion } from "./semver.js";
