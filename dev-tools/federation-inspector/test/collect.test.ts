import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { analyse } from "../src/analysis/index.js";
import { isLoadedStage } from "../src/core/exposes.js";
import {
  FakeLoader,
  combinedBundlePage,
  containerWithEntryChunk,
  minifiedSharePage,
  noShareStorePage,
  twoContainerPage,
  unreadableScopePage,
} from "./fixture.js";

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

  it("rebuilds provides from the share store when $SC is mangled", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    analyse(s);
    const v = s.containers.find((c) => c.name === "fynapp-min")!.versions[0];

    // `options` survives minification, so the range asked for is still exact
    const react = v.consumes.find((d) => d.key === "esm-react")!;
    expect(react.requestedRange).toBe("^19.0.0");
    expect(react.singleton).toBe(true);
    // `rvm` and `versions` do not survive it, and the ones the minified
    // container still carries under mangled names must not be read
    expect(react.rvm).toBeUndefined();

    // so `versions` comes from the store -- and the copy announced twice, once
    // by specifier and once by url, is one provision
    expect(react.versions).toEqual(["19.0.0"]);
    expect(v.provides.map((d) => d.key).sort()).toEqual(["esm-react", "marko", "vue"]);
    // filed with no container version, attributable because this container has
    // only one version on the page
    expect(v.provides.find((d) => d.key === "vue")!.versions).toEqual(["3.5.13"]);
  });

  it("separates the versions a container announced from the ones supplied", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    analyse(s);
    const v = s.containers.find((c) => c.name === "fynapp-min")!.versions[0];

    // a copy of each of these arrived, so the store carries an address for it
    for (const key of ["esm-react", "vue"]) {
      const decl = v.provides.find((d) => d.key === key)!;
      expect(decl.supplied).toEqual(decl.versions);
    }

    // marko was announced by the same `_S` call every other key went through
    // and nothing ever supplied it, so it stays a declaration and does not
    // become a copy
    const marko = v.provides.find((d) => d.key === "marko")!;
    expect(marko.versions).toEqual(["5.37.31"]);
    expect(marko.supplied).toEqual([]);
  });

  it("agrees with the share-not-provided diagnostic about every version", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    analyse(s);

    // the contradiction FYM-341 is about: whatever Issues calls unsupplied,
    // no container may be shown providing. Both sides computed independently.
    const flagged = s.issues
      .filter((i) => i.code === "share-not-provided")
      .map((i) => i.title.split(" ")[0])
      .sort();
    expect(flagged).toEqual(["marko@5.37.31"]);

    const claimed: string[] = [];
    for (const c of s.containers) {
      for (const v of c.versions) {
        for (const d of [...v.provides, ...v.consumes]) {
          for (const ver of d.supplied ?? []) {
            claimed.push(d.key + "@" + ver);
          }
        }
      }
    }
    expect(claimed).not.toContain("marko@5.37.31");
  });

  it("reports required-version maps as unavailable rather than as none", () => {
    const { loader, federation } = minifiedSharePage();
    const s = collect({ loader, federation });
    expect(s.capability.shareConfig).toBe(true);
    expect(s.capability.requiredVersionMaps).toBe(false);
    expect(s.capability.notes.join(" ")).toContain("Required-version maps are unavailable");

    const un = containerWithEntryChunk();
    const s2 = collect({ loader: un.loader, federation: un.federation });
    expect(s2.capability.requiredVersionMaps).toBe(true);
    expect(s2.capability.notes.join(" ")).not.toContain("Required-version maps");
  });

  it("still reads provides off an unmangled container", () => {
    const { loader, federation } = containerWithEntryChunk();
    const s = collect({ loader, federation });
    const v = s.containers.find((c) => c.name === "fynapp-4-vue")!.versions[0];
    expect(v.provides.map((d) => d.key)).toEqual(["vue"]);
    expect(v.provides[0].versions).toEqual(["3.5.13"]);
    expect(v.consumes.find((d) => d.key === "vue")!.versions).toEqual(["3.5.13"]);
  });

  it("credits a provider the loader never saw, without calling it a consumer", () => {
    const s = snap();
    const lib = s.containers.find((c) => c.name === "fynapp-react-lib")!.versions[0];
    expect(lib.provides.map((d) => d.key)).toEqual(["esm-react"]);
    expect(lib.provides[0].versions).toEqual(["19.0.0"]);
    expect(lib.provides[0].supplied).toEqual(["19.0.0"]);
    // reconstructed, so "no range" here means unknown and says so
    expect(lib.provides[0].inferred).toBe(true);
    expect(lib.consumes).toHaveLength(0);
  });

  it("credits a store-only container with the declaration and not a copy", () => {
    const s = snap();
    const tokens = s.containers.find((c) => c.name === "fynapp-design-tokens")!.versions[0];
    const decl = tokens.provides[0];
    // the store's only record of this version is a source: nothing resolved to
    // it and nothing loaded it, which is what Issues reports it for
    expect(decl.key).toBe("design-tokens");
    expect(decl.versions).toEqual(["1.0.0"]);
    expect(decl.supplied).toEqual([]);
    expect(decl.inferred).toBe(true);
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

/**
 * The bundle collector, on the only page shape that has combined bundles.
 *
 * `members` are module ids and `loadedCount` is `isLoadedStage` -- one word,
 * one predicate, shared with the expose counts. What these pin down is the
 * member the old code could not look up: it grouped by url and counted through
 * an id-keyed map, so a miss read as `undefined !== "registered"` and a chunk
 * nobody had loaded was counted as loaded.
 */
describe("combined bundles", () => {
  function comboSnap() {
    const { loader, federation } = combinedBundlePage();
    return collect({ loader, federation });
  }

  it("names its members by module id, so they join against modules", () => {
    const s = comboSnap();
    expect(s.bundles).toHaveLength(1);
    const byId = new Map(s.modules.map((m) => [m.id, m]));
    for (const member of s.bundles[0].members) {
      expect(byId.get(member), member).toBeDefined();
    }
    expect([...s.bundles[0].members].sort()).toEqual([
      "./deep-ddd.js",
      "./late-ccc.js",
      "https://app.test/fynapp-combo/dist/main-aaa.js",
      // the split-key member joins under its url, not its specifier: that is
      // the id it already has and the id it keeps once something imports it
      "https://app.test/fynapp-combo/dist/split-eee.js",
    ]);
  });

  it("counts a member the loader only has a registration for as not loaded", () => {
    const s = comboSnap();
    const late = s.modules.find((m) => m.id === "./late-ccc.js")!;
    // the shape that used to inflate the count: its url is not its id, so the
    // old lookup missed, and a miss counted as loaded
    expect(late.url).toBe("https://app.test/fynapp-combo/dist/late-ccc.js");
    expect(late.stage).toBe("registered");
    expect(s.bundles[0].members).toHaveLength(4);
    expect(s.bundles[0].loadedCount).toBe(2);
  });

  it("still counts an executed member whose id is not its url", () => {
    const s = comboSnap();
    const deep = s.modules.find((m) => m.id === "./deep-ddd.js")!;
    expect(deep.url).toBe("https://app.test/fynapp-combo/dist/deep-ddd.js");
    expect(deep.stage).toBe("executed");
    expect(deep.bundle).toBe("https://app.test/fynapp-combo/dist/combined-zzz.js");
  });

  it("agrees with the stage of every member it names", () => {
    const s = comboSnap();
    const byId = new Map(s.modules.map((m) => [m.id, m]));
    for (const b of s.bundles) {
      const loaded = b.members.filter((id) => isLoadedStage(byId.get(id)!.stage));
      expect(b.loadedCount).toBe(loaded.length);
    }
  });

  /*
   * The pair, and the one row it is entitled to.
   *
   * A member nobody has imported sits in `System.registrations` under two keys
   * -- `specifier -> { url }` and `url -> { registration }` -- and a row per key
   * showed it twice, once `exposed` with a container and a bundle and once
   * `external` with neither, disagreeing about `pending`. They were never two
   * modules: federation files the pair so that "there is exactly one id for the
   * member", and that id is the url, which is also the id the module already
   * has once it runs. The two executed members prove the target shape -- one
   * row each, keyed by url -- and the unexecuted one now matches it.
   */
  const split = "https://app.test/fynapp-combo/dist/split-eee.js";

  it("files a member registered under both its specifier and its url once", () => {
    const s = comboSnap();
    const rows = s.modules.filter((m) => (m.id + " " + (m.url ?? "")).includes("split-eee"));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(split);
    expect(rows[0].url).toBe(split);
    // the specifier is the redirect it always was, and says so
    expect(rows[0].aliases).toContain("./split-eee.js");
    expect(s.modules.some((m) => m.id === "./split-eee.js")).toBe(false);
  });

  it("still gives each executed member exactly one row", () => {
    const s = comboSnap();
    for (const member of ["main-aaa", "deep-ddd"]) {
      const rows = s.modules.filter((m) => (m.id + " " + (m.url ?? "")).includes(member));
      expect(rows, member).toHaveLength(1);
    }
  });

  it("takes the registration from the key that holds one, the url from the key that holds that", () => {
    const s = comboSnap();
    const row = s.modules.find((m) => m.id === split)!;
    // the specifier half's `pending: false` is not a claim about the module --
    // that half is filed empty on purpose. The url half carries the code.
    expect(row.registration?.pending).toBe(true);
    expect(row.registration?.url).toBe(split);
    expect(row.stage).toBe("registered");
  });

  it("gives the merged row the container and carrier the orphan half had neither of", () => {
    const s = comboSnap();
    const row = s.modules.find((m) => m.id === split)!;
    expect(row.kind).toBe("exposed");
    expect(row.container?.name).toBe("fynapp-combo");
    expect(row.bundle).toBe("https://app.test/fynapp-combo/dist/combined-zzz.js");
  });

  it("reports the unconsumed registration once, against the row that carries it", () => {
    const s = comboSnap();
    analyse(s);
    const pending = s.issues.filter((i) => i.code === "registration-pending");
    // one per unexecuted member, not one per registry key
    expect(pending.map((i) => i.refs?.[0]).sort()).toEqual(["./late-ccc.js", split]);
  });

  it("folds the pair whichever key the loader hands over first", () => {
    const url = "https://app.test/fynapp-combo/dist/rev-fff.js";
    const loader = new FakeLoader()
      // url side first -- the reverse of the order the demo page shows
      .addRegistration(url, { registration: [[], () => ({})] })
      .addRegistration("./rev-fff.js", { url });
    const s = collect({ loader });
    const rows = s.modules.filter((m) => (m.id + " " + (m.url ?? "")).includes("rev-fff"));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(url);
    // the url-keyed entry carries no url of its own; without the specifier half
    // the row has none, and readBundles skips a row with no url
    expect(rows[0].url).toBe(url);
    expect(rows[0].aliases).toContain("./rev-fff.js");
    expect(rows[0].registration?.pending).toBe(true);
  });

  it("never folds away a specifier that carries a registration of its own", () => {
    const url = "https://app.test/fynapp-combo/dist/own-ggg.js";
    const loader = new FakeLoader()
      // both keys hold code: two registrations, and neither is a redirect
      .addRegistration("./own-ggg.js", { url, registration: [[], () => ({})] })
      .addRegistration(url, { registration: [[], () => ({})] });
    const s = collect({ loader });
    const rows = s.modules.filter((m) => (m.id + " " + (m.url ?? "")).includes("own-ggg"));
    expect(rows.map((m) => m.id).sort()).toEqual(["./own-ggg.js", url]);
  });
});

/**
 * Which share scope a container files into, and what is said when nobody can
 * say.
 *
 * The collector used to end this chain with the literal `"default"` -- which
 * is a real and common module federation scope name, so a container whose
 * scope could not be read rendered exactly like one named `default`. The name
 * is also a lookup key for `$SC` entries that declare no scope of their own,
 * and those are two different decisions: the node keeps only what was read,
 * while the key keeps the fallbacks, where a wrong guess costs a failed match
 * instead of a false claim.
 */
describe("container scope", () => {
  it("reads a container's own scope, and says so", () => {
    const v = snap().containers.find((c) => c.name === "fynapp-1")!.versions[0];
    expect(v.scope).toBe("fynmesh");
    expect(v.scopeSource).toBe("container");
  });

  it("takes it from the share store for a container it cannot reach", () => {
    // fynapp-design-tokens is in the store and nowhere else: no registration,
    // no container object. The store still names the one scope it filed into.
    const v = snap().containers.find((c) => c.name === "fynapp-design-tokens")!.versions[0];
    expect(v.scope).toBe("fynmesh");
    expect(v.scopeSource).toBe("share-store");
  });

  it("leaves it absent when neither the container nor the store says", () => {
    const { loader, federation } = unreadableScopePage();
    const s = collect({ loader, federation });
    const v = s.containers.find((c) => c.name === "fynapp-ghost")!.versions[0];
    expect(v.scope).toBeUndefined();
    expect(v.scopeSource).toBeUndefined();
  });

  it("does not pick one for a container the store names in two scopes", () => {
    const { loader, federation } = unreadableScopePage();
    const s = collect({ loader, federation });
    const v = s.containers.find((c) => c.name === "fynapp-both")!.versions[0];
    // "one of these two" is not an answer, and the first of them is a guess
    expect(s.scopes.map((x) => x.name)).toEqual(["fynmesh", "other"]);
    expect(v.scope).toBeUndefined();
  });

  it("still joins the declarations of a container whose scope it could not read", () => {
    // the display fallback going away must not take the lookup key with it:
    // `$SC` entries name no scope of their own, so they are looked up under
    // the container's, and the store is what supplies it here
    const { loader, federation } = unreadableScopePage();
    const s = collect({ loader, federation });
    analyse(s);
    const v = s.containers.find((c) => c.name === "fynapp-mangled")!.versions[0];
    expect(v.scope).toBe("fynmesh");
    expect(v.scopeSource).toBe("share-store");
    const decl = v.consumes.find((d) => d.key === "esm-react")!;
    expect(decl.shareScope).toBe("fynmesh");
    expect(decl.resolved?.satisfies).toBe(true);
    expect(decl.resolved?.version).toBe("19.0.0");
    const key = s.scopes.find((x) => x.name === "fynmesh")!.keys.find((k) => k.key === "esm-react")!;
    expect(key.versions[0].consumers.map((c) => c.container)).toContain("fynapp-mangled");
  });

  it("calls nothing `default` on a page with no share store at all", () => {
    const { loader, federation } = noShareStorePage();
    const s = collect({ loader, federation });
    expect(s.scopes).toEqual([]);
    const v = s.containers.find((c) => c.name === "fynapp-ghost")!.versions[0];
    // the string this ticket is about: invented, and indistinguishable from a
    // container really filing into a scope named `default`
    expect(v.scope).toBeUndefined();
    expect(JSON.stringify(s.containers)).not.toContain("default");
  });

  it("tags no module with a scope its container could not name", () => {
    const { loader, federation } = unreadableScopePage();
    const s = collect({ loader, federation });
    const main = s.modules.find((m) => m.id === "./main-mmm.js")!;
    // the store named its container's scope, so this one is attributable
    expect(main.scope).toBe("fynmesh");
    for (const m of s.modules) {
      expect(m.scope).not.toBe("default");
    }
    const { loader: l2, federation: f2 } = noShareStorePage();
    const bare = collect({ loader: l2, federation: f2 });
    // absent, not heaped under one label: an unreadable scope is unknown per
    // container, so modules from two of them share nothing but the gap
    expect(bare.modules.every((m) => m.scope === undefined)).toBe(true);
  });
});
