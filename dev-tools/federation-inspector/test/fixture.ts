/**
 * A fake loader and a fake federation runtime.
 *
 * Built to the shapes the real ones expose -- `@fynmesh/systemjs`'s
 * `RecordMap` / `RegistrationMap` / `stageOf`, and federation's `$SS` store
 * and `Container` fields -- rather than to the collectors' expectations, so a
 * test failing here means the collector disagrees with the contract and not
 * that two mocks drifted apart.
 */

import type { LoadStage } from "../src/core/model.js";

export interface FakeRecord {
  id: string;
  d?: FakeRecord[];
  n?: Record<string, unknown>;
  e?: unknown;
  er?: unknown;
  f?: boolean;
  I?: unknown;
  E?: unknown;
}

interface RegEntry {
  url?: string;
  registration?: unknown;
  taken?: boolean;
  take(): unknown;
}

export class FakeLoader {
  private recs = new Map<string, FakeRecord>();
  private aliasMap = new Map<string, string>();
  private stages = new Map<string, LoadStage>();
  /** name -> qualifier ("" for the unqualified slot) -> entry */
  private regs = new Map<string, Map<string, RegEntry>>();

  addRecord(rec: FakeRecord, stage: LoadStage = "executed"): this {
    this.recs.set(rec.id, rec);
    this.stages.set(rec.id, stage);
    return this;
  }

  addAlias(name: string, id: string): this {
    this.aliasMap.set(name, id);
    return this;
  }

  addRegistration(
    name: string,
    known: { url?: string; registration?: unknown; taken?: boolean },
    qualifier?: string
  ): this {
    let byQualifier = this.regs.get(name);
    if (!byQualifier) {
      byQualifier = new Map();
      this.regs.set(name, byQualifier);
    }
    const key = qualifier ?? "";
    const existing = byQualifier.get(key);
    const merged: RegEntry = {
      url: known.url ?? existing?.url,
      registration: known.registration ?? existing?.registration,
      taken: known.taken ?? existing?.taken,
      take() {
        const r = this.registration;
        this.registration = undefined;
        this.taken = true;
        return r;
      },
    };
    byQualifier.set(key, merged);
    return this;
  }

  get records() {
    const recs = this.recs;
    const aliases = this.aliasMap;
    const map = {
      get: (idOrName: string) => recs.get(aliases.get(idOrName) ?? idOrName),
      has: (idOrName: string) => recs.has(aliases.get(idOrName) ?? idOrName),
      keys: () => recs.keys(),
      values: () => recs.values(),
      entries: () => recs.entries(),
      [Symbol.iterator]: () => recs.entries(),
    };
    return map;
  }

  get aliases() {
    const m = this.aliasMap;
    return {
      get: (n: string) => m.get(n),
      set: (n: string, id: string) => void m.set(n, id),
      has: (n: string) => m.has(n),
      delete: (n: string) => m.delete(n),
      keys: () => m.keys(),
      values: () => m.values(),
      entries: () => m.entries(),
      [Symbol.iterator]: () => m.entries(),
    };
  }

  get registrations() {
    const regs = this.regs;
    return {
      set: (name: string, known: any, qualifier?: string) =>
        this.addRegistration(name, known, qualifier),
      get: (name: string, qualifier?: string) => regs.get(name)?.get(qualifier ?? ""),
      has: (name: string, qualifier?: string) => !!regs.get(name)?.has(qualifier ?? ""),
      delete: (name: string, qualifier?: string) =>
        !!regs.get(name)?.delete(qualifier ?? ""),
      qualifiersOf: (name: string) =>
        [...(regs.get(name)?.keys() ?? [])].filter((q) => q !== ""),
      namesOf: (url: string) => {
        const out: Array<{ name: string; qualifier?: string }> = [];
        for (const [name, byQ] of regs) {
          for (const [q, entry] of byQ) {
            if (entry.url === url) {
              out.push({ name, qualifier: q === "" ? undefined : q });
            }
          }
        }
        return out;
      },
      keys: () => regs.keys(),
    };
  }

  stageOf(rec: FakeRecord): LoadStage {
    return this.stages.get(rec.id) ?? "executed";
  }

  resolve(id: string): string {
    return id === "./" ? "https://app.test/" : id;
  }
}

/** A fake federation Container, with the field names the real one exposes. */
export class FakeContainer {
  $SC: Record<string, any> = Object.create(null);
  $E: Record<string, string> = Object.create(null);
  $SS?: unknown;
  __FYNAPP_MANIFEST__?: unknown;

  constructor(
    public id: string,
    public name: string,
    public scope: string,
    public version: string
  ) {}

