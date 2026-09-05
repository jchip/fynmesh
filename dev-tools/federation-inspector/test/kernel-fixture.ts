/**
 * A fake `@fynmesh/kernel`, in both the shapes it actually ships in.
 *
 * Built to the kernel's own contracts -- `FynApp`, `FynAppState`,
 * `FynAppMiddlewareReg`, `MiddlewareUseMeta` and the double-keyed
 * `FynAppRegistry` -- rather than to what the collector happens to look for, so
 * a failure here means the collector disagrees with the kernel and not that two
 * mocks drifted apart.
 *
 * The minified variant is the one that earns its keep. esbuild emits every
 * class field as `__publicField(this, "bootstrapCoordinator")` and the kernel's
 * terser run keeps that quoted key while renaming the assignment, so on a
 * production page the field is an **own enumerable property whose value is
 * `undefined`**. Any probe written as `"bootstrapCoordinator" in kernel` passes
 * there and reads `undefined` off the other side of it. `minifiedKernel()`
 * reproduces that exactly, which is the only way a test can tell a probe that
 * checks presence from one that checks shape.
 */

import type {
  ContainerNode,
  ContainerVersionNode,
  FynAppManifest,
} from "../src/core/model.js";
import { FakeContainer, FakeFederation, FakeLoader } from "./fixture.js";

export interface FakeFynAppOptions {
  name: string;
  version: string;
  packageName?: string;
  /** exposes the kernel loaded: name -> the expose object */
  exposes?: Record<string, Record<string, unknown>>;
  /** exposes the build declared, i.e. `container.$E` */
  declared?: string[];
  /** middleware names that wrote into `middlewareContext`, in write order */
  delivered?: string[];
  config?: unknown;
}

export interface FakeFynApp {
  name: string;
  version: string;
  packageName: string;
  entry: { container: { name: string; version: string; $E: Record<string, string> } };
  config?: unknown;
  exposes: Record<string, Record<string, unknown>>;
  middlewareContext: Map<string, Record<string, unknown>>;
}

export function fakeFynApp(opts: FakeFynAppOptions): FakeFynApp {
  const $E: Record<string, string> = {};
  for (const name of opts.declared ?? Object.keys(opts.exposes ?? {})) {
    $E[name] = "." + name.replace(/^\./, "") + "-chunk.js";
  }
  const middlewareContext = new Map<string, Record<string, unknown>>();
  for (const key of opts.delivered ?? []) {
    middlewareContext.set(key, { api: {} });
  }
  const app: FakeFynApp = {
    name: opts.name,
    version: opts.version,
    packageName: opts.packageName ?? opts.name,
    entry: { container: { name: opts.name, version: opts.version, $E } },
    exposes: opts.exposes ?? {},
    middlewareContext,
  };
  if (opts.config !== undefined) {
    app.config = opts.config;
  }
  return app;
}

/** A FynUnit as `useMiddleware` leaves it: hooks plus `__middlewareMeta`. */
export function fakeUnit(
  hooks: string[],
  middlewareMeta?: unknown[]
): Record<string, unknown> {
  const unit: Record<string, unknown> = {};
  for (const hook of hooks) {
    unit[hook] = () => undefined;
  }
  if (middlewareMeta) {
    unit.__middlewareMeta = middlewareMeta;
  }
  return { main: unit };
}

export interface FakeMiddlewareOptions {
  provider: string;
  name: string;
  hostVersion: string;
  exposeName?: string;
  exportName?: string;
  autoApplyScope?: string[];
  hasSetup?: boolean;
  hasApply?: boolean;
  hasShouldApply?: boolean;
  /** any of `canOverrideExecution`, `overrideInitialize`, `overrideExecute` */
  overrideHooks?: string[];
  /**
   * put something unreadable at this version key instead of a registration.
   *
   * A real registry never holds a string here; a mangled or half-written one
   * can, and the collector has to report that as unreadable rather than skip it.
   */
  unreadable?: boolean;
}

