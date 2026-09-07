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
  $E: Record<string, string | undefined> = Object.create(null);
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

  /**
   * An expose the build inlined into the container entry: `$E` holds the name
   * and no chunk id.
   *
   * Not hypothetical. `Container._E` stores `value.id`, and a fynapp whose
   * `./main` is bundled into the entry registers it as
   * `_E("./main", Promise.resolve().then(...))` -- a promise, whose `.id` is
   * `undefined`. `fynapp-design-tokens` on the demo is exactly this, and it is
   * what made the Containers tab count one fewer declared expose than the
   * FynApps tab for the same container.
   */
  inlinedExpose(name: string): this {
    this.$E[name] = undefined;
    return this;
  }
}

export class FakeFederation {
  $SS: Record<string, any> = Object.create(null);
  private bundles = new Map<string, string>();
  private debugRows: any[] | undefined;

  /**
   * A row of `Federation.__I()`, the debug snapshot a minified federation-js
   * still ships because `rvm` does not survive its own mangling.
   *
   * Only the fields the collector joins on are modelled. Federation's real
   * rows also carry `use` and `sat`, which nothing reads yet.
   */
  addRvmRow(row: {
    c: string;
    cv?: string;
    s: string;
    k: string;
    req: Record<string, string>;
  }): this {
    (this.debugRows ??= []).push({ f: "chunk.js", cv: "", ...row });
    return this;
  }

  /**
   * Absent rows mean a build with no usable hatch, which is the shape that has
   * to keep reporting the maps as unavailable rather than as empty.
   */
  __I(): { v: number; r: any[] } | undefined {
    return this.debugRows ? { v: 1, r: this.debugRows } : undefined;
  }

  /**
   * mirror of federation's `_S`: announce a version into a scope
   *
   * `id` is the chunk the container announced, which `_S` files on the source
   * and nowhere else. The store's own `id` and `url` are a later, separate
   * write -- `_mfLoaded` when a copy arrives, `resolve` when a consumer
   * settles on one -- so they are set here only alongside a `url`. An `id`
   * with no `url` is therefore the announced-but-never-supplied version, which
   * is the shape that had `provides` and Issues contradicting each other.
   */
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
      if (opts.id) {
        info.id = opts.id;
      }
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
 * Four things it puts in the collector's way at once: one container sourcing
 * several keys, the same copy filed under both its specifier and its url, a
 * source that names no container version, and a version announced into the
 * scope that nothing ever supplied a copy of.
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
    .shareMinified(
      "marko",
      { semver: "^5.37.31" },
      { "5.37.31": { id: "./index-browser-DVoahrR_.js" } }
    )
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
    })
    // announced and never supplied, the real marko@5.37.31 on the demo page:
    // the container declares the share and files its chunk id as a source, and
    // no copy of it was ever handed over. There is deliberately no
    // registration for that chunk id.
    .addShare("fynmesh", "marko", "5.37.31", {
      id: "./index-browser-DVoahrR_.js",
      container: "fynapp-min",
      containerVersion: "1.0.0",
    });

  return { loader, federation };
}

/**
 * A page whose container was built with `federation-combine`: three chunks in
 * one physical file, at three different points in their lives.
 *
 * The demo emits no combined bundles at all -- `$bU` is empty on every page it
 * serves -- so this is the only place the bundle collector's members are more
 * than a formality, and the only place the id-vs-url split under them can be
 * exercised. `$bU` is keyed by a member's **url** (that is the key
 * `instantiate` is called with), but the loader's own key for that module is
 * whatever it was first told, which for a chunk is often the specifier the
 * container's `_f` handed it. The three members here are the three ways that
 * lands:
 *
 * - `main-aaa.js` -- a record under its own url. id === url, executed.
 * - `deep-ddd.js` -- a record under the chunk specifier, with the url arriving
 *   from its registration. id !== url, executed. The old count could not find
 *   it and called it loaded anyway, which was right by accident.
 * - `late-ccc.js` -- a registration nothing consumed, carrying its url and its
 *   registration on one key. id !== url, `registered`. The old count could not
 *   find it either, and called it loaded, which was wrong.
 * - `split-eee.js` -- the same resting state as it is actually filed by the
 *   shipped runtime: **two** entries, `specifier -> { url }` and
 *   `url -> { registration }` (combined-module-bundles.md 5.3). One module,
 *   and the only one here whose registry presence is a pair.
 */
