/**
 * The three expose levels, and the guardrail that keeps two tabs from printing
 * different numbers for one of them.
 *
 * `fynapp-1` on the demo read `2/5 exposes loaded` on Containers, `ex 1/5` on
 * FynApps, and carried no such field at all in the snapshot behind them. None
 * of the three was lying; they were three questions wearing one word. These
 * tests pin all three to the numbers a real collect produced, and then assert
 * that wherever two views project the *same* level, they agree -- so a future
 * divergence fails here instead of waiting for someone to notice it in a
 * browser, which is how this one was found.
 */

import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import {
  containerExposeLevels,
  fynAppExposeLevels,
  inlinedExposes,
} from "../src/core/exposes.js";
import { exposeTitle, exposesTitle } from "../src/ui/views/containers.js";
import { importedTitle, notImportedTitle } from "../src/ui/views/fynapps.js";
import type { ContainerVersionNode, Snapshot } from "../src/core/model.js";
import { twoContainerPage } from "./fixture.js";
import {
  designTokensPage,
  devKernel,
  fakeFynApp,
  fakeUnit,
  fynApp1Page,
  libOnlyPage,
} from "./kernel-fixture.js";

function versionOf(snap: Snapshot, name: string, version: string): ContainerVersionNode {
  const c = snap.containers.find((x) => x.name === name);
  if (!c) {
    throw new Error(`no container ${name} in [${snap.containers.map((x) => x.name)}]`);
  }
  const v = c.versions.find((x) => x.version === version);
  if (!v) {
    throw new Error(`no ${name}@${version} in [${c.versions.map((x) => x.version)}]`);
  }
  return v;
}

/**
 * Every FynApp's exposes, as both tabs would render them.
 *
 * The Containers view has only the container version; the FynApps view has only
 * the FynApp node. This walks the join the collector already made and returns
 * the pair, which is the thing that has to match.
 */
function crossViewPairs(snap: Snapshot) {
  const pairs: Array<{
    key: string;
    container: ReturnType<typeof containerExposeLevels>;
    app: ReturnType<typeof fynAppExposeLevels>;
  }> = [];
  for (const app of snap.fynmesh?.apps ?? []) {
    if (!app.containerVersion) {
      continue;
    }
    pairs.push({
      key: app.key,
      container: containerExposeLevels(versionOf(snap, app.name, app.containerVersion)),
      app: fynAppExposeLevels(app),
    });
  }
  return pairs;
}

describe("the three expose levels, on the page they were found on", () => {
  const snap = (() => {
    const { loader, federation, kernel } = fynApp1Page();
    return collect({ loader, federation, kernel });
  })();

  /*
   * The exact numbers off `.temp/collect.json`. Any one of them drifting means
   * a level changed meaning, which is the failure this file exists for.
   */
  it("counts 5 declared, 2 loaded and 1 imported for fynapp-1", () => {
    const levels = containerExposeLevels(versionOf(snap, "fynapp-1", "1.0.0"));
    expect(levels.declared).toHaveLength(5);
    expect(levels.loaded).toEqual(["./App", "./main"]);
    expect(levels.imported).toEqual(["./main"]);
  });

  /*
   * The reason collapsing the three to one number would have destroyed
   * information: `./App` really is in the loader and really was never imported
   * as an expose. `./main` pulled its chunk in.
   */
  it("keeps a chunk a sibling pulled in separate from an imported expose", () => {
    const v = versionOf(snap, "fynapp-1", "1.0.0");
    const app = v.exposes.find((e) => e.name === "./App")!;
    expect(app.loaded).toBe(true);
    expect(app.imported).toBe(false);
    const main = v.exposes.find((e) => e.name === "./main")!;
    expect(main.loaded).toBe(true);
    expect(main.imported).toBe(true);
  });

  it("reports a declared expose nothing ever fetched as neither", () => {
    const v = versionOf(snap, "fynapp-1", "1.0.0");
    for (const name of ["./hello", "./getInfo", "./component"]) {
      const e = v.exposes.find((x) => x.name === name)!;
      expect(e.stage).toBeUndefined();
      expect(e.loaded).toBe(false);
      expect(e.imported).toBe(false);
    }
  });

  it("names the level in every rendered label, so no two read the same", () => {
    const v = versionOf(snap, "fynapp-1", "1.0.0");
    const levels = containerExposeLevels(v);
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-1@1.0.0")!;

    // what the collapsed Containers header prints, and what FynApps prints
    expect(`${levels.loaded!.length}/${levels.declared.length} chunks loaded`).toBe(
      "2/5 chunks loaded"
    );
    expect(`${levels.imported!.length}/${levels.declared.length} imported`).toBe("1/5 imported");
    const appLevels = fynAppExposeLevels(app);
    expect(`${appLevels.imported!.length}/${appLevels.declared.length} imported`).toBe(
      "1/5 imported"
    );

    expect(exposesTitle(levels)).toContain("2 whose chunk the loader has");
    expect(exposesTitle(levels)).toContain("1 the kernel imported");
    expect(importedTitle(appLevels)).toContain("1 of 5 declared exposes were imported");
    expect(exposeTitle(v.exposes.find((e) => e.name === "./App")!)).toContain(
      "the kernel never imported this expose"
    );
  });
});