/** What `bootstrapCoordinator` should be holding. */
export interface FakeBootstrapOptions {
  /** the FynApp *name* holding the lock; omitted is the kernel's own `null` */
  holder?: string;
  /** the queue behind the lock, in order */
  deferred?: Array<{ name: string; version: string }>;
  /** names the coordinator has seen finish, i.e. `fynAppBootstrapStatus` */
  bootstrapped?: string[];
  /** `fynAppProviderModes`: app -> middleware -> role */
  providerModes?: Record<string, Record<string, "provider" | "consumer">>;
  /**
   * put something unreadable at these coordinator fields.
   *
   * A real coordinator never does this; a partially-mangled or half-built one
   * can, and the collector has to name the gap rather than report an idle queue.
   */
  unreadable?: Array<
    | "bootstrappingApp"
    | "deferredBootstraps"
    | "fynAppBootstrapStatus"
    | "fynAppProviderModes"
  >;
  /** queue entries carrying no readable `fynApp` */
  unreadableDeferred?: number;
}

export interface FakeKernelOptions {
  apps?: FakeFynApp[];
  states?: Array<{
    name: string;
    version: string;
    status: string;
    updatedAt?: number;
    mountedAt?: number;
    error?: unknown;
  }>;
  middlewares?: FakeMiddlewareOptions[];
  version?: string;
  shareScopeName?: string;
  /** drop `listFynAppStates`, as an older kernel would */
  noLifecycle?: boolean;
  /** drop `runTime.middlewares` entirely: a registry that cannot be read */
  noMiddlewares?: boolean;
  /**
   * where auto-apply can be read from.
   *
   * `runTime` is the current kernel. `mwMgr` is one whose `runTime.autoApply`
   * has not been created yet -- the field only appears once a middleware with a
   * scope registers -- leaving `mwMgr.getAutoApply()` as the answer. `none` is
   * a kernel with neither, where "does this auto-apply" has no answer at all.
   */
  autoApply?: "runTime" | "mwMgr" | "none";
  /** what `bootstrapCoordinator` holds; the default is an idle, healthy queue */
  bootstrap?: FakeBootstrapOptions;
}

interface Built {
  apps: Record<string, FakeFynApp>;
  middlewares: Record<string, Record<string, unknown>>;
  autoApply: { fynapp: unknown[]; mw: unknown[] };
  states: unknown[];
}

/** `runTime`, wired to expose auto-apply from wherever this kernel keeps it. */
function runTimeOf(opts: FakeKernelOptions, built: Built): Record<string, unknown> {
  const runTime: Record<string, unknown> = { apps: built.apps };
  if (!opts.noMiddlewares) {
    runTime.middlewares = built.middlewares;
  }
  if ((opts.autoApply ?? "runTime") === "runTime") {
    runTime.autoApply = built.autoApply;
  }
  return runTime;
}

/** `kernel.mwMgr`, which is hand-reserved and so survives the min build. */
function mwMgrOf(opts: FakeKernelOptions, built: Built): Record<string, unknown> | undefined {
  const mode = opts.autoApply ?? "runTime";
  if (mode === "none") {
    return undefined;
  }
  return { getAutoApply: () => built.autoApply };
}