export function combinedBundlePage(): {
  loader: FakeLoader;
  federation: FakeFederation;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const entry = "https://app.test/fynapp-combo/dist/fynapp-entry.js";
  const combo = "https://app.test/fynapp-combo/dist/combined-zzz.js";
  const byUrl = "https://app.test/fynapp-combo/dist/main-aaa.js";
  const bySpecifier = "https://app.test/fynapp-combo/dist/deep-ddd.js";
  const neverRun = "https://app.test/fynapp-combo/dist/late-ccc.js";
  const splitKeys = "https://app.test/fynapp-combo/dist/split-eee.js";

  const c = new FakeContainer(
    "__mf_container_fynapp-combo",
    "fynapp-combo",
    "fynmesh",
    "1.0.0"
  )
    .expose("./main", "./main-aaa.js")
    .expose("./deep", "./deep-ddd.js")
    .expose("./late", "./late-ccc.js")
    .expose("./split", "./split-eee.js");

  loader
    .addRecord({ id: entry, n: { container: c, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: byUrl, n: { main: 1 }, d: [] })
    // the record is filed under the specifier; only the registration below
    // knows the url, so this module's id is not its url
    .addRecord({ id: "./deep-ddd.js", n: { deep: 1 }, d: [] });

  loader
    .addRegistration("__mf_container_fynapp-combo", { url: entry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-combo", { url: entry })
    .addRegistration("./main-aaa.js", { url: byUrl })
    .addRegistration("./deep-ddd.js", { url: bySpecifier })
    // known to the loader, url and all, and never instantiated
    .addRegistration("./late-ccc.js", { url: neverRun, registration: [[], () => ({})] })
    // the same state, filed the way a combined member really is: the specifier
    // side carries the url and no code, the url side carries the code and no
    // url of its own. Registered specifier-first, which is the order the demo
    // page shows.
    .addRegistration("./split-eee.js", { url: splitKeys })
    .addRegistration(splitKeys, { registration: [[], () => ({})] });

  federation
    .addBundle(byUrl, combo)
    .addBundle(bySpecifier, combo)
    .addBundle(neverRun, combo)
    .addBundle(splitKeys, combo);

  return { loader, federation };
}

/**
 * Three containers whose own `scope` cannot be read, for the three answers
 * that used to be one invented string.
 *
 * `Container.scope` is not one of the mangled slots, so this is not the
 * minified-build case: it is the container the collector cannot *reach* -- one
 * discovered from a registration whose record exports no container, or from
 * the share store alone -- plus, for completeness, a container object that
 * simply does not carry the field.
 *
 * - `fynapp-ghost` is registered and nothing else. No record, no container
 *   object, no share store entry: nobody can say which scope it is in.
 * - `fynapp-mangled` has a readable `$SC` and no `scope`. The store names it
 *   as a source in exactly one scope, which is where its declarations have to
 *   be looked up -- the case that proves the display fallback and the lookup
 *   fallback are two decisions.
 * - `fynapp-both` files copies into two scopes, so the store cannot pick one
 *   for it either.
 */
export function unreadableScopePage(): {
  loader: FakeLoader;
  federation: FakeFederation;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const ghostEntry = "https://app.test/fynapp-ghost/dist/fynapp-entry.js";
  const mangledEntry = "https://app.test/fynapp-mangled/dist/fynapp-entry.js";
  const bothEntry = "https://app.test/fynapp-both/dist/fynapp-entry.js";
  const mangledMain = "https://app.test/fynapp-mangled/dist/main-mmm.js";
  const react19 = "https://app.test/react-19/dist/react.js";

  const mangled = new FakeContainer(
    "__mf_container_fynapp-mangled",
    "fynapp-mangled",
    "fynmesh",
    "1.0.0"
  )
    .share("esm-react", { semver: "^19.0.0", singleton: true }, { "19.0.0": { id: react19 } })
    .expose("./main", "./main-mmm.js");
  // the one fact under test: no readable scope of its own
  delete (mangled as { scope?: string }).scope;

  loader
    .addRecord({ id: mangledEntry, n: { container: mangled, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: "./main-mmm.js", n: { main: 1 }, d: [] })
    .addRecord({ id: react19, n: { react: 1 }, d: [] })
    // a record for the ghost's entry that exports no container at all
    .addRecord({ id: ghostEntry, n: { default: {} }, d: [] });

  loader
    .addRegistration("__mf_container_fynapp-ghost", { url: ghostEntry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-mangled", { url: mangledEntry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-both", { url: bothEntry }, "1.0.0")
    .addRegistration("./main-mmm.js", { url: mangledMain });

  federation
    .addShare("fynmesh", "esm-react", "19.0.0", {
      url: react19,
      id: react19,
      container: "fynapp-mangled",
      containerVersion: "1.0.0",
    })
    .addShare("fynmesh", "design-tokens", "1.0.0", {
      container: "fynapp-both",
      containerVersion: "1.0.0",
    })
    .addShare("other", "design-tokens", "1.0.0", {
      container: "fynapp-both",
      containerVersion: "1.0.0",
    });

  return { loader, federation };
}

/**
 * A container nothing can be read from, on a page with no share store at all.
 *
 * The exact branch this ticket is about: with no scope collected, the last
 * fallback used to hand the node the string `default` -- a real and common
 * module federation scope name, printed as if it had been read.
 */
export function noShareStorePage(): {
  loader: FakeLoader;
  federation: FakeFederation;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();
  const entry = "https://app.test/fynapp-ghost/dist/fynapp-entry.js";

  loader
    .addRecord({ id: entry, n: { default: {} }, d: [] })
    .addRegistration("__mf_container_fynapp-ghost", { url: entry }, "1.0.0");

  return { loader, federation };
}
