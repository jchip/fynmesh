import { describe, expect, it } from "vitest";
import {
  MAX_NODES,
  depthOptions,
  depthTitle,
  labelFor,
  multiVersionNames,
  resolveFocus,
} from "../src/ui/views/graph.js";
import { buildGraph, reachByDepth } from "../src/analysis/graph.js";
import { emptySnapshot } from "../src/core/model.js";
import type { ContainerNode, ModuleNode } from "../src/core/model.js";

/** the fields a node label reads; the rest of a ModuleNode is irrelevant here */
function mod(partial: Partial<ModuleNode>): ModuleNode {
  return {
    id: "https://app.test/x/dist/chunk.js",
    kind: "chunk",
    stage: "executed",
    aliases: [],
    deps: [],
    dependents: [],
    loader: 0,
    seq: 0,
    ...partial,
  };
}

function container(name: string, versions: string[]): ContainerNode {
  return {
    name,
    id: "__mf_container_" + name,
    versions: versions.map((version) => ({
      version,
      entryId: "__mf_container_" + name,
      stage: "executed",
      scope: "fynmesh",
      exposes: [],
      provides: [],
      consumes: [],
      moduleIds: [],
    })),
  };
}

/*
 * `demo/fynapp-x1-v1` and `demo/fynapp-x1-v2` both publish the container name
 * `fynapp-x1`, at 1.0.0 and 2.0.0. Two live versions of one name is what this
 * whole tool exists for, and on the graph it was the one thing the picture did
 * not say: a `main.js` from each read identically.
 */
describe("graph node labels", () => {
  const twoLive = [container("fynapp-x1", ["1.0.0", "2.0.0"]), container("fynapp-1", ["1.0.0"])];
  const multi = multiVersionNames(twoLive);

  it("names the container of a container with one live version", () => {
    expect(multi.has("fynapp-1")).toBe(false);
    expect(
      labelFor(mod({ container: { name: "fynapp-1", version: "1.0.0" } }), multi).sub
    ).toBe("fynapp-1");
  });

  it("tells two live versions of one container apart", () => {
    const v1 = labelFor(mod({ container: { name: "fynapp-x1", version: "1.0.0" } }), multi);
    const v2 = labelFor(mod({ container: { name: "fynapp-x1", version: "2.0.0" } }), multi);
    expect(v1.sub).toBe("fynapp-x1@1.0.0");
    expect(v2.sub).toBe("fynapp-x1@2.0.0");
    expect(v1.sub).not.toBe(v2.sub);
  });

  it("reads the version count off the containers list, not off the id", () => {
    // the v1/v2 in the url is the demo's directory convention, and nothing the
    // loader or federation promises -- with one version live it says nothing
    const one = multiVersionNames([container("fynapp-x1", ["2.0.0"])]);
    expect(
      labelFor(
        mod({
          id: "https://app.test/fynapp-x1-v2/dist/main.js",
          container: { name: "fynapp-x1", version: "2.0.0" },
        }),
        one
      ).sub
    ).toBe("fynapp-x1");
  });

  it("keeps a shared module labelled by its own version", () => {
    const label = labelFor(
      mod({ shareKey: "esm-react", version: "19.0.0", container: { name: "fynapp-x1" } }),
      multi
    );
    expect(label).toEqual({ main: "esm-react", sub: "19.0.0" });
  });

  it("puts the version alone under a container entry, whose name is the main line", () => {
    expect(
      labelFor(
        mod({ kind: "container-entry", container: { name: "fynapp-x1", version: "2.0.0" } }),
        multi
      )
    ).toEqual({ main: "fynapp-x1", sub: "@2.0.0" });
  });

  it("labels a module with no container by its filename alone", () => {
    expect(labelFor(mod({ id: "https://app.test/x/dist/thing-a1b2c3d4.js" }), multi)).toEqual({
      main: "thing.js",
      sub: undefined,
    });
  });

  /*
   * The sub-line clips at 26 characters, which is the 168px node width in
   * 9.5px monospace. `name@version` has to survive that intact or the version
   * was not worth adding.
   */
  it("keeps a container@version inside the node's text budget", () => {
    expect("fynapp-x1@2.0.0".length).toBeLessThanOrEqual(26);
    expect("fynapp-react-lib@19.0.0".length).toBeLessThanOrEqual(26);
  });
});

/** a graph from an id -> dependency-ids map, the way buildGraph will see it */
function graphOf(deps: Record<string, string[]>) {
  const snapshot = emptySnapshot();
  snapshot.modules = Object.entries(deps).map(([id, to], seq) =>
    mod({ id, seq, deps: to.map((d) => ({ id: d })) })
  );
  return buildGraph(snapshot);
}

