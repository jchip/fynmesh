import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { analyse } from "../src/analysis/index.js";
import { shareCount, showsResolution } from "../src/ui/views/containers.js";
import { minifiedSharePage, twoContainerPage } from "./fixture.js";

/**
 * `fynapp-design-tokens` is in the share store and nowhere else: no
 * registration, no container object, no `$SC` to read. Everything the
 * Containers view can say about it comes from an inferred provision, which is
 * the path both of these gaps lived on.
 */
function storeOnly() {
  const { loader, federation } = twoContainerPage();
  const s = collect({ loader, federation });
  analyse(s);
  return s.containers.find((c) => c.name === "fynapp-design-tokens")!.versions[0];
}

describe("container share count", () => {
  it("counts a store-only container's provisions, which are not consumes", () => {
    const v = storeOnly();
    expect(v.consumes).toHaveLength(0);
    expect(v.provides).toHaveLength(1);
    // the header read "no shares" for a container whose one job is a share
    expect(shareCount(v)).toBe(1);
  });

  it("counts a key declared and provided by the same container once", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    analyse(s);
    const v = s.containers.find((c) => c.name === "fynapp-min")!.versions[0];
    expect(v.consumes.map((d) => d.key).sort()).toEqual(["esm-react", "marko", "vue"]);
    expect(shareCount(v)).toBe(3);
  });
});

describe("share row resolution", () => {
  it("says nothing about resolution for a row with no declaration behind it", () => {
    const decl = storeOnly().provides[0];
    expect(decl.inferred).toBe(true);
    expect(decl.resolved?.version).toBeUndefined();
    expect(showsResolution(decl)).toBe(false);
  });

  it("still warns for a declared share that resolved to nothing", () => {
    // a container that asked for something and got nothing is the case the
    // warning was written for, and it keeps it
    expect(showsResolution({ key: "esm-react", shareScope: "fynmesh", versions: [] })).toBe(true);
  });

  it("reports the resolution of a declaration that has one", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    analyse(s);
    const v = s.containers.find((c) => c.name === "fynapp-min")!.versions[0];
    const react = v.consumes.find((d) => d.key === "esm-react")!;
    expect(react.resolved?.version).toBe("19.0.0");
    expect(showsResolution(react)).toBe(true);
  });
});
