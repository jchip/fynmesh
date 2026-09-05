import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { analyse } from "../src/analysis/index.js";
import { buildGraph } from "../src/analysis/graph.js";
import { satisfies, maxSatisfying, compareVersionStrings } from "../src/analysis/semver.js";
import {
  parseQuery,
  filterModules,
  filterScopes,
  toggleFacet,
  fuzzy,
} from "../src/analysis/search.js";
import { emptySnapshot } from "../src/core/model.js";
import type { ModuleNode } from "../src/core/model.js";
import { FakeLoader, twoContainerPage } from "./fixture.js";

function snap() {
  const { loader, federation } = twoContainerPage();
  const s = collect({ loader, federation });
  analyse(s);
  return s;
}

describe("semver", () => {
  it("matches the range forms a federation build emits", () => {
    expect(satisfies("19.0.0", "^19.0.0")).toBe(true);
    expect(satisfies("19.2.5", "^19.0.0")).toBe(true);
    expect(satisfies("20.0.0", "^19.0.0")).toBe(false);
    expect(satisfies("18.3.1", "^19.0.0")).toBe(false);
    expect(satisfies("0.2.5", "^0.2.0")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.0")).toBe(false);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("1.9.9", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
    expect(satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfies("3.0.0", "^1.0.0 || ^3.0.0")).toBe(true);
    expect(satisfies("1.5.0", "1.2.3 - 2.0.0")).toBe(true);
    expect(satisfies("9.9.9", "*")).toBe(true);
  });

  it("says 'cannot tell' rather than 'no' for something it cannot parse", () => {
    // reporting an unparseable range as a violation would manufacture issues
    // out of this matcher's own limits
    expect(satisfies("1.0.0", "workspace:^")).toBeUndefined();
    expect(satisfies("not-a-version", "^1.0.0")).toBeUndefined();
  });

  it("sorts pre-releases below their release", () => {
    expect(compareVersionStrings("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareVersionStrings("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
  });

  it("picks the highest satisfying version", () => {
    expect(maxSatisfying(["18.3.1", "19.0.0", "19.2.0"], "^19.0.0")).toBe("19.2.0");
    expect(maxSatisfying(["18.3.1"], "^19.0.0")).toBeUndefined();
  });
});

describe("graph", () => {
  it("finds roots, dependents and depth", () => {
    const s = snap();
    const g = buildGraph(s);
    const main = "https://app.test/fynapp-1/dist/main-aaa.js";
    const react = "https://app.test/react-19/dist/react.js";
    expect(g.out.get(main)).toContain(react);
    expect(g.in.get(react)).toContain(main);
    expect(g.roots).toContain(main);
    expect(g.depth.get(react)).toBe(1);
  });

  it("detects a cycle without recursing", () => {
    const loader = new FakeLoader();
    const a: any = { id: "a", d: [] };
    const b: any = { id: "b", d: [] };
    const c: any = { id: "c", d: [] };
    a.d = [b];
    b.d = [c];
    c.d = [a];
    loader.addRecord(a).addRecord(b).addRecord(c);

    const s = collect({ loader, federation: null });
    const g = buildGraph(s);
    expect(g.cycles).toHaveLength(1);
    expect(g.cycles[0].sort()).toEqual(["a", "b", "c"]);
    expect(g.inCycle.has("b")).toBe(true);
  });

  it("survives a chain deeper than the JS stack would allow recursively", () => {
    const loader = new FakeLoader();
    const recs: any[] = [];
    for (let i = 0; i < 8000; i++) {
      recs.push({ id: "m" + i, d: [] });
    }
    for (let i = 0; i < recs.length - 1; i++) {
      recs[i].d = [recs[i + 1]];
    }
    for (const r of recs) {
      loader.addRecord(r);
    }
    const s = collect({ loader, federation: null });
    expect(() => buildGraph(s)).not.toThrow();
  });
});

describe("share resolution", () => {
  it("resolves a singleton to the loaded copy and flags the loser", () => {
    const s = snap();
    const one = s.containers.find((c) => c.name === "fynapp-1")!.versions[0];
    const two = s.containers.find((c) => c.name === "fynapp-2")!.versions[0];

    const r1 = one.consumes.find((d) => d.key === "esm-react")!.resolved!;
    const r2 = two.consumes.find((d) => d.key === "esm-react")!.resolved!;

    // both collapse onto the same copy, because it is a singleton
    expect(r1.version).toBe(r2.version);
    expect(r1.version).toBe("19.0.0");
    // fynapp-1 asked for ^19 and got it; fynapp-2 asked for ^18 and did not
    expect(r1.satisfies).toBe(true);
    expect(r2.satisfies).toBe(false);
    expect(r2.reason).toContain("does not satisfy");
  });

  it("records consumers back onto the share version", () => {
    const s = snap();
    const react = s.scopes[0].keys.find((k) => k.key === "esm-react")!;
    const chosen = react.versions.find((v) => v.version === "19.0.0")!;
    expect(chosen.consumers.map((c) => c.container).sort()).toEqual([
      "fynapp-1",
      "fynapp-2",
    ]);
    expect(chosen.consumers.find((c) => c.container === "fynapp-2")!.satisfied).toBe(false);
  });

  it("marks the key singleton when any container asserted it", () => {
    const s = snap();
    const react = s.scopes[0].keys.find((k) => k.key === "esm-react")!;
    expect(react.singleton).toBe(true);
  });

  it("marks it singleton in a bare collect(), without analyse()", () => {
    // the DevTools/library path reads the snapshot as plain JSON; every key
    // used to come back singleton:false there, including asserted ones
    const { loader, federation } = twoContainerPage();
    const s = collect({ loader, federation });
    const react = s.scopes[0].keys.find((k) => k.key === "esm-react")!;
    expect(react.singleton).toBe(true);
    expect(s.scopes[0].keys.find((k) => k.key === "design-tokens")!.singleton).toBe(false);
  });
});

describe("issues", () => {
  it("reports a singleton with two live copies as an error", () => {
    const s = snap();
    const issue = s.issues.find((i) => i.code === "singleton-multiple-copies")!;
    expect(issue).toBeTruthy();
    expect(issue.severity).toBe("error");
    expect(issue.title).toContain("esm-react");
    expect(issue.detail).toContain("19.0.0");
    expect(issue.detail).toContain("18.3.1");
  });

  it("reports the failed module and its blast radius", () => {
    const s = snap();
    const issue = s.issues.find((i) => i.code === "module-errored")!;
    expect(issue.severity).toBe("error");
    expect(issue.detail).toContain("boom");
  });

  it("reports a share declared but never provided", () => {
    const s = snap();
    const issue = s.issues.find((i) => i.code === "share-not-provided")!;
    expect(issue.title).toContain("design-tokens");
  });

  it("reports a consumer whose range excludes what it got", () => {
    const s = snap();
    const issue = s.issues.find((i) => i.code === "range-unsatisfied")!;
    expect(issue.title).toContain("fynapp-2");
  });

  it("attaches share issues to their key for inline display", () => {
    const s = snap();
    const react = s.scopes[0].keys.find((k) => k.key === "esm-react")!;
    expect(react.issues.some((i) => i.code === "singleton-multiple-copies")).toBe(true);
  });

  it("finds the same url reachable under two ids", () => {
    const loader = new FakeLoader()
      .addRecord({ id: "https://x.test/a.js", d: [] })
      .addRecord({ id: "./a.js", d: [] });
    loader.addRegistration("./a.js", { url: "https://x.test/a.js" });

    const s = collect({ loader, federation: null });
    analyse(s);
    expect(s.issues.some((i) => i.code === "duplicate-address")).toBe(true);
  });

  it("says nothing when there is nothing wrong", () => {
    const s = emptySnapshot();
    analyse(s);
    expect(s.issues).toEqual([]);
  });
});

describe("search", () => {
  const mods = (): ModuleNode[] => snap().modules;

  it("fuzzy-matches a subsequence of the id", () => {
    expect(fuzzy("erd", "esm-react-dom")).toBe(true);
    expect(fuzzy("xyz", "esm-react-dom")).toBe(false);
  });

  it("parses fields, negation and numeric comparison", () => {
    const terms = parseQuery("react container:fynapp-1 -stage:executed deps:>2");
    expect(terms[0]).toMatchObject({ value: "react", negated: false });
    expect(terms[1]).toMatchObject({ field: "container", value: "fynapp-1" });
    expect(terms[2]).toMatchObject({ field: "stage", negated: true });
    expect(terms[3]).toMatchObject({ field: "deps", op: ">", num: 2 });
  });

  it("filters by container and by stage", () => {
    const all = mods();
    expect(filterModules(all, "container:fynapp-1").length).toBeGreaterThan(0);
    expect(
      filterModules(all, "container:fynapp-1").every((m) => m.container?.name === "fynapp-1")
    ).toBe(true);
    expect(filterModules(all, "stage:errored")).toHaveLength(1);
    expect(filterModules(all, "-stage:errored").length).toBe(all.length - 1);
  });

  it("matches an exact id, which is what a deep link uses", () => {
    const all = mods();
    const target = all[0].id;
    expect(filterModules(all, "id:" + target)).toHaveLength(1);
  });

  it("toggles a facet off when it is already on", () => {
    expect(toggleFacet("", "stage", "errored")).toBe("stage:errored");
    expect(toggleFacet("stage:errored", "stage", "errored")).toBe("");
    // a single-valued field replaces rather than accumulates
    expect(toggleFacet("stage:errored", "stage", "linked")).toBe("stage:linked");
    expect(toggleFacet("react stage:errored", "stage", "linked")).toBe("react stage:linked");
  });
});

describe("share filter", () => {
  it("matches share keys by substring, and scope names too", () => {
    const s = snap();
    expect(filterScopes(s.scopes, "react")[0].keys.map((k) => k.key)).toEqual(["esm-react"]);
    // a scope-name match keeps every key in that scope
    expect(filterScopes(s.scopes, "fynmesh")[0].keys.length).toBe(s.scopes[0].keys.length);
    expect(filterScopes(s.scopes, "nothing-here")).toEqual([]);
  });

  it("treats container: as a facet rather than literal text", () => {
    const s = snap();
    // the facet the other tabs write; it used to be matched against key names
    // and so emptied the tab
    const only = filterScopes(s.scopes, "container:fynapp-2");
    expect(only.length).toBe(1);
    expect(only[0].keys.map((k) => k.key)).toContain("esm-react");
    expect(filterScopes(s.scopes, "container:no-such-app")).toEqual([]);
  });

  it("narrows to the versions that container touches, and recounts loaded", () => {
    const s = snap();
    const react = filterScopes(s.scopes, "container:fynapp-1")[0].keys.find(
      (k) => k.key === "esm-react"
    )!;
    const all = s.scopes[0].keys.find((k) => k.key === "esm-react")!;
    expect(all.versions.length).toBeGreaterThan(react.versions.length);
    expect(react.loadedCount).toBe(react.versions.filter((v) => v.loaded).length);
  });

  it("combines a container facet with a key substring", () => {
    const s = snap();
    expect(filterScopes(s.scopes, "container:fynapp-1 react")[0].keys.map((k) => k.key)).toEqual([
      "esm-react",
    ]);
    expect(filterScopes(s.scopes, "container:fynapp-1 vue")).toEqual([]);
  });

  it("does not mutate the snapshot it filters", () => {
    const s = snap();
    const before = JSON.stringify(s.scopes);
    filterScopes(s.scopes, "container:fynapp-1");
    expect(JSON.stringify(s.scopes)).toBe(before);
  });
});

describe("analysis is idempotent", () => {
  it("does not accumulate on a re-analysed snapshot", () => {
    // the live poll re-analyses the same snapshot object every 500ms, so
    // anything analysis writes back has to be replaced, not appended
    const { loader, federation } = twoContainerPage();
    const s = collect({ loader, federation });

    analyse(s);
    const first = {
      issues: s.issues.length,
      keyIssues: s.scopes[0].keys.map((k) => k.issues.length),
      consumers: s.scopes[0].keys.flatMap((k) => k.versions.map((v) => v.consumers.length)),
    };

    analyse(s);
    analyse(s);

    expect(s.issues.length).toBe(first.issues);
    expect(s.scopes[0].keys.map((k) => k.issues.length)).toEqual(first.keyIssues);
    expect(
      s.scopes[0].keys.flatMap((k) => k.versions.map((v) => v.consumers.length))
    ).toEqual(first.consumers);
  });
});

describe("analysis caching", () => {
  it("returns the same derived result for the same snapshot", () => {
    // the adapter and the UI both analyse each snapshot; without a cache that
    // is two graph builds and two diagnostic passes per 500ms tick
    const { loader, federation } = twoContainerPage();
    const s = collect({ loader, federation });

    const a = analyse(s);
    const b = analyse(s);
    expect(b).toBe(a);
    expect(b.graph).toBe(a.graph);

    // a genuinely new snapshot still gets its own analysis
    const s2 = collect({ loader, federation });
    expect(analyse(s2)).not.toBe(a);
  });
});

describe("distinguishing urls", () => {
  it("widens the tail until two container entries differ", async () => {
    const { distinguishingTails } = await import("../src/util/format.js");
    // both versions of one container are ".../dist/fynapp-entry.js"; the
    // deployment directory is the only thing that tells them apart
    expect(
      distinguishingTails([
        "http://x/fynapp-react-19/dist/fynapp-entry.js",
        "http://x/fynapp-react-18/dist/fynapp-entry.js",
      ])
    ).toEqual([
      "fynapp-react-19/dist/fynapp-entry.js",
      "fynapp-react-18/dist/fynapp-entry.js",
    ]);
    // already distinct at the default width: stay short
    expect(
      distinguishingTails(["http://x/a/dist/one.js", "http://x/a/dist/two.js"])
    ).toEqual(["dist/one.js", "dist/two.js"]);
  });
});