function build(opts: FakeKernelOptions): Built {
  // FynAppRegistry.add files each app under BOTH keys -- that doubling is what
  // a collector has to dedupe, and it is why the bare key is ambiguous when two
  // versions of one name are live
  const apps: Record<string, FakeFynApp> = {};
  for (const app of opts.apps ?? []) {
    apps[app.name + "@" + app.version] = app;
    apps[app.name] = app;
  }

  const middlewares: Record<string, Record<string, unknown>> = {};
  const autoApply: { fynapp: unknown[]; mw: unknown[] } = { fynapp: [], mw: [] };
  for (const mw of opts.middlewares ?? []) {
    const regKey = mw.provider + "::" + mw.name;
    const host =
      (opts.apps ?? []).find(
        (a) => a.name === mw.provider && a.version === mw.hostVersion
      ) ?? fakeFynApp({ name: mw.provider, version: mw.hostVersion });
    const mwObj: Record<string, unknown> = {
      name: mw.name,
      autoApplyScope: mw.autoApplyScope,
      setup: mw.hasSetup === false ? undefined : () => undefined,
      apply: mw.hasApply === false ? undefined : () => undefined,
    };
    if (mw.hasShouldApply) {
      mwObj.shouldApply = () => true;
    }
    for (const hook of mw.overrideHooks ?? []) {
      mwObj[hook] = () => undefined;
    }
    const reg = {
      regKey,
      fullKey: mw.provider + "@" + mw.hostVersion + "::" + mw.name,
      hostFynApp: host,
      exposeName: mw.exposeName ?? "./middleware/" + mw.name,
      exportName: mw.exportName ?? "__middleware__" + mw.name,
      mw: mwObj,
    };
    const versionMap = (middlewares[regKey] ??= {});
    if (mw.unreadable) {
      // a version key holding something that is not a registration; `default`
      // is deliberately left pointing wherever it already pointed
      versionMap[mw.hostVersion] = "[unreadable]";
      continue;
    }
    versionMap[mw.hostVersion] = reg;
    // `default` is set once, by whichever version registers first, and the
    // kernel never re-points it (FYM-332). `??=` is that rule.
    versionMap.default ??= reg;
    for (const scope of mw.autoApplyScope ?? []) {
      if (scope === "all" || scope === "fynapp") {
        autoApply.fynapp.push(reg);
      }
      if (scope === "all" || scope === "middleware") {
        autoApply.mw.push(reg);
      }
    }
  }

  const states = (opts.states ?? []).map((s) => ({
    name: s.name,
    version: s.version,
    status: s.status,
    updatedAt: s.updatedAt ?? 1_000,
    mountedAt: s.mountedAt,
    error: s.error,
  }));

  return { apps, middlewares, autoApply, states };
}

/**
 * `bootstrapCoordinator`, live collections and all.
 *
 * The real coordinator is a closure that publishes its `Array` and its two
 * `Map`s on the object it returns, so this publishes the same things -- a
 * deferred entry is a real `{ fynApp, resolve, timeoutId }` holding a whole
 * FynApp, which is what makes the structured-clone assertion mean something.
 *
 * `bootstrappingApp` is an accessor over a `string | null` there, so it is one
 * here too: a probe that reads it must survive a getter, and `null` -- the
 * kernel's own "the lock is free" -- must stay distinguishable from a read that
 * failed. The unreadable variant therefore throws rather than returning junk.
 */
function coordinatorOf(opts: FakeBootstrapOptions = {}): Record<string, unknown> {
  const unreadable = new Set(opts.unreadable ?? []);

  const deferredBootstraps: unknown[] = (opts.deferred ?? []).map((d) => ({
    fynApp: fakeFynApp({ name: d.name, version: d.version }),
    resolve: () => undefined,
    timeoutId: 1 as unknown,
  }));
  for (let i = 0; i < (opts.unreadableDeferred ?? 0); i++) {
    // a queue entry whose fynApp is not there: still an app that is not mounted
    deferredBootstraps.push({ resolve: () => undefined });
  }

  const fynAppBootstrapStatus = new Map<string, "bootstrapped">();
  for (const name of opts.bootstrapped ?? []) {
    fynAppBootstrapStatus.set(name, "bootstrapped");
  }

  const fynAppProviderModes = new Map<string, Map<string, "provider" | "consumer">>();
  for (const [app, roles] of Object.entries(opts.providerModes ?? {})) {
    fynAppProviderModes.set(app, new Map(Object.entries(roles)));
  }

  const bc: Record<string, unknown> = {
    canBootstrap: () => true,
    acquireBootstrapLock: () => true,
    releaseBootstrapLock: () => undefined,
    deferredBootstraps: unreadable.has("deferredBootstraps")
      ? "[unreadable]"
      : deferredBootstraps,
    fynAppBootstrapStatus: unreadable.has("fynAppBootstrapStatus")
      ? "[unreadable]"
      : fynAppBootstrapStatus,
    fynAppProviderModes: unreadable.has("fynAppProviderModes")
      ? "[unreadable]"
      : fynAppProviderModes,
  };
  Object.defineProperty(bc, "bootstrappingApp", {
    enumerable: true,
    get: () => {
      if (unreadable.has("bootstrappingApp")) {
        throw new Error("bootstrappingApp is not readable");
      }
      return opts.holder ?? null;
    },
  });
  return bc;
}