/**
 * The guardrail. `imported` is the one level two views both project, so it is
 * the one that can diverge -- and it did.
 */
describe("cross-view agreement on the imported level", () => {
  function assertAgrees(snap: Snapshot) {
    const pairs = crossViewPairs(snap);
    expect(pairs.length).toBeGreaterThan(0);
    for (const { key, container, app } of pairs) {
      // absence agrees too: neither tab may claim a number the other calls
      // unknowable. `0/0 imported` beside a container row silent on imported is
      // the same bug in a quieter font.
      expect(container.imported === undefined, key).toBe(app.imported === undefined);
      // whether an expose has a chunk at all is one fact, and a joined pair has
      // it from one derivation -- the FynApps tooltip promising a chunk the
      // Containers tab says was inlined away is what happens when it is two
      expect(container.inlined, key).toEqual(app.inlined);
      if (!container.imported || !app.imported) {
        continue;
      }
      expect(container.imported, key).toEqual(app.imported);
      expect(container.declared.slice().sort(), key).toEqual(app.declared.slice().sort());
    }
  }

  it("holds for the fynapp-1 page", () => {
    const { loader, federation, kernel } = fynApp1Page();
    assertAgrees(collect({ loader, federation, kernel }));
  });

  it("holds when a FynApp imported every expose it declared", () => {
    const { loader, federation } = twoContainerPage();
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-1",
          version: "1.0.0",
          exposes: { "./main": fakeUnit(["execute"]) },
          declared: ["./main"],
        }),
      ],
    });
    assertAgrees(collect({ loader, federation, kernel }));
  });

  it("holds for the design-tokens page, whose $E has a key with no chunk id", () => {
    const { loader, federation, kernel } = designTokensPage();
    assertAgrees(collect({ loader, federation, kernel }));
  });

  it("holds for a container that declares no exposes at all", () => {
    const { loader, federation, kernel } = libOnlyPage();
    assertAgrees(collect({ loader, federation, kernel }));
  });

  it("holds when the FynApp left the registry and neither side can answer", () => {
    const { loader, federation } = fynApp1Page();
    const kernel = devKernel({
      states: [{ name: "fynapp-1", version: "1.0.0", status: "shutdown", mountedAt: 1000 }],
    });
    assertAgrees(collect({ loader, federation, kernel }));
  });
});

describe("absence, where the level cannot be known", () => {
  it("says nothing about imported on a page with no kernel", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({ loader, federation });
    const levels = containerExposeLevels(versionOf(snap, "fynapp-1", "1.0.0"));
    expect(levels.loaded).toEqual(["./main"]);
    // not zero: no kernel means the question was never asked
    expect(levels.imported).toBeUndefined();
  });

  /*
   * A shutdown FynApp is off the registry, so its `exposes` is unreadable.
   * Stamping `imported: false` over the container would turn "cannot be read"
   * into "nobody imported it" -- the same absent/empty confusion the rest of
   * this view fixed in the detail band.
   */
  it("says nothing about imported for a container whose FynApp left the registry", () => {
    const { loader, federation } = fynApp1Page();
    const kernel = devKernel({
      states: [{ name: "fynapp-1", version: "1.0.0", status: "shutdown", mountedAt: 1000 }],
    });
    const snap = collect({ loader, federation, kernel });
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-1@1.0.0")!;
    expect(app.inRegistry).toBe(false);

    const levels = containerExposeLevels(versionOf(snap, "fynapp-1", "1.0.0"));
    expect(levels.loaded).toEqual(["./App", "./main"]);
    expect(levels.imported).toBeUndefined();

    // and the FynApps row does not fill the silence with a fraction of its own
    const appLevels = fynAppExposeLevels(app);
    expect(appLevels.imported).toBeUndefined();
    expect(importedTitle(appLevels)).toContain("not zero of them");
  });

  it("keeps an expose the kernel returned but the build never declared out of the fraction", () => {
    const { loader, federation } = fynApp1Page();
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-1",
          version: "1.0.0",
          exposes: { "./main": fakeUnit(["execute"]), "./surprise": {} },
          declared: ["./main", "./App", "./hello", "./getInfo", "./component"],
        }),
      ],
    });
    const snap = collect({ loader, federation, kernel });
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-1@1.0.0")!;
    const levels = fynAppExposeLevels(app);

    expect(levels.imported).toEqual(["./main"]);
    expect(levels.undeclared).toEqual(["./surprise"]);
    // the numerator never exceeds the denominator, and the extra is reported
    expect(levels.imported!.length).toBeLessThanOrEqual(levels.declared.length);
    expect(importedTitle(levels)).toContain("imported but never declared: ./surprise");

    // and the container still agrees on the level they share
    const container = containerExposeLevels(versionOf(snap, "fynapp-1", "1.0.0"));
    expect(container.imported).toEqual(levels.imported);
  });
});

