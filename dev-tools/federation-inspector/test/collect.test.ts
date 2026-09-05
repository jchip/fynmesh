import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { analyse } from "../src/analysis/index.js";
import { FakeLoader, containerWithEntryChunk, twoContainerPage } from "./fixture.js";

function snap() {
  const { loader, federation } = twoContainerPage();
  const s = collect({ loader, federation });
  analyse(s);
  return s;
}

describe("collect", () => {
  it("reports what it cannot read rather than throwing", () => {
    const s = collect({ loader: undefined, federation: undefined });
    expect(s.capability.records).toBe(false);
    expect(s.capability.notes.join(" ")).toContain("No SystemJS loader found");
    expect(s.modules).toEqual([]);
  });

  it("works as a plain SystemJS browser with no federation", () => {
    const loader = new FakeLoader()
      .addRecord({ id: "https://x.test/a.js", d: [] })
      .addRecord({ id: "https://x.test/b.js", d: [] });
    const s = collect({ loader, federation: null });

    expect(s.modules).toHaveLength(2);
    expect(s.capability.federation).toBe(false);
    expect(s.capability.notes.join(" ")).toContain("No Federation runtime");
    expect(s.containers).toEqual([]);
  });

  it("lists every record and every registration-only id", () => {
    const s = snap();
    const ids = s.modules.map((m) => m.id);
    expect(ids).toContain("https://app.test/fynapp-1/dist/fynapp-entry.js");
    // known to the loader, never instantiated -- still worth showing
    expect(ids).toContain("./never-loaded.js");
    const pending = s.modules.find((m) => m.id === "./never-loaded.js")!;
    expect(pending.stage).toBe("registered");
    expect(pending.registration?.pending).toBe(true);
  });

  it("discovers containers and their versions from the loader alone", () => {
    const s = snap();
    expect(s.containers.map((c) => c.name).sort()).toEqual([
      "fynapp-1",
      "fynapp-2",
      "fynapp-design-tokens",
      "fynapp-react-18",
      "fynapp-react-lib",
    ]);
    const one = s.containers.find((c) => c.name === "fynapp-1")!;
    expect(one.versions).toHaveLength(1);
    expect(one.versions[0].version).toBe("1.0.0");
    expect(one.versions[0].entryUrl).toBe("https://app.test/fynapp-1/dist/fynapp-entry.js");
    expect(one.versions[0].stage).toBe("executed");
  });

  it("reads exposes, share config and the FynApp manifest off the container", () => {
    const s = snap();
    const one = s.containers.find((c) => c.name === "fynapp-1")!.versions[0];
    expect(one.exposes.map((e) => e.name)).toEqual(["./main"]);
    expect(one.exposes[0].url).toBe("https://app.test/fynapp-1/dist/main-aaa.js");

    const react = one.consumes.find((d) => d.key === "esm-react")!;
    expect(react.requestedRange).toBe("^19.0.0");
    expect(react.singleton).toBe(true);
    // `import: false` means consume-only: declared, but provides no copy
    expect(react.importable).toBe(false);
    expect(one.provides).toHaveLength(0);

    expect((one.manifest as any)["import-exposed"]["fynapp-2"]).toBeTruthy();
    expect(s.capability.manifest).toBe(true);
  });

  it("builds the share scope tree with sources and loaded state", () => {
    const s = snap();
    const scope = s.scopes.find((x) => x.name === "fynmesh")!;
    const react = scope.keys.find((k) => k.key === "esm-react")!;

    expect(react.versions.map((v) => v.version)).toEqual(["19.0.0", "18.3.1"]);
    expect(react.loadedCount).toBe(2);
    expect(react.versions[0].sources[0].container).toBe("fynapp-react-lib");

    // declared into the scope but never supplied
    const tokens = scope.keys.find((k) => k.key === "design-tokens")!;
    expect(tokens.versions[0].loaded).toBe(false);
    expect(tokens.versions[0].url).toBeUndefined();
  });

  it("inverts dependencies into dependents", () => {
    const s = snap();
    const react = s.modules.find((m) => m.id === "https://app.test/react-19/dist/react.js")!;
    expect(react.dependents.map((d) => d.id)).toContain(
      "https://app.test/fynapp-1/dist/main-aaa.js"
    );
  });

  it("carries aliases and combined-bundle membership", () => {
    const s = snap();
    const react = s.modules.find((m) => m.id === "https://app.test/react-19/dist/react.js")!;
    expect(react.aliases).toEqual(["esm-react"]);

    const main = s.modules.find((m) => m.id === "https://app.test/fynapp-1/dist/main-aaa.js")!;
    expect(main.bundle).toBe("https://app.test/fynapp-1/dist/combined.js");
    expect(s.bundles).toHaveLength(1);
    expect(s.bundles[0].members).toEqual([main.id]);
  });

  it("attributes chunks to containers by their entry directory", () => {
    const s = snap();
    const main = s.modules.find((m) => m.id === "https://app.test/fynapp-1/dist/main-aaa.js")!;
    expect(main.container?.name).toBe("fynapp-1");
    expect(main.kind).toBe("exposed");
  });

  it("captures a failed module's error", () => {
    const s = snap();
    const broken = s.modules.find((m) => m.id.includes("broken"))!;
    expect(broken.stage).toBe("errored");
    expect(broken.error?.message).toBe("boom");
  });

  it("does not report an entry chunk as a second container version", () => {
    // A share surface is bound with isEntry, so it gets an __mf_entry_ id and
    // the container's version. Treating that as a version slot reported four
    // single-version demo apps as "2 versions live" -- the one claim this tool
    // most has to get right.
    const { loader, federation } = containerWithEntryChunk();
    const s = collect({ loader, federation });
    analyse(s);

    const vue = s.containers.find((c) => c.name === "fynapp-4-vue")!;
    expect(vue.versions).toHaveLength(1);
    expect(vue.versions[0].version).toBe("1.0.0");
    expect(vue.versions[0].entryUrl).toBe(
      "https://app.test/fynapp-4-vue/dist/fynapp-entry.js"
    );
    // and no bogus "container has 2 versions" story anywhere
    expect(s.containers.every((c) => c.versions.length === 1)).toBe(true);
  });

  it("still finds a container known only by its entry chunk", () => {
    // the legitimate case the entry-chunk pass exists for: a build whose
    // container id was never registered with this loader
    const loader = new FakeLoader()
      .addRecord({ id: "https://app.test/solo/dist/fynapp-entry.js", d: [] })
      .addRegistration("__mf_entry_solo-app_fynapp-entry.js", {
        url: "https://app.test/solo/dist/fynapp-entry.js",
      });
    const s = collect({ loader, federation: new (class {
      $SS = {};
    })() });
    expect(s.containers.map((c) => c.name)).toContain("solo-app");
  });

  it("produces a snapshot that survives structured cloning", () => {
    const s = snap();
    // the whole extension story rests on this: only JSON crosses a message
    // port, so anything class-shaped or function-valued in the snapshot would
    // make the remote adapter impossible
    expect(() => structuredClone(s)).not.toThrow();
    expect(JSON.parse(JSON.stringify(s)).modules.length).toBe(s.modules.length);
  });
});