/**
 * The dev build: `bootstrapCoordinator` is a real object with real methods.
 */
export function devKernel(opts: FakeKernelOptions = {}): Record<string, unknown> {
  const built = build(opts);
  const { states } = built;
  const kernel: Record<string, unknown> = {
    version: opts.version ?? "1.1.2",
    shareScopeName: opts.shareScopeName ?? "fynmesh",
    runTime: runTimeOf(opts, built),
    mwMgr: mwMgrOf(opts, built),
    bootstrapCoordinator: coordinatorOf(opts.bootstrap),
  };
  if (!opts.noLifecycle) {
    kernel.listFynAppStates = () => states;
  }
  return kernel;
}

/**
 * The min build: every mangled field is an own property holding `undefined`.
 *
 * The real objects live behind one-character names, which are build-output
 * artefacts and deliberately not reachable from here -- reading `kernel.jt`
 * would be reading a different thing after every terser run.
 */
export function minifiedKernel(opts: FakeKernelOptions = {}): Record<string, unknown> {
  const built = build(opts);
  const { states } = built;
  const kernel: Record<string, unknown> = {
    version: opts.version ?? "1.1.2",
    shareScopeName: opts.shareScopeName ?? "fynmesh",
    runTime: runTimeOf(opts, built),
    // `mwMgr` and `getAutoApply` are both hand-reserved, so they keep their
    // names here exactly as they do in the shipped min build
    mwMgr: mwMgrOf(opts, built),
    // __publicField(this, "...") husks: present, own, enumerable, undefined
    bootstrapCoordinator: undefined,
    middlewareExecutor: undefined,
    fynAppLifecycle: undefined,
    fynAppRegistry: undefined,
    manifestResolver: undefined,
    busRoot: undefined,
    // the mangled slots the real objects actually sit at
    jt: { canBootstrap: () => true },
    Pt: { list: () => states },
  };
  if (!opts.noLifecycle) {
    kernel.listFynAppStates = () => states;
  }
  return kernel;
}

/**
 * The demo's `shell.html`, which is the page auto-apply actually happens on.
 *
 * Reproduced from the live kernel read off that page rather than invented, and
 * it is the shape FYM-347 was found in: `fynapp-shell-mw::shell-layout`
 * declares `autoApplyScope: ["fynapp", "middleware"]`, **no** `__middlewareMeta`
 * anywhere on the page names it, and three FynApps nonetheless carry
 * `shell-layout` in their `middlewareContext` -- including its own host, which
 * the "middleware" half of the scope applies it to.
 *
 * `demo.html` cannot stand in for this. There every delivered key has a
 * declaration behind it, so a collector that files consumers from declarations
 * alone looks perfectly correct on it.
 *
 * Three routes in one page, deliberately:
 *
 * - `shell-layout` -- delivered to three apps, declared by none.
 * - `design-tokens` -- declared by two apps and delivered to both, the ordinary
 *   route, which must keep working exactly as it did.
 * - `react-context` -- registered, declared by nobody, delivered to nobody. The
 *   control: "nobody uses this" has to stay reachable, or the fix has traded one
 *   false claim for another.
 */