/**
 * Two shapes the demo has and the fixtures did not, both of which still had the
 * two tabs printing different numbers after the levels were named. Neither was
 * findable without a real page, which is the point.
 */
describe("shapes the real page had and the fixtures did not", () => {
  it("counts an expose the build inlined into the entry as declared on both tabs", () => {
    const { loader, federation, kernel } = designTokensPage();
    const snap = collect({ loader, federation, kernel });
    const v = versionOf(snap, "fynapp-design-tokens", "1.0.0");
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-design-tokens@1.0.0")!;

    // `$E` has two keys and one chunk id; both are declared exposes
    expect(v.exposes.map((e) => e.name)).toEqual(["./main", "./middleware/design-tokens"]);
    const main = v.exposes.find((e) => e.name === "./main")!;
    expect(main.chunkId).toBeUndefined();
    expect(main.loaded).toBe(false);

    const container = containerExposeLevels(v);
    const levels = fynAppExposeLevels(app);
    expect(container.declared).toHaveLength(2);
    expect(levels.declared).toHaveLength(2);
    // the disagreement that survived the rename: 1/1 beside 1/2
    expect(`${container.imported!.length}/${container.declared.length} imported`).toBe(
      "1/2 imported"
    );
    expect(`${levels.imported!.length}/${levels.declared.length} imported`).toBe("1/2 imported");
    expect(`${container.loaded!.length}/${container.declared.length} chunks loaded`).toBe(
      "1/2 chunks loaded"
    );
  });

  it("says an inlined expose has no chunk rather than that the loader lost it", () => {
    const { loader, federation, kernel } = designTokensPage();
    const snap = collect({ loader, federation, kernel });
    const v = versionOf(snap, "fynapp-design-tokens", "1.0.0");
    expect(inlinedExposes(v)).toEqual(["./main"]);
    expect(exposeTitle(v.exposes.find((e) => e.name === "./main")!)).toContain(
      "no chunk of its own"
    );
    expect(exposesTitle(containerExposeLevels(v))).toContain("1 with no chunk at all");
  });

  it("tells the reader an inlined expose has no chunk to go and look for", () => {
    const { loader, federation, kernel } = designTokensPage();
    const snap = collect({ loader, federation, kernel });
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-design-tokens@1.0.0")!;
    const levels = fynAppExposeLevels(app);

    // the container's answer, joined on rather than derived again here
    expect(levels.inlined).toEqual(["./main"]);
    expect(levels.inlined).toEqual(
      inlinedExposes(versionOf(snap, "fynapp-design-tokens", "1.0.0"))
    );

    // the row FYM-359 was about: declared, never imported, and no chunk at all
    const title = notImportedTitle("./main", levels);
    expect(title).toContain("never imported by the kernel");
    expect(title).toContain("no chunk of its own");
    expect(title).not.toContain("Containers tab");
  });

  it("still sends the reader to the chunk when the expose has one", () => {
    const { loader, federation, kernel } = fynApp1Page();
    const snap = collect({ loader, federation, kernel });
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-1@1.0.0")!;
    const levels = fynAppExposeLevels(app);

    // the two states are different answers, not one hedge that covers both:
    // `./App`'s chunk really is in the loader, and the Containers tab shows it
    expect(levels.inlined).toEqual([]);
    expect(notImportedTitle("./App", levels)).toContain("may still have loaded");
    expect(notImportedTitle("./App", levels)).toContain("Containers tab");
  });

  it("says the chunk question is unknown when no container row was collected", () => {
    const { loader, federation } = twoContainerPage();
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-ghost",
          version: "1.0.0",
          exposes: {},
          declared: ["./main"],
        }),
      ],
    });
    const snap = collect({ loader, federation, kernel });
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-ghost@1.0.0")!;
    expect(app.containerVersion).toBeUndefined();

    const levels = fynAppExposeLevels(app);
    // absent, not empty: with no `$E` behind it, "nothing is inlined" would be
    // an answer the collector never had
    expect(levels.inlined).toBeUndefined();
    const title = notImportedTitle("./main", levels);
    expect(title).toContain("unknown");
    expect(title).not.toContain("may still have loaded");
  });

  it("knows the kernel was asked about a container that declares no exposes", () => {
    const { loader, federation, kernel } = libOnlyPage();
    const snap = collect({ loader, federation, kernel });
    const v = versionOf(snap, "fynapp-react-lib", "19.2.8");
    // nothing in `exposes` to carry the mark, so the flag has to say it
    expect(v.exposes).toEqual([]);
    expect(v.importsKnown).toBe(true);
    const container = containerExposeLevels(v);
    expect(container.imported).toEqual([]);

    // and both tabs then say the same thing about it: nothing to count
    const app = snap.fynmesh!.apps.find((a) => a.key === "fynapp-react-lib@19.2.8")!;
    const levels = fynAppExposeLevels(app);
    expect(levels.declared).toEqual([]);
    expect(importedTitle(levels)).toContain("declares no exposes at all");
  });
});