/*
 * `selected` is one signal for the whole panel, and Containers and Shares
 * write container names and entry urls into it. The graph looks selections up
 * as module ids, so "a selection this graph has no node for" is a state a
 * reader reaches by clicking a container and switching tab -- and the view has
 * to say which of the two things it drew.
 */
describe("graph focus resolution", () => {
  const graph = graphOf({ "app.js": ["dep.js"], "dep.js": [] });

  it("focuses a selection the graph has a node for", () => {
    expect(resolveFocus(graph, "app.js")).toEqual({ focus: "app.js" });
  });

  it("reports a selection the graph has no node for instead of focusing it", () => {
    // what clicking `fynapp-x1` in Containers leaves behind
    expect(resolveFocus(graph, "fynapp-x1")).toEqual({ missing: "fynapp-x1" });
  });

  it("has neither focus nor missing selection when nothing is selected", () => {
    expect(resolveFocus(graph, undefined)).toEqual({ missing: undefined });
  });
});

/**
 * A tree wide and deep enough that the cap bites before the graph runs out.
 *
 * Built rather than written: the cap is 320 nodes and the point is what
 * happens on the far side of it, so the fixture has to be bigger than anything
 * worth typing. Branching 8 ways puts 585 nodes within 3 hops of the root and
 * 593 within 4 -- two depths whose true reach differs, and which the view
 * draws identically.
 */
function wideTree(branch: number, levels: number): Record<string, string[]> {
  const deps: Record<string, string[]> = { root: [] };
  let frontier = ["root"];
  let next = 0;
  for (let level = 0; level < levels; level++) {
    const born: string[] = [];
    for (const parent of frontier) {
      for (let i = 0; i < branch; i++) {
        const id = "n" + next++;
        deps[id] = [];
        deps[parent].push(id);
        born.push(id);
      }
    }
    // one branch carries on alone, so the last level adds something without
    // multiplying the whole tree by `branch` again
    frontier = level === levels - 2 ? born.slice(0, 1) : born;
  }
  return deps;
}

/*
 * FYM-310 put a node count on each depth button so a depth that reaches no
 * further could be told apart from one that does. Past MAX_NODES the count and
 * the picture part company: the neighbourhood keeps growing, the view keeps
 * drawing 320, and two buttons advertising 585 and 593 would both redraw the
 * same capped graph.
 */
describe("graph depth options", () => {
  const graph = graphOf(wideTree(8, 4));
  const reach = reachByDepth(graph, "root", 4);
  const options = depthOptions(reach, [1, 2, 3, 4], MAX_NODES);

  it("has a fixture that outgrows the cap at depth 3 and keeps growing after it", () => {
    expect(reach).toEqual([9, 73, 585, 593]);
    expect(reach[2]).toBeGreaterThan(MAX_NODES);
    expect(reach[3]).toBeGreaterThan(reach[2]);
  });

  it("advertises what the view will draw, not what the neighbourhood holds", () => {
    expect(options.map((o) => o.nodes)).toEqual([9, 73, MAX_NODES, MAX_NODES]);
  });

  it("closes a depth the cap flattened, on the same rule as one the graph closed", () => {
    // depth 3 is the first to hit the cap and draws more than depth 2; depth 4
    // adds nothing to the picture, so it is as dead as any other closed depth
    expect(options.map((o) => o.closed)).toEqual([false, false, false, true]);
  });

  it("says the cap is in force, so two buttons reading 320 explain themselves", () => {
    expect(options.map((o) => o.capped)).toEqual([false, false, true, true]);
    expect(depthTitle(options[2], MAX_NODES)).toBe(
      "depth 3 reaches past the 320-node cap, so it draws 320 nodes"
    );
    expect(depthTitle(options[3], MAX_NODES)).toBe(
      "depth 4 draws the same 320 nodes as depth 3: both reach past the 320-node cap"
    );
  });

  it("leaves a graph under the cap saying exactly what it says today", () => {
    const small = depthOptions([3, 7, 7, 7], [1, 2, 3, 4], MAX_NODES);
    expect(small.map((o) => o.nodes)).toEqual([3, 7, 7, 7]);
    expect(small.map((o) => o.capped)).toEqual([false, false, false, false]);
    expect(depthTitle(small[1], MAX_NODES)).toBe("depth 2 reaches 7 nodes");
    expect(depthTitle(small[2], MAX_NODES)).toBe("depth 3 reaches the same 7 nodes as depth 2");
  });

  it("does not call a neighbourhood that fits exactly capped", () => {
    // 320 drawn out of 320 dropped nothing; only more than the cap is capped
    const exact = depthOptions([MAX_NODES, MAX_NODES], [1, 2], MAX_NODES);
    expect(exact[0]).toEqual({ hops: 1, nodes: MAX_NODES, capped: false, closed: false });
    expect(exact[1].closed).toBe(true);
  });
});
