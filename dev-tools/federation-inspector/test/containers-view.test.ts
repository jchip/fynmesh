import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { analyse } from "../src/analysis/index.js";
import {
  absentManifestSections,
  describeManifestEntry,
  importExposedRows,
  manifestDialect,
  manifestEntries,
  manifestSectionState,
  scopeCell,
  shareCount,
  showsResolution,
} from "../src/ui/views/containers.js";
import type { FynAppManifest } from "../src/core/model.js";
import { minifiedSharePage, twoContainerPage, unreadableScopePage } from "./fixture.js";

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

/*
 * Manifest fixtures.
 *
 * Three shapes, because the view has to tell them apart: a create-fynapp
 * enriched manifest carrying every key, a plain rollup-plugin manifest
 * carrying none of them, and an enriched one whose keys are declared and
 * empty. The last two render almost identically and mean opposite things.
 */
const enriched: FynAppManifest = {
  name: "fynapp-1",
  version: "1.0.0",
  exposes: { "./main": "./main-aaa.js" },
  "consume-shared": { "esm-react": { semver: "^19.0.0" } },
  "provide-shared": { "esm-react": { version: "19.2.8" } },
  "import-exposed": {
    "fynapp-2": {
      "./main": { semver: "^1.0.0", type: "module", sites: ["src/main.ts"] },
      "./middleware/design-tokens": {
        semver: "^1.0.0",
        type: "middleware",
        middlewareName: "design-tokens",
        sites: ["src/main.ts", "src/panel.ts"],
      },
    },
  },
  "shared-providers": { "fynapp-react-lib": { semver: "^19.0.0", provides: ["esm-react"] } },
};

const generic: FynAppManifest = {
  name: "test-nested-deps",
  version: "1.0.0",
  exposes: {},
  shared: { "esm-react": { singleton: true, semver: "^18.0.0" } },
};

const declaredEmpty: FynAppManifest = {
  name: "fynapp-3",
  version: "1.0.0",
  "consume-shared": {},
  "provide-shared": {},
  "import-exposed": {},
  "shared-providers": {},
};

describe("manifest sections", () => {
  it("separates a key that is missing from a key declared with nothing in it", () => {
    // the distinction the whole block exists for: both used to render as no row
    expect(manifestSectionState(generic, "provide-shared")).toBe("absent");
    expect(manifestSectionState(declaredEmpty, "provide-shared")).toBe("empty");
    expect(manifestSectionState(enriched, "provide-shared")).toBe("filled");
  });

  it("names every known key a plain rollup-plugin manifest does not carry", () => {
    expect(absentManifestSections(generic)).toEqual([
      "import-exposed",
      "consume-shared",
      "provide-shared",
      "shared-providers",
    ]);
    expect(absentManifestSections(declaredEmpty)).toEqual([]);
    expect(absentManifestSections(enriched)).toEqual([]);
  });

  it("reports a key holding something unreadable as declared, not as missing", () => {
    expect(manifestSectionState({ "consume-shared": "yes" } as any, "consume-shared")).toBe("empty");
  });

  it("reads the entries of a section and nothing from one that has none", () => {
    expect(manifestEntries(enriched, "consume-shared").map(([k]) => k)).toEqual(["esm-react"]);
    expect(manifestEntries(generic, "consume-shared")).toEqual([]);
    expect(manifestEntries(declaredEmpty, "consume-shared")).toEqual([]);
  });
});

describe("manifest dialect", () => {
  it("reads `shared` as the plain-plugin build, in both directions", () => {
    // the only key that discriminates: create-fynapp never writes it, and the
    // plugin's fallback always does -- even when it is empty
    expect(manifestDialect(generic)).toBe("generic");
    expect(manifestDialect({ name: "x", version: "1", exposes: {}, shared: {} })).toBe("generic");
    expect(manifestDialect(enriched)).toBe("fynapp");
    expect(manifestDialect(declaredEmpty)).toBe("fynapp");
    // an enriched manifest with nothing to declare is still enriched
    expect(manifestDialect({ name: "x", version: "1", exposes: {} })).toBe("fynapp");
  });
});