export function autoAppliedShellPage(): FakeKernelOptions {
  return {
    apps: [
      // the middleware's own host: `autoApplyScope` includes "middleware", so
      // the kernel applies it to middleware-providing FynApps as well
      fakeFynApp({
        name: "fynapp-shell-mw",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["execute"]) },
        delivered: ["shell-layout"],
      }),
      fakeFynApp({
        name: "fynapp-sidebar",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["execute"]) },
        delivered: ["shell-layout"],
      }),
      fakeFynApp({
        name: "fynapp-x1",
        version: "1.0.0",
        exposes: {
          "./main": fakeUnit(["execute"], [
            { info: { name: "design-tokens", provider: "fynapp-design-tokens", version: "^1.0.0" }, config: {} },
          ]),
        },
        delivered: ["shell-layout", "design-tokens"],
      }),
      fakeFynApp({
        name: "fynapp-x1",
        version: "2.0.0",
        exposes: {
          "./main": fakeUnit(["execute"], [
            { info: { name: "design-tokens", provider: "fynapp-design-tokens", version: "^1.0.0" }, config: {} },
          ]),
        },
        delivered: ["design-tokens"],
      }),
      fakeFynApp({ name: "fynapp-design-tokens", version: "1.0.0" }),
      fakeFynApp({ name: "fynapp-react-middleware", version: "1.0.0" }),
    ],
    middlewares: [
      {
        provider: "fynapp-shell-mw",
        name: "shell-layout",
        hostVersion: "1.0.0",
        autoApplyScope: ["fynapp", "middleware"],
        overrideHooks: ["overrideExecute"],
      },
      { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
      { provider: "fynapp-react-middleware", name: "react-context", hostVersion: "1.0.0" },
    ],
  };
}

/**
 * A `ContainerNode` shaped as the federation collector leaves one.
 *
 * The FynMesh diagnostics join the kernel's registry against the containers the
 * loader saw, and the distinction they turn on -- a name with a container but no
 * FynApp is a loaded library, a name with neither is genuinely absent -- can only
 * be exercised with both halves present. Plain data rather than a fake loader,
 * because that is exactly what the collector hands the analysis layer.
 */
export function fakeContainerNode(opts: {
  name: string;
  version: string;
  manifest?: FynAppManifest;
  exposes?: string[];
}): ContainerNode {
  const version: ContainerVersionNode = {
    version: opts.version,
    entryId: "__mf_container_" + opts.name,
    stage: "executed",
    scope: "fynmesh",
    exposes: (opts.exposes ?? ["./main"]).map((name) => ({
      name,
      chunkId: "." + name.replace(/^\./, "") + "-chunk.js",
      stage: "executed" as const,
      loaded: true,
    })),
    provides: [],
    consumes: [],
    moduleIds: [],
  };
  if (opts.manifest) {
    version.manifest = opts.manifest;
  }
  return {
    name: opts.name,
    id: "__mf_container_" + opts.name,
    versions: [version],
  };
}

/**
 * The real demo's `fynapp-1`, which is the page all three numbers disagreed on.
 *
 * Federation and a kernel on one page, wired to the shape a live collect really
 * found (`.temp/collect.json`, taken off `demo.html`):
 *
 * - the build declared **five** exposes;
 * - the loader has **two** of the chunks -- `./main`, and `./App` because
 *   `./main` imports the App component itself, not because anything imported
 *   the expose;
 * - the kernel imported **one**, `./main`.
 *
 * Nothing here is a hypothetical: the chunk names are the demo's own. A fixture
 * where every declared expose is loaded and imported -- which is what the
 * fixtures were before this -- cannot tell the three levels apart, which is why
 * the disagreement had to be found in a browser.
 */