  share(
    key: string,
    options: Record<string, unknown>,
    versions: Record<string, { id: string }> = {},
    rvm: Record<string, string> = {}
  ): this {
    this.$SC[key] = { options, versions, rvm };
    return this;
  }

  /**
   * The same declaration as `share`, in the shape a *minified* federation-js
   * leaves behind.
   *
   * `Container._S` builds `$SC[key] = {options, rvm, versions}` with the last
   * two annotated for mangling, and that project's terser config treats
   * annotations as an allow-list, so the shipped build emits
   * `{options: r, i: a(), o: a()}` -- grepped out of
   * `federation-js/dist/federation-js.min.js`. The mangled slots are filled
   * with the real data on purpose: a collector that reached for them by their
   * source names would read `undefined` and quietly report nothing, which is
   * the bug this shape exists to catch.
   */
  shareMinified(
    key: string,
    options: Record<string, unknown>,
    versions: Record<string, { id: string }> = {},
    rvm: Record<string, string> = {}
  ): this {
    this.$SC[key] = { options, i: rvm, o: versions };
    return this;
  }

  expose(name: string, chunkId: string): this {
    this.$E[name] = chunkId;
    return this;
  }
}

export class FakeFederation {
  $SS: Record<string, any> = Object.create(null);
  private bundles = new Map<string, string>();

  /** mirror of federation's `_S`: announce a version into a scope */
  addShare(
    scope: string,
    key: string,
    version: string,
    opts: { url?: string; id?: string; container: string; containerVersion?: string }
  ): this {
    const s = (this.$SS[scope] ??= Object.create(null));
    const meta = (s[key] ??= Object.create(null));
    const info = (meta[version] ??= Object.create(null));
    info.sources ??= [];
    info.sources.push({
      id: opts.id ?? "",
      container: opts.container,
      version: opts.containerVersion,
    });
    if (opts.url) {
      info.url = opts.url;
    }
    if (opts.id) {
      info.id = opts.id;
    }
    return this;
  }

  addBundle(memberUrl: string, bundleUrl: string): this {
    this.bundles.set(memberUrl, bundleUrl);
    return this;
  }

  bundleUrlFor(url: string): string | undefined {
    return this.bundles.get(url);
  }
}

/**
 * A container whose build emitted an entry *chunk* alongside its entry.
 *
 * Reproduces the real demo: a share surface is bound with `e: true` and the
 * container's version, so it gets an `__mf_entry_<name>_<file>` id. It is not
 * a second version of the container and must not be reported as one.
 */