describe("import-exposed rows", () => {
  it("gives one row per import, not one per app", () => {
    const rows = importExposedRows(enriched);
    expect(rows.map((r) => r.path)).toEqual(["./main", "./middleware/design-tokens"]);
    expect(rows.every((r) => r.app === "fynapp-2")).toBe(true);
  });

  it("keeps the type, the middleware name and the importing source files", () => {
    const [module, middleware] = importExposedRows(enriched);
    expect(module.type).toBe("module");
    expect(module.middlewareName).toBeUndefined();
    expect(module.sites).toEqual(["src/main.ts"]);
    expect(middleware.type).toBe("middleware");
    expect(middleware.middlewareName).toBe("design-tokens");
    expect(middleware.sites).toHaveLength(2);
  });

  it("leaves sites undefined when the build recorded none, rather than empty", () => {
    // "not recorded" and "recorded as nowhere" are different findings
    const rows = importExposedRows({
      "import-exposed": { "fynapp-2": { "./main": { semver: "^1.0.0" } } },
    });
    expect(rows[0].sites).toBeUndefined();
    expect(rows[0].type).toBeUndefined();
    expect(importExposedRows(declaredEmpty)).toEqual([]);
    expect(importExposedRows(generic)).toEqual([]);
  });

  it("skips an app entry that is not a record of imports", () => {
    expect(importExposedRows({ "import-exposed": { "fynapp-2": null } } as any)).toEqual([]);
  });
});

describe("manifest entry summaries", () => {
  it("prefers the fields the three share keys actually carry", () => {
    expect(describeManifestEntry({ semver: "^19.0.0" })).toBe("^19.0.0");
    expect(describeManifestEntry({ version: "19.2.8" })).toBe("19.2.8");
    expect(describeManifestEntry({ provides: ["esm-react"], semver: "^19.0.0" })).toBe(
      "esm-react ^19.0.0"
    );
  });

  it("falls back to the raw json rather than rendering a key with nothing beside it", () => {
    expect(describeManifestEntry({ requireVersion: "19" })).toBe('{"requireVersion":"19"}');
    expect(describeManifestEntry({})).toBe("{}");
  });
});

describe("empty manifest sections", () => {
  it("treats an app key with no imports under it as declared-and-empty", () => {
    // `import-exposed` is two levels deep, so non-empty at the top is not
    // the same as having a row to draw
    const m: FynAppManifest = { "import-exposed": { "fynapp-2": {} } };
    expect(manifestSectionState(m, "import-exposed")).toBe("filled");
    expect(importExposedRows(m)).toEqual([]);
  });
});

/**
 * The scope cell.
 *
 * The row printed `scope {v.scope}` with no branch, because the collector
 * guaranteed a string by inventing one. `default` is a real module federation
 * scope name, so "could not be read" and "is named `default`" were the same
 * pixels. What the cell must never do is print a name nobody read.
 */
describe("container scope cell", () => {
  it("prints the name a container declares for itself", () => {
    const { loader, federation } = twoContainerPage();
    const s = collect({ loader, federation });
    const v = s.containers.find((c) => c.name === "fynapp-1")!.versions[0];
    expect(scopeCell(v).text).toBe("scope fynmesh");
    expect(scopeCell(v).title).toContain("declares as its own");
  });

  it("says where a store-derived name came from, in the same words", () => {
    const v = storeOnly();
    // same text -- it is a name either way -- and a tooltip that does not
    // claim the container said it
    expect(scopeCell(v).text).toBe("scope fynmesh");
    expect(scopeCell(v).title).toContain("share store");
  });

  it("says it could not be read rather than naming a scope", () => {
    const { loader, federation } = unreadableScopePage();
    const s = collect({ loader, federation });
    const v = s.containers.find((c) => c.name === "fynapp-ghost")!.versions[0];
    expect(scopeCell(v).text).toBe("scope unreadable");
    // "unreadable", not "none": every container is built with a scope, so an
    // absence claim here would be a different and false one
    expect(scopeCell(v).text).not.toContain("no scope");
    expect(scopeCell(v).title).toContain("could not be read");
  });
});
