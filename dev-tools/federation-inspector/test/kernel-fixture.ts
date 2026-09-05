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
    bootstrapCoordinator: {
      canBootstrap: () => true,
      bootstrappingApp: undefined,
      deferredBootstraps: [],
    },
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