export function containerWithEntryChunk(): {
  loader: FakeLoader;
  federation: FakeFederation;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const entry = "https://app.test/fynapp-4-vue/dist/fynapp-entry.js";
  const surface = "https://app.test/fynapp-4-vue/dist/_mf-share-surface_vue-CmMbG3Pi.js";

  const c = new FakeContainer("__mf_container_fynapp-4-vue", "fynapp-4-vue", "fynmesh", "1.0.0")
    .share("vue", { semver: "^3.3.4", singleton: true }, { "3.5.13": { id: "./vue.js" } })
    .expose("./main", "./main-vue.js");

  loader
    .addRecord({ id: entry, n: { container: c, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: surface, n: { default: {} }, d: [] });

  loader
    .addRegistration("__mf_container_fynapp-4-vue", { url: entry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-4-vue", { url: entry })
    // the entry chunk, filed WITHOUT a version qualifier -- which is what made
    // it look like a second version of the container
    .addRegistration("__mf_entry_fynapp-4-vue__mf-share-surface_vue-CmMbG3Pi.js", {
      url: surface,
    });

  federation.addShare("fynmesh", "vue", "3.5.13", {
    url: surface,
    id: "./vue.js",
    container: "fynapp-4-vue",
    containerVersion: "1.0.0",
  });

  return { loader, federation };
}

/**
 * A page with two containers, a doubled singleton and a failed module --
 * the shapes every collector and every diagnostic has to handle.
 */
export function twoContainerPage(): { loader: FakeLoader; federation: FakeFederation } {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const entry1 = "https://app.test/fynapp-1/dist/fynapp-entry.js";
  const entry2 = "https://app.test/fynapp-2/dist/fynapp-entry.js";
  const react19 = "https://app.test/react-19/dist/react.js";
  const react18 = "https://app.test/react-18/dist/react.js";
  const app1Main = "https://app.test/fynapp-1/dist/main-aaa.js";
  const broken = "https://app.test/fynapp-2/dist/broken-bbb.js";

  const c1 = new FakeContainer("__mf_container_fynapp-1", "fynapp-1", "fynmesh", "1.0.0")
    .share("esm-react", { semver: "^19.0.0", singleton: true, import: false })
    .expose("./main", "./main-aaa.js");
  c1.__FYNAPP_MANIFEST__ = {
    name: "fynapp-1",
    version: "1.0.0",
    "import-exposed": { "fynapp-2": { main: { semver: "^1.0.0" } } },
  };

  const c2 = new FakeContainer("__mf_container_fynapp-2", "fynapp-2", "fynmesh", "1.0.0")
    .share("esm-react", { semver: "^18.0.0", singleton: true, import: false })
    .expose("./main", "./broken-bbb.js");

  loader
    .addRecord({ id: entry1, n: { container: c1, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: entry2, n: { container: c2, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: react19, n: { default: {} }, d: [] })
    .addRecord({ id: react18, n: { default: {} }, d: [] });

  const reactRec = { id: react19, d: [] } as FakeRecord;
  loader.addRecord({ id: app1Main, n: { hello: 1 }, d: [reactRec] });
  loader.addRecord(
    { id: broken, f: true, er: new Error("boom"), d: [] },
    "errored"
  );

  loader
    .addRegistration("__mf_container_fynapp-1", { url: entry1 }, "1.0.0")
    .addRegistration("__mf_container_fynapp-1", { url: entry1 })
    .addRegistration("__mf_container_fynapp-2", { url: entry2 }, "1.0.0")
    .addRegistration("__mf_container_fynapp-2", { url: entry2 })
    .addRegistration("./main-aaa.js", { url: app1Main })
    .addRegistration("./broken-bbb.js", { url: broken })
    .addRegistration("./never-loaded.js", { registration: [[], () => ({})] });

  loader.addAlias("esm-react", react19);

  federation
    .addShare("fynmesh", "esm-react", "19.0.0", {
      url: react19,
      id: "./react-19.js",
      container: "fynapp-react-lib",
      containerVersion: "19.0.0",
    })
    .addShare("fynmesh", "esm-react", "18.3.1", {
      url: react18,
      id: "./react-18.js",
      container: "fynapp-react-18",
      containerVersion: "1.0.0",
    })
    .addShare("fynmesh", "design-tokens", "1.0.0", {
      container: "fynapp-design-tokens",
      containerVersion: "1.0.0",
    });

  federation.addBundle(app1Main, "https://app.test/fynapp-1/dist/combined.js");

  return { loader, federation };
}

/**
 * A page built by a minified federation-js, where the only surviving record of
 * what a container provides is the share store.
 *
 * Three things it puts in the collector's way at once: one container sourcing
 * two keys, the same copy filed under both its specifier and its url, and a
 * source that names no container version.
 */
export function minifiedSharePage(): {
  loader: FakeLoader;
  federation: FakeFederation;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const entry = "https://app.test/fynapp-min/dist/fynapp-entry.js";
  const react = "https://app.test/fynapp-min/dist/react-19-abc.js";
  const vue = "https://app.test/fynapp-min/dist/vue-def.js";

  const c = new FakeContainer("__mf_container_fynapp-min", "fynapp-min", "fynmesh", "1.0.0")
    .shareMinified(
      "esm-react",
      { semver: "^19.0.0", singleton: true },
      { "19.0.0": { id: "./react-19-abc.js" } },
      { "/": "^19.0.0" }
    )
    .shareMinified("vue", { semver: "^3.5.0" }, { "3.5.13": { id: "./vue-def.js" } })
    .expose("./main", "./main-min.js");

  loader
    .addRecord({ id: entry, n: { container: c, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: react, n: { default: {} }, d: [] })
    .addRecord({ id: vue, n: { default: {} }, d: [] });

  loader
    .addRegistration("__mf_container_fynapp-min", { url: entry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-min", { url: entry })
    // the specifier redirects to the url, which is what makes a chunk id in a
    // share source resolvable at all
    .addRegistration("./react-19-abc.js", { url: react })
    .addRegistration("./vue-def.js", { url: vue });

  federation
    .addShare("fynmesh", "esm-react", "19.0.0", {
      url: react,
      id: "./react-19-abc.js",
      container: "fynapp-min",
      containerVersion: "1.0.0",
    })
    // the same copy announced again under its url: one provision, two spellings
    .addShare("fynmesh", "esm-react", "19.0.0", {
      url: react,
      id: react,
      container: "fynapp-min",
      containerVersion: "1.0.0",
    })
    // filed without a container version, which only this container's being the
    // page's only version of itself makes attributable
    .addShare("fynmesh", "vue", "3.5.13", {
      url: vue,
      id: "./vue-def.js",
      container: "fynapp-min",
    });

  return { loader, federation };
}