export function fynApp1Page(): {
  loader: FakeLoader;
  federation: FakeFederation;
  kernel: Record<string, unknown>;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const base = "https://app.test/fynapp-1/dist/";
  const entry = base + "fynapp-entry.js";
  const main = base + "main-D396sYtd.js";
  const appChunk = base + "App-BvOD4S9o.js";

  const container = new FakeContainer(
    "__mf_container_fynapp-1",
    "fynapp-1",
    "fynmesh",
    "1.0.0"
  )
    .expose("./main", "./main-D396sYtd.js")
    .expose("./App", "./App-BvOD4S9o.js")
    .expose("./hello", "./hello-CHU6jq3a.js")
    .expose("./getInfo", "./getInfo-C7Esg9Mn.js")
    .expose("./component", "./component-DsUCLrn8.js");

  loader
    .addRecord({ id: entry, n: { container, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: appChunk, n: { default: {} }, d: [] });
  // `./main` depends on the App chunk -- the whole reason the loader has a
  // chunk nobody imported the expose of
  loader.addRecord({ id: main, n: { main: {} }, d: [{ id: appChunk, d: [] }] });

  loader
    .addRegistration("__mf_container_fynapp-1", { url: entry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-1", { url: entry })
    .addRegistration("./main-D396sYtd.js", { url: main })
    .addRegistration("./App-BvOD4S9o.js", { url: appChunk });
  // the other three chunks have no registration and no record at all: the
  // loader has never heard of them

  const kernel = devKernel({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["initialize", "execute"]) },
        declared: ["./main", "./App", "./hello", "./getInfo", "./component"],
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted", mountedAt: 1000 }],
  });

  return { loader, federation, kernel };
}

/**
 * The real demo's `fynapp-design-tokens`, whose two tabs still disagreed after
 * the three levels were named.
 *
 * Its `$E` carries two keys and only one chunk id: `./main` is inlined into the
 * entry (`_E("./main", Promise.resolve().then(...))` stores an `undefined` id),
 * `./middleware/design-tokens` is a real chunk. The federation pass used to
 * skip the chunk-less key while the FynMesh pass kept it, so Containers read
 * `1/1 imported` beside a FynApps row reading `1/2 imported` -- the same word,
 * two denominators, off one `$E`.
 *
 * The kernel imports only the middleware expose, which is what the demo does.
 */
export function designTokensPage(): {
  loader: FakeLoader;
  federation: FakeFederation;
  kernel: Record<string, unknown>;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const base = "https://app.test/fynapp-design-tokens/dist/";
  const entry = base + "fynapp-entry.js";
  const mw = base + "design-tokens-cAzYYAY9.js";

  const container = new FakeContainer(
    "__mf_container_fynapp-design-tokens",
    "fynapp-design-tokens",
    "fynmesh",
    "1.0.0"
  )
    .inlinedExpose("./main")
    .expose("./middleware/design-tokens", "./design-tokens-cAzYYAY9.js");

  loader
    .addRecord({ id: entry, n: { container, init: () => {}, get: () => {} }, d: [] })
    .addRecord({ id: mw, n: { default: {} }, d: [] });

  loader
    .addRegistration("__mf_container_fynapp-design-tokens", { url: entry }, "1.0.0")
    .addRegistration("__mf_container_fynapp-design-tokens", { url: entry })
    .addRegistration("./design-tokens-cAzYYAY9.js", { url: mw });

  const kernel = devKernel({
    apps: [
      fakeFynApp({
        name: "fynapp-design-tokens",
        version: "1.0.0",
        exposes: { "./middleware/design-tokens": {} },
        declared: ["./main", "./middleware/design-tokens"],
      }),
    ],
    states: [
      { name: "fynapp-design-tokens", version: "1.0.0", status: "mounted", mountedAt: 1000 },
    ],
  });

  return { loader, federation, kernel };
}

/**
 * A FynApp whose container declares nothing at all, as `fynapp-react-lib` does
 * on the demo: it is a shared-library fynapp, all shares and no exposes.
 *
 * Zero exposes is where "did the FynMesh pass mark this version?" cannot be
 * read back off the exposes array, so it is the case that proves the flag has
 * to be recorded rather than sniffed.
 */
export function libOnlyPage(): {
  loader: FakeLoader;
  federation: FakeFederation;
  kernel: Record<string, unknown>;
} {
  const loader = new FakeLoader();
  const federation = new FakeFederation();

  const entry = "https://app.test/fynapp-react-lib/dist/fynapp-entry.js";
  const container = new FakeContainer(
    "__mf_container_fynapp-react-lib",
    "fynapp-react-lib",
    "fynmesh",
    "19.2.8"
  );

  loader.addRecord({ id: entry, n: { container, init: () => {}, get: () => {} }, d: [] });
  loader
    .addRegistration("__mf_container_fynapp-react-lib", { url: entry }, "19.2.8")
    .addRegistration("__mf_container_fynapp-react-lib", { url: entry });

  const kernel = devKernel({
    apps: [
      fakeFynApp({ name: "fynapp-react-lib", version: "19.2.8", exposes: {}, declared: [] }),
    ],
    states: [{ name: "fynapp-react-lib", version: "19.2.8", status: "mounted", mountedAt: 1000 }],
  });

  return { loader, federation, kernel };
}
