import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { groupHead } from "../src/ui/views/modules.js";
import type { BundleNode } from "../src/core/model.js";
import { FakeContainer, FakeFederation, FakeLoader, combinedBundlePage } from "./fixture.js";

/**
 * `Snapshot.bundles` had no reader anywhere in `src/ui` (FYM-364). It is a
 * projection of the modules already on the Modules view -- `readBundles`
 * builds it from `modules.values()` -- so the only facts worth rendering are
 * the two the projection loses: the carrier's `loadedCount`, and its true
 * member count, which the row count is not once a filter is on.
 */
function bundlesOf(page: { loader: FakeLoader; federation: FakeFederation }): BundleNode[] {
  return collect({ loader: page.loader, federation: page.federation }).bundles;
}

describe("group header, non-bundle groupings", () => {
  it("prints the key and the row count, unchanged", () => {
    expect(groupHead("container", "fynapp-a@1.0.0", 4, [])).toEqual({
      label: "fynapp-a@1.0.0",
      summary: "4",
    });
    expect(groupHead("kind", "esm", 9, [])).toEqual({ label: "esm", summary: "9" });
  });

  it("says nothing extra about modules that arrived in a file of their own", () => {
    const bundles = bundlesOf(combinedBundlePage());
    expect(groupHead("bundle", "(own file)", 2, bundles)).toEqual({
      label: "(own file)",
      summary: "2",
    });
  });
});

describe("group header, bundle grouping", () => {
  const combo = "https://app.test/fynapp-combo/dist/combined-zzz.js";

  it("reads the carrier's own loaded tally, which no row could show", () => {
    const bundles = bundlesOf(combinedBundlePage());
    // four chunks in one file; the two never-instantiated ones are not loaded
    expect(bundles).toHaveLength(1);
    expect(bundles[0].url).toBe(combo);
    expect(bundles[0].members).toHaveLength(4);
    expect(bundles[0].loadedCount).toBe(2);

    const head = groupHead("bundle", combo, 4, bundles);
    expect(head.label).toBe("combined-zzz.js");
    expect(head.summary).toBe("4 modules · 2 loaded");
    // the full url is only ever hover text; the header prints the basename
    expect(head.title).toContain(combo);
  });

  it("does not pass a filtered row count off as the bundle's size", () => {
    const bundles = bundlesOf(combinedBundlePage());
    const head = groupHead("bundle", combo, 1, bundles);
    expect(head.summary).toBe("1 of 4 shown · 2 loaded");
  });

  it("says only what is on screen for a carrier the snapshot holds no record of", () => {
    const head = groupHead("bundle", "https://app.test/gone.js", 2, []);
    expect(head).toEqual({
      label: "gone.js",
      summary: "2",
      title: "https://app.test/gone.js",
    });
  });
});

/**
 * Two containers built with `federation-combine` emit two different files with
 * one basename. The grouping keyed on that basename, so both files' modules
 * landed in a single bucket whose count belonged to neither -- and the bucket
 * could not be joined to either `BundleNode`.
 */
function twoCombinedBundlesPage(): { loader: FakeLoader; federation: FakeFederation } {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  for (const app of ["fynapp-a", "fynapp-b"]) {
    const base = "https://app.test/" + app + "/dist/";
    const entry = base + "fynapp-entry.js";
    const combined = base + "combined.js";
    const member = base + "chunk-" + app + ".js";

    const c = new FakeContainer("__mf_container_" + app, app, "fynmesh", "1.0.0").expose(
      "./main",
      "./chunk-" + app + ".js"
    );
    loader
      .addRecord({ id: entry, n: { container: c, init: () => {}, get: () => {} }, d: [] })
      .addRecord({ id: member, n: { main: 1 }, d: [] });
    loader
      .addRegistration("__mf_container_" + app, { url: entry }, "1.0.0")
      .addRegistration("./chunk-" + app + ".js", { url: member });
    federation.addBundle(member, combined);
  }

  return { loader, federation };
}

describe("two combined files sharing one basename", () => {
  it("keeps them apart, and each header joins its own carrier", () => {
    const bundles = bundlesOf(twoCombinedBundlesPage());
    expect(bundles.map((b) => b.url)).toEqual([
      "https://app.test/fynapp-a/dist/combined.js",
      "https://app.test/fynapp-b/dist/combined.js",
    ]);

    for (const b of bundles) {
      const head = groupHead("bundle", b.url, b.members.length, bundles);
      // both print "combined.js"; the hover text is what tells them apart
      expect(head.label).toBe("combined.js");
      expect(head.title).toContain(b.url);
      expect(head.summary).toBe("1 module · 1 loaded");
    }
  });

  it("a basename is not a bundle: neither carrier answers to the other's url", () => {
    const bundles = bundlesOf(twoCombinedBundlesPage());
    // the old key -- the basename alone -- names no BundleNode at all, which
    // is why the merged group could say nothing true about either file
    expect(groupHead("bundle", "combined.js", 2, bundles).title).toBe("combined.js");
  });
});
