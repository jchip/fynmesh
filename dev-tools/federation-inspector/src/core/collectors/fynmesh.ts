/**
 * The FynMesh kernel collector.
 *
 * One layer above federation: a FynApp *is* a container version, seen from the
 * kernel's side. `kernel.runTime.apps` is what separates the two -- a container
 * nobody loaded through `loadFynApp` is a plain federated library and is absent
 * from it, so membership there is the authoritative FynApp signal. Not the
 * presence of `__FYNAPP_MANIFEST__`, which the rollup plugin emits for every
 * container it builds.
 *
 * Two rules run through everything here.
 *
 * **Probe by value and shape, never by `in`.** The browser kernel's min build
 * mangles property names, and esbuild emits every class field as
 * `__publicField(this, "name")` with `keep_quoted: true` preserving the quoted
 * key. So `kernel.bootstrapCoordinator` is an *own enumerable property holding
 * `undefined`* in a production build while the real object sits at a
 * one-character name. `"bootstrapCoordinator" in kernel` is true in both
 * builds; it distinguishes nothing. That trap is also the one useful signal it
 * leaves behind, and `detectBuild` below reads it deliberately.
 *
 * **Nothing live goes into the snapshot.** Every value here is a string, a
 * number, a boolean or a structured-clone-safe clone of one, because the
 * snapshot crosses a postMessage bridge in `adapters/remote.ts` and is what a
 * bug report carries. A FynApp's `config` and its middleware configs are
 * author-authored objects that routinely hold functions and DOM nodes, so they
 * are cloned defensively or reduced to their key names.
 */

import type {
  BootstrapBlockerNode,
  BootstrapDeferredNode,
  BootstrapModeNode,
  BootstrapQueueNode,
  Capability,
  ContainerNode,
  FynAppNode,
  FynAppStatus,
  FynMeshNode,
  KernelBuild,
  MiddlewareConsumerNode,
  MiddlewareNode,
  MiddlewareResolution,
  MiddlewareUseNode,
  MiddlewareVersionNode,
} from "../model.js";
import { attempt, isFn, safeGet } from "../capability.js";
import { maxSatisfying } from "../../analysis/semver.js";

/** The five statuses `FynAppLifecycle` records. Anything else is not one. */
const STATUSES = new Set<string>([
  "bootstrapping",
  "mounted",
  "suspended",
  "failed",
  "shutdown",
]);

/** The FynUnit hooks worth reporting, in the order the kernel calls them. */
const UNIT_HOOKS = ["initialize", "execute", "shutdown", "suspend", "resume"];

/**
 * The `FynAppMiddleware` hooks that take over a consumer's own execution.
 *
 * Any one of them makes the middleware able to run instead of the FynUnit it
 * was applied to, which is a different order of power from `setup`/`apply` and
 * is why the Middleware view names which one rather than only marking a tick.
 */
const OVERRIDE_HOOKS = ["canOverrideExecution", "overrideInitialize", "overrideExecute"];

/** The prefix `useMiddleware`'s string form carries. */
const MW_STRING_TAG = "-FYNAPP_MIDDLEWARE";

/** The slot `MiddlewareManager` files the first-registered version under. */
const DEFAULT_SLOT = "default";

export interface FynMeshResult {
  /** absent when there is no kernel on this page -- see `collectFynMesh` */
  fynmesh?: FynMeshNode;
  errors: string[];
}

/**
 * Find the kernel and work out which build it is.
 *
 * `globalThis.fynMeshKernel` is the only global the kernel publishes. Whether
 * the object found there is a kernel is decided by shape, not by name: an
 * unrelated global of that name with no `runTime` and no `listFynAppStates` is
 * not a kernel, and reporting it as one would put an empty FynApps tab on a
 * page that has no FynMesh at all -- the exact confusion this collector exists
 * to avoid.
 */
export function probeKernel(kernel?: unknown): { kernel: any; build: KernelBuild } {
  const found = kernel ?? safeGet(globalThis, "fynMeshKernel");
  if (!found || typeof found !== "object") {
    return { kernel: undefined, build: "unknown" };
  }
  const looksLikeKernel =
    isObject(safeGet(found, "runTime")) || isFn(safeGet(found, "listFynAppStates"));
  if (!looksLikeKernel) {
    return { kernel: undefined, build: "unknown" };
  }
  return { kernel: found, build: detectBuild(found) };
}

/**
 * dev build, min build, or something we have not seen.
 *
 * `bootstrapCoordinator` is not in the kernel's derived reserved-names list, so
 * it is the cleanest witness of which build this is -- a real object with a
 * `canBootstrap` method in the dev build, and the `__publicField` husk
 * described at the top of this file in the min build. A kernel with neither is
 * some third thing (an older version, a different bundler), and saying
 * "unknown" is more useful than guessing "minified" and then refusing to show
 * panels that would have worked.
 */
function detectBuild(kernel: any): KernelBuild {
  const bc = safeGet(kernel, "bootstrapCoordinator");
  if (isObject(bc) && isFn(safeGet(bc, "canBootstrap"))) {
    return "dev";
  }
  const husk = attempt(() =>
    bc === undefined && Object.prototype.hasOwnProperty.call(kernel, "bootstrapCoordinator")
  );
  return husk ? "minified" : "unknown";
}

/**
 * Read the kernel into the snapshot's `fynmesh` node.
 *
 * Returns `{ errors }` with no `fynmesh` when there is no kernel. That absence
 * is load-bearing: the FynApps tab keys off it to hide itself, so a plain
 * federation page never shows an empty FynApps table that reads as "this page
 * has zero FynApps" when the truth is "this page has no kernel".
 */
export function collectFynMesh(
  kernelInput: unknown,
  containers: ContainerNode[],
  cap: Capability
): FynMeshResult {
  const errors: string[] = [];
  const { kernel, build } = probeKernel(kernelInput);

  if (!kernel) {
    return { errors };
  }

  cap.kernel = true;

  const runTime = safeGet<any>(kernel, "runTime");
  const apps = isObject(runTime) ? safeGet<any>(runTime, "apps") : undefined;
  const registry: Record<string, any> = isObject(apps) ? apps : {};
  cap.kernelRunTime = isObject(apps);

  const middlewares = isObject(runTime) ? safeGet<any>(runTime, "middlewares") : undefined;
  cap.kernelMiddleware = isObject(middlewares);

  const states = readStates(kernel, errors);
  cap.kernelLifecycle = states !== undefined;

  if (!cap.kernelRunTime) {
    cap.notes.push(
      "A FynMesh kernel is on this page but kernel.runTime.apps could not be " +
        "read, so the FynApps list is built from lifecycle state alone and " +
        "carries no exposes or middleware."
    );
  }
  if (!cap.kernelLifecycle) {
    cap.notes.push(
      "kernel.listFynAppStates is missing: FynApps are listed, but their " +
        "mount status, timings and errors are unavailable in this build."
    );
  }
  if (!cap.kernelMiddleware) {
    cap.notes.push(
      "kernel.runTime.middlewares could not be read: the Middleware view " +
        "reports the registry as unreadable rather than empty, and every " +
        "FynApp's declarations are left unresolved."
    );
  }

  const built = cap.kernelMiddleware
    ? buildMiddlewares(middlewares, runTime, kernel)
    : { nodes: [], autoApplyReadable: false };
  const mwNodes = built.nodes;
  if (cap.kernelMiddleware && !built.autoApplyReadable) {
    cap.notes.push(
      "Neither kernel.runTime.autoApply nor kernel.mwMgr.getAutoApply() could " +
        "be read: the Middleware view's auto-apply column is unknown, not empty."
    );
  }

  // The bootstrap queue, and only where the queue is really there. Which build
  // this is has already been decided, by shape, in `detectBuild` -- "dev" is
  // the one and only case where `bootstrapCoordinator` holds the real
  // coordinator rather than the `__publicField` husk described at the top of
  // this file. Re-probing here with a second, weaker test is exactly how a
  // production page ends up rendering an empty queue that reads as an idle one.
  const coordinator = build === "dev" ? safeGet<any>(kernel, "bootstrapCoordinator") : undefined;
  const bootstrapQueue = isObject(coordinator) ? buildBootstrapQueue(coordinator) : undefined;
  cap.kernelBootstrap = bootstrapQueue !== undefined;
  if (!cap.kernelBootstrap) {
    cap.notes.push(
      "kernel.bootstrapCoordinator is not readable in this build: it is " +
        "mangled in the production kernel, so the bootstrap queue panel says " +
        "unavailable rather than idle -- the two mean opposite things."
    );
  }

  const registered = indexRegistry(registry);
  const appNodes = buildApps(registered, states ?? [], mwNodes, containers, middlewares);

  // consumers are the middleware registry read from the other side; doing it
  // here rather than in `buildMiddlewares` keeps one pass over the apps
  const byRegKey = new Map(mwNodes.map((m) => [m.regKey, m]));
  for (const node of appNodes) {
    for (const use of node.usesMiddleware) {
      const mw = use.resolvedRegKey ? byRegKey.get(use.resolvedRegKey) : undefined;
      if (!mw) {
        continue;
      }
      if (!mw.consumers.includes(node.key)) {
        mw.consumers.push(node.key);
      }
      addConsumer(mw, node.key, use);
    }
  }

  const fynmesh: FynMeshNode = {
    build,
    apps: appNodes,
    middlewares: mwNodes,
    autoApplyReadable: built.autoApplyReadable,
  };
  if (bootstrapQueue) {
    fynmesh.bootstrapQueue = bootstrapQueue;
  }
  const version = safeGet<string>(kernel, "version");
  if (typeof version === "string") {
    fynmesh.kernelVersion = version;
  }
  const scope = safeGet<string>(kernel, "shareScopeName");
  if (typeof scope === "string") {
    fynmesh.shareScopeName = scope;
  }

  return { fynmesh, errors };
}

/* --------------------------------------------------------------- lifecycle */

interface StateRow {
  name: string;
  version: string;
  status?: FynAppStatus;
  updatedAt?: number;
  mountedAt?: number;
  error?: { message: string; stack?: string };
}

/**
 * Lifecycle state, through the method rather than the field.
 *
 * `kernel.fynAppLifecycle` is mangled in the min build, `listFynAppStates` is
 * reserved and works everywhere -- so the method is the primary and the field
 * is only a fallback for a kernel too old to have the method. `undefined` here
 * means "could not read", which is a different thing from "no apps have state"
 * and is what `capability.kernelLifecycle` reports.
 */
function readStates(kernel: any, errors: string[]): StateRow[] | undefined {
  let raw: unknown;
  const list = safeGet(kernel, "listFynAppStates");
  if (isFn(list)) {
    raw = attempt(() => list.call(kernel));
  } else {
    const lifecycle = safeGet<any>(kernel, "fynAppLifecycle");
    const legacy = isObject(lifecycle) ? safeGet(lifecycle, "list") : undefined;
    if (isFn(legacy)) {
      raw = attempt(() => legacy.call(lifecycle));
    }
  }

  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    errors.push("kernel.listFynAppStates() did not return an array; ignoring it");
    return undefined;
  }

  const rows: StateRow[] = [];
  for (const entry of raw) {
    const name = safeGet<string>(entry, "name");
    const version = safeGet<string>(entry, "version");
    if (typeof name !== "string" || typeof version !== "string") {
      continue;
    }
    const status = safeGet<string>(entry, "status");
    const row: StateRow = { name, version };
    if (typeof status === "string" && STATUSES.has(status)) {
      row.status = status as FynAppStatus;
    }
    const updatedAt = safeGet<number>(entry, "updatedAt");
    if (typeof updatedAt === "number") {
      row.updatedAt = updatedAt;
    }
    const mountedAt = safeGet<number>(entry, "mountedAt");
    if (typeof mountedAt === "number") {
      row.mountedAt = mountedAt;
    }
    // the kernel retains `error` only for status "failed"; anything else is
    // stale by contract, so it is read but not invented
    const err = errorInfo(safeGet(entry, "error"));
    if (err) {
      row.error = err;
    }
    rows.push(row);
  }
  return rows;
}

/* ---------------------------------------------------------------- registry */

interface RegisteredApp {
  key: string;
  name: string;
  version: string;
  app: any;
  /** the bare-name registry key also points at this instance */
  isDefaultForName: boolean;
}

/**
 * `runTime.apps` deduped onto one entry per `name@version`.
 *
 * `FynAppRegistry.add` files every FynApp under *two* keys -- `name@version`
 * and the bare `name` -- so a naive walk of the record double-counts every app
 * and, on a page running two versions of one container, silently drops one of
 * them onto the other's row. The bare key is kept as an aliasing fact instead:
 * it is what `loadFynAppsByName` and every by-name lookup resolves to, and on
 * the demo page two containers are both called `fynapp-react-lib`, so which
 * instance it points at is genuinely ambiguous and worth showing.
 */
function indexRegistry(apps: Record<string, any>): RegisteredApp[] {
  const byKey = new Map<string, RegisteredApp>();

  for (const value of Object.values(apps)) {
    if (!isObject(value)) {
      continue;
    }
    const name = safeGet<string>(value, "name");
    const version = safeGet<string>(value, "version");
    if (typeof name !== "string" || typeof version !== "string") {
      continue;
    }
    const key = name + "@" + version;
    if (byKey.has(key)) {
      continue;
    }
    byKey.set(key, {
      key,
      name,
      version,
      app: value,
      isDefaultForName: safeGet(apps, name) === value,
    });
  }

  return [...byKey.values()];
}

/* -------------------------------------------------------------------- apps */

function buildApps(
  registered: RegisteredApp[],
  states: StateRow[],
  mwNodes: MiddlewareNode[],
  containers: ContainerNode[],
  middlewares: unknown
): FynAppNode[] {
  const byKey = new Map<string, FynAppNode>();
  const containerIndex = indexContainers(containers);

  for (const entry of registered) {
    byKey.set(entry.key, appNode(entry, containerIndex, mwNodes, middlewares));
  }

  // A row per key from the registry *and* from the lifecycle table. They are
  // not the same set: `shutdownFynApp` drops an app from the registry while
  // the caller may still be looking at why it went, and a kernel too old for
  // one of the two surfaces leaves only the other. A key present in one and
  // not the other is information, so neither is treated as the full list.
  for (const state of states) {
    const key = state.name + "@" + state.version;
    let node = byKey.get(key);
    if (!node) {
      node = emptyAppNode(state.name, state.version, containerIndex);
      byKey.set(key, node);
    }
    node.status = state.status;
    node.updatedAt = state.updatedAt;
    node.mountedAt = state.mountedAt;
    node.error = state.error;
  }

  return [...byKey.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || compareVersions(a.version, b.version)
  );
}

function emptyAppNode(
  name: string,
  version: string,
  containers: Map<string, ContainerIndexEntry>
): FynAppNode {
  const node: FynAppNode = {
    name,
    version,
    key: name + "@" + version,
    inRegistry: false,
    isDefaultForName: false,
    loadedExposes: [],
    declaredExposes: [],
    unitHooks: [],
    usesMiddleware: [],
    middlewareDelivered: [],
    providesMiddleware: [],
    hasConfig: false,
  };
  joinContainer(node, containers);
  return node;
}

function appNode(
  entry: RegisteredApp,
  containers: Map<string, ContainerIndexEntry>,
  mwNodes: MiddlewareNode[],
  middlewares: unknown
): FynAppNode {
  const { app } = entry;
  const exposes = safeGet<any>(app, "exposes");
  const loadedExposes = isObject(exposes) ? Object.keys(exposes) : [];

  const node: FynAppNode = {
    name: entry.name,
    version: entry.version,
    key: entry.key,
    inRegistry: true,
    isDefaultForName: entry.isDefaultForName,
    loadedExposes,
    declaredExposes: declaredExposesOf(app),
    unitHooks: hooksOf(isObject(exposes) ? safeGet(exposes, "./main") : undefined),
    usesMiddleware: usesOf(app, exposes, middlewares),
    middlewareDelivered: deliveredOf(app),
    providesMiddleware: providedBy(entry.key, mwNodes),
    hasConfig: safeGet(app, "config") != null,
  };

  const packageName = safeGet<string>(app, "packageName");
  if (typeof packageName === "string") {
    node.packageName = packageName;
  }

  joinContainer(node, containers);
  return node;
}

/**
 * Exposes the build declared, as opposed to the ones the kernel pulled in.
 *
 * `container.$E` is the whole declared map; `fynApp.exposes` holds only what
 * something actually loaded (`./config`, `./main`, each `./middleware*`, plus
 * whatever a middleware reached for). The difference is the answer to "why is
 * my expose not running", so the two are collected separately and never merged.
 */
function declaredExposesOf(app: any): string[] {
  const entry = safeGet<any>(app, "entry");
  const container = isObject(entry) ? safeGet<any>(entry, "container") : undefined;
  const declared = isObject(container) ? safeGet<any>(container, "$E") : undefined;
  return isObject(declared) ? Object.keys(declared) : [];
}

function hooksOf(mainExpose: unknown): string[] {
  const unit = isObject(mainExpose) ? safeGet(mainExpose, "main") : undefined;
  if (!unit || (typeof unit !== "object" && !isFn(unit))) {
    return [];
  }
  return UNIT_HOOKS.filter((hook) => isFn(safeGet(unit, hook)));
}

/**
 * Which middleware actually handed this app an API.
 *
 * `middlewareContext` is written by the middleware itself, not by the kernel,
 * so its keys are a truthful record of delivery rather than of intent -- a
 * middleware that failed before writing simply is not there. Insertion order is
 * the order they wrote, which is incidental but is the only ordering signal
 * anywhere, so it is preserved rather than sorted.
 */
function deliveredOf(app: any): string[] {
  const ctx = safeGet<any>(app, "middlewareContext");
  const keys = isObject(ctx) ? safeGet(ctx, "keys") : undefined;
  if (!isFn(keys)) {
    return [];
  }
  const out = attempt(() => [...keys.call(ctx)]);
  return Array.isArray(out) ? out.filter((k): k is string => typeof k === "string") : [];
}

function providedBy(appKey: string, mwNodes: MiddlewareNode[]): string[] {
  const out: string[] = [];
  for (const mw of mwNodes) {
    if (mw.versions.some((v) => v.hostApp === appKey) && !out.includes(mw.regKey)) {
      out.push(mw.regKey);
    }
  }
  return out;
}

/* -------------------------------------------------------------- middleware */

/**
 * Every middleware this app declares, across all three declaration shapes.
 *
 * The kernel normalises the string, `{ mw }` and `{ info }` forms *inside* the
 * executor, so nothing on the FynApp is pre-normalised and a reader has to
 * handle all three itself.
 *
 * Every expose's unit is scanned, not only `./main`. A declaration is a
 * declaration wherever it was written, and reading `./main` alone would report
 * `mw 0` for an app whose `middlewareContext` plainly has keys in it -- a row
 * claiming nothing was asked for while the evidence of delivery sits next to
 * it. Duplicates across exposes collapse onto one entry.
 */
function usesOf(app: any, exposes: unknown, middlewares: unknown): MiddlewareUseNode[] {
  const delivered = new Set(deliveredOf(app));
  const registry: Record<string, any> = isObject(middlewares) ? (middlewares as any) : {};
  const out: MiddlewareUseNode[] = [];
  const seen = new Set<string>();

  const units = isObject(exposes) ? Object.values(exposes as Record<string, unknown>) : [];
  for (const expose of units) {
    const unit = isObject(expose) ? safeGet(expose, "main") : undefined;
    const meta = unit ? safeGet(unit, "__middlewareMeta") : undefined;
    if (!Array.isArray(meta)) {
      continue;
    }
    for (const item of meta) {
      const use = normaliseUse(item);
      const identity = use.form + "|" + (use.provider ?? "") + "::" + (use.name ?? use.raw ?? "");
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      resolveUse(use, registry);
      use.delivered = !!use.name && delivered.has(use.name);
      out.push(use);
    }
  }

  return out;
}

function normaliseUse(meta: unknown): MiddlewareUseNode {
  if (typeof meta === "string") {
    return fromMiddlewareString(meta, undefined, "string");
  }
  if (!isObject(meta)) {
    return { form: "unknown", registered: false, delivered: false };
  }

  const mw = safeGet(meta, "mw");
  if (typeof mw === "string") {
    return fromMiddlewareString(mw, safeGet(meta, "config"), "mw");
  }

  const info = safeGet<any>(meta, "info");
  if (isObject(info)) {
    const use: MiddlewareUseNode = { form: "info", registered: false, delivered: false };
    const name = safeGet<string>(info, "name");
    const provider = safeGet<string>(info, "provider");
    const range = safeGet<string>(info, "version");
    if (typeof name === "string") {
      use.name = name;
    }
    if (typeof provider === "string") {
      use.provider = provider;
    }
    if (typeof range === "string") {
      use.range = range;
    }
    applyConfig(use, safeGet(meta, "config"));
    return use;
  }

  // The executor throws `unusableMiddlewareMeta` on this shape, which takes the
  // whole app down. Recording it as unreadable is how that becomes visible
  // before the throw is traced back by hand.
  return { form: "unknown", registered: false, delivered: false };
}

/**
 * `"-FYNAPP_MIDDLEWARE <package> <path> <semver>"`.
 *
 * The middleware's name is the last segment of the path and its provider is the
 * package -- the same split `parseMiddlewareString` does. A string that does
 * not parse is kept verbatim rather than dropped: the kernel silently ignores
 * it and the app's `execute` then never runs, which is precisely the failure
 * that is impossible to see from the outside.
 */
function fromMiddlewareString(
  raw: string,
  config: unknown,
  form: "string" | "mw"
): MiddlewareUseNode {
  const use: MiddlewareUseNode = { form, raw, registered: false, delivered: false };
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 3 && parts[0] === MW_STRING_TAG) {
    use.provider = parts[1];
    use.name = parts[2].split("/").pop() || parts[2];
    if (parts[3]) {
      use.range = parts[3];
    }
  }
  applyConfig(use, config);
  return use;
}

/**
 * Is this declaration backed by anything registered?
 *
 * Mirrors `MiddlewareManager.getMiddleware`: the `provider::name` key first,
 * then a scan for any provider exporting that name, because that fallback is
 * what actually runs and a reader that only checked the exact key would report
 * "not registered" for a middleware the app is successfully using.
 *
 * The version *is* replayed, and `resolveVersion` below says which of the
 * kernel's four branches got there. Before FYM-321 a range was carried to the
 * lookup and then dropped, so there was nothing to replay and this filled in a
 * version only where there was nothing to guess. There is now a documented
 * resolution order to mirror, and mirroring it is the only way the Middleware
 * view can say which version a consumer is actually on.
 */
function resolveUse(use: MiddlewareUseNode, registry: Record<string, any>): void {
  if (!use.name) {
    return;
  }

  let regKey: string | undefined;
  if (use.provider && isObject(registry[use.provider + "::" + use.name])) {
    regKey = use.provider + "::" + use.name;
  } else {
    regKey = Object.keys(registry).find(
      (key) => key.endsWith("::" + use.name) && isObject(registry[key])
    );
  }
  if (!regKey) {
    return;
  }

  use.registered = true;
  use.resolvedRegKey = regKey;

  const hit = resolveVersion(registry[regKey], use.range);
  if (!hit) {
    return;
  }
  use.resolvedVersion = hit.version;
  use.resolvedVia = hit.via;
  const fullKey = safeGet<string>(hit.reg, "fullKey");
  if (typeof fullKey === "string") {
    use.resolvedFullKey = fullKey;
  }
}

/**
 * One middleware's version map, resolved the way the kernel resolves it.
 *
 * A line-for-line mirror of `MiddlewareManager.resolveFromVersionMap`, in its
 * order, because the order *is* the semantics:
 *
 * 1. no range, `*`, or blank -> the `default` slot, with no parsing at all.
 * 2. an exact key in the map -> that version. `default` is a slot name and is
 *    excluded, which is why a middleware may not be versioned "default".
 * 3. a range some registered version satisfies -> the highest such version.
 * 4. anything else -> `default` again, and the kernel warns that the FynApp is
 *    running a version it did not ask for. That fourth branch is reported as
 *    `"fallback"` rather than folded into `"default"`: they land on the same
 *    registration and mean opposite things.
 *
 * A hyphen range (`1.0.0 - 2.0.0`) is treated as branch 4. This module's
 * `satisfies` understands one and the kernel's `isSupportedRange` does not, and
 * where the two disagree the kernel is the one that ran.
 */
function resolveVersion(
  versionMap: any,
  range?: string
): { version: string; reg: any; via: MiddlewareResolution } | undefined {
  const fallbackReg = safeGet<any>(versionMap, DEFAULT_SLOT);
  const versions = Object.keys(versionMap).filter((v) => v !== DEFAULT_SLOT);
  const defaultVersion = versions.find((v) => safeGet(versionMap, v) === fallbackReg);
  const asDefault = (via: MiddlewareResolution) =>
    defaultVersion && isObject(fallbackReg)
      ? { version: defaultVersion, reg: fallbackReg, via }
      : undefined;

  const wanted = range?.trim();
  if (!wanted || wanted === "*") {
    return asDefault("default");
  }
  if (wanted !== DEFAULT_SLOT && isObject(safeGet(versionMap, wanted))) {
    return { version: wanted, reg: safeGet<any>(versionMap, wanted), via: "exact" };
  }
  const best = /\s-\s/.test(wanted) ? undefined : maxSatisfying(versions, wanted);
  if (best) {
    return { version: best, reg: safeGet<any>(versionMap, best), via: "range" };
  }
  return asDefault("fallback");
}

/**
 * File one consumer under the version it resolved to.
 *
 * A consumer that resolves to the middleware but to no version node -- an
 * empty version map, or one whose `default` slot points at a registration that
 * is not in it -- is kept in `unpinnedConsumers` instead of being dropped. It
 * is a consumer of *something*, and a view that silently discarded it would
 * show a middleware with fewer consumers than the FynApps view shows
 * declarations against it.
 */
function addConsumer(mw: MiddlewareNode, appKey: string, use: MiddlewareUseNode): void {
  const consumer: MiddlewareConsumerNode = {
    app: appKey,
    pinnedProvider: use.provider === mw.provider,
    delivered: use.delivered,
    via: use.resolvedVia ?? "unresolved",
  };
  if (use.range) {
    consumer.range = use.range;
  }
  const version = use.resolvedVersion
    ? mw.versions.find((v) => v.version === use.resolvedVersion)
    : undefined;
  const list = version ? version.consumers : mw.unpinnedConsumers;
  if (!list.some((c) => c.app === appKey)) {
    list.push(consumer);
  }
}

/**
 * The middleware registry, from the provider's side.
 *
 * `runTime.middlewares[provider::name][version]` plus a `default` slot holding
 * whichever version registered *first*. The slot is not a version, so it is
 * reported as a flag on the version it duplicates rather than as a row of its
 * own -- and it earns that flag, because `default` is what every version-less
 * lookup resolves to and the kernel never re-points it once set (FYM-332).
 *
 * A version key whose value is not a readable registration is counted in
 * `unreadableVersions` rather than skipped. A middleware showing no versions is
 * then unambiguous: either the registry really holds none, or it holds some
 * that could not be read, and the two never look alike.
 */
function buildMiddlewares(
  middlewares: any,
  runTime: any,
  kernel: any
): { nodes: MiddlewareNode[]; autoApplyReadable: boolean } {
  const auto = readAutoApply(runTime, kernel);
  const autoFynapp = fullKeysOf(safeGet(auto.value, "fynapp"));
  const autoMw = fullKeysOf(safeGet(auto.value, "mw"));

  const out: MiddlewareNode[] = [];

  for (const regKey of Object.keys(middlewares)) {
    const versionMap = safeGet<any>(middlewares, regKey);
    if (!isObject(versionMap)) {
      continue;
    }
    const split = regKey.indexOf("::");
    const provider = split < 0 ? "" : regKey.slice(0, split);
    const name = split < 0 ? regKey : regKey.slice(split + 2);
    const defaultReg = safeGet(versionMap, DEFAULT_SLOT);

    const versions: MiddlewareVersionNode[] = [];
    const unreadableVersions: string[] = [];
    for (const version of Object.keys(versionMap)) {
      if (version === DEFAULT_SLOT) {
        continue;
      }
      const reg = safeGet<any>(versionMap, version);
      if (!isObject(reg)) {
        unreadableVersions.push(version);
        continue;
      }
      versions.push(versionNode(version, reg, reg === defaultReg));
    }

    const node: MiddlewareNode = {
      regKey,
      name,
      provider,
      versions,
      unreadableVersions,
      consumers: [],
      unpinnedConsumers: [],
      nameCollisions: [],
    };
    const defaultVersion = versions.find((v) => v.isDefault);
    if (defaultVersion) {
      node.defaultVersion = defaultVersion.version;
    }
    if (auto.readable) {
      const scopes: Array<"fynapp" | "mw"> = [];
      if (versions.some((v) => autoFynapp.has(v.fullKey))) {
        scopes.push("fynapp");
      }
      if (versions.some((v) => autoMw.has(v.fullKey))) {
        scopes.push("mw");
      }
      if (scopes.length) {
        node.autoApply = scopes;
      }
    }
    out.push(node);
  }

  // FYM-333: two providers publishing one name is legal, and a consumer that
  // names no provider gets whichever the kernel scanned first plus a
  // console.error nobody is watching for. The collision is a property of the
  // name, so every node carrying it says so -- there is no "the wrong one".
  const byName = new Map<string, string[]>();
  for (const node of out) {
    const keys = byName.get(node.name) ?? [];
    keys.push(node.regKey);
    byName.set(node.name, keys);
  }
  for (const node of out) {
    node.nameCollisions = (byName.get(node.name) ?? [])
      .filter((k) => k !== node.regKey)
      .sort();
  }

  return {
    nodes: out.sort((a, b) => a.regKey.localeCompare(b.regKey)),
    autoApplyReadable: auto.readable,
  };
}

/**
 * `autoApply`, through the field first and the method second.
 *
 * `runTime.autoApply` is undefined until the first middleware with an
 * `autoApplyScope` registers, so its absence is genuinely ambiguous: an older
 * kernel that never had the field looks exactly like a current one where
 * nothing auto-applies. `mwMgr.getAutoApply()` settles it -- a kernel that has
 * the method has the feature, and a `undefined` return from it means "none",
 * not "cannot tell". Only when neither surface answers is the column reported
 * as unknown.
 */
function readAutoApply(runTime: any, kernel: any): { value: unknown; readable: boolean } {
  const field = safeGet(runTime, "autoApply");
  if (isObject(field)) {
    return { value: field, readable: true };
  }
  const mgr = safeGet<any>(kernel, "mwMgr");
  const getter = isObject(mgr) ? safeGet(mgr, "getAutoApply") : undefined;
  if (isFn(getter)) {
    const value = attempt(() => getter.call(mgr));
    return { value, readable: true };
  }
  return { value: undefined, readable: false };
}

function versionNode(version: string, reg: any, isDefault: boolean): MiddlewareVersionNode {
  const host = safeGet<any>(reg, "hostFynApp");
  const hostName = safeGet<string>(host, "name");
  const hostVersion = safeGet<string>(host, "version");
  const mw = safeGet<any>(reg, "mw");
  const scope = safeGet(mw, "autoApplyScope");

  const overrides = OVERRIDE_HOOKS.filter((hook) => isFn(safeGet(mw, hook)));

  const node: MiddlewareVersionNode = {
    version,
    isDefault,
    fullKey: safeGet<string>(reg, "fullKey") ?? "",
    hostApp: typeof hostName === "string" ? hostName + "@" + (hostVersion ?? "") : "",
    exposeName: safeGet<string>(reg, "exposeName") ?? "",
    exportName: safeGet<string>(reg, "exportName") ?? "",
    hasSetup: isFn(safeGet(mw, "setup")),
    hasApply: isFn(safeGet(mw, "apply")),
    hasShouldApply: isFn(safeGet(mw, "shouldApply")),
    overridesExecution: overrides.length > 0,
    overrideHooks: overrides,
    consumers: [],
  };
  if (Array.isArray(scope)) {
    node.autoApplyScope = scope.filter((s): s is string => typeof s === "string");
  }
  return node;
}

function fullKeysOf(list: unknown): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(list)) {
    for (const reg of list) {
      const key = safeGet<string>(reg, "fullKey");
      if (typeof key === "string") {
        out.add(key);
      }
    }
  }
  return out;
}

/* -------------------------------------------------------- bootstrap queue */

/**
 * The bootstrap queue, off the coordinator that is only there in a dev build.
 *
 * `BootstrapCoordinator` serialises bootstraps behind one lock and parks
 * everything else in `deferredBootstraps`, so "who holds the lock, who is
 * behind them, and what is each of those waiting for" is the whole answer to
 * "why is my FynApp not mounted". Today that answer is a `console.debug` trail
 * that `drop_console: true` removes from the production build; here it is a
 * structure.
 *
 * Four surfaces are read and each can fail on its own, so failures are named
 * in `unreadable` rather than collapsed into an empty queue: an empty queue is
 * a page where every FynApp has finished, and saying that when we could not
 * read the array is the one thing this panel must never do.
 *
 * Nothing live crosses into the snapshot. A `Deferred` holds the whole
 * `FynApp` plus a `resolve` closure and a timer handle; only the identifying
 * `name`/`version` are copied out, the same discipline the `cc` call context
 * gets everywhere else in this collector.
 */
function buildBootstrapQueue(bc: any): BootstrapQueueNode {
  const unreadable: string[] = [];

  // `bootstrappingApp` is an accessor over a `string | null`. `null` is the
  // kernel's own "nobody holds the lock" -- a real state, not a gap -- so the
  // read is boxed rather than taken through `safeGet`: `safeGet` turns a getter
  // that throws into `undefined`, which here would be indistinguishable from
  // "the lock is free" and would report a stuck page as an idle one.
  const holderRead = attempt(() => ({ value: (bc as any).bootstrappingApp }));
  let holder: string | undefined;
  if (!holderRead) {
    unreadable.push("bootstrappingApp");
  } else if (typeof holderRead.value === "string") {
    holder = holderRead.value;
  } else if (holderRead.value !== null && holderRead.value !== undefined) {
    unreadable.push("bootstrappingApp");
  }

  const statusKeys = readMapEntries(safeGet(bc, "fynAppBootstrapStatus"));
  if (!statusKeys) {
    unreadable.push("fynAppBootstrapStatus");
  }
  const bootstrapped = new Set(
    (statusKeys ?? []).map(([key]) => key).filter((k): k is string => typeof k === "string")
  );

  const modeEntries = readMapEntries(safeGet(bc, "fynAppProviderModes"));
  if (!modeEntries) {
    unreadable.push("fynAppProviderModes");
  }
  const modeMap = readProviderModes(modeEntries ?? []);

  const deferred: BootstrapDeferredNode[] = [];
  let unreadableDeferred = 0;
  const rawDeferred = safeGet(bc, "deferredBootstraps");
  if (Array.isArray(rawDeferred)) {
    for (const entry of rawDeferred) {
      const app = safeGet(entry, "fynApp");
      const name = safeGet<string>(app, "name");
      if (typeof name !== "string") {
        // a queue entry whose FynApp cannot be read is still an app that is
        // not mounted, so it is counted rather than dropped
        unreadableDeferred++;
        continue;
      }
      const versionRaw = safeGet<string>(app, "version");
      const version = typeof versionRaw === "string" ? versionRaw : "";
      deferred.push({
        name,
        version,
        key: name + "@" + version,
        waitingOn: blockersFor(name, modeMap, bootstrapped),
      });
    }
  } else {
    unreadable.push("deferredBootstraps");
  }

  const modes: BootstrapModeNode[] = [...modeMap.entries()]
    .map(([app, roles]) => ({
      app,
      roles: [...roles.entries()]
        .map(([middleware, mode]) => ({ middleware, mode }))
        .sort((a, b) => a.middleware.localeCompare(b.middleware)),
    }))
    .sort((a, b) => a.app.localeCompare(b.app));

  const node: BootstrapQueueNode = {
    deferred,
    unreadableDeferred,
    bootstrapped: [...bootstrapped].sort(),
    modes,
    unreadable,
  };
  if (holder !== undefined) {
    node.holder = holder;
  }
  return node;
}

/**
 * What a deferred FynApp is still waiting for, the way the coordinator decides
 * it.
 *
 * A mirror of `areBootstrapDependenciesSatisfied` + `findProviderForMiddleware`:
 * for every middleware this app registered as a *consumer* of, the provider is
 * the first other app that registered as a `provider` for that name, and the
 * app is blocked while that provider has no entry in `fynAppBootstrapStatus`.
 *
 * One deliberate difference: the kernel returns `false` at the first blocker
 * because a boolean is all it needs, and this collects every one of them. A
 * reader asking why an app is parked wants the full list, not whichever
 * dependency happened to be checked first.
 */
function blockersFor(
  appName: string,
  modeMap: Map<string, Map<string, "provider" | "consumer">>,
  bootstrapped: Set<string>
): BootstrapBlockerNode[] {
  const modes = modeMap.get(appName);
  if (!modes) {
    return [];
  }
  const out: BootstrapBlockerNode[] = [];
  for (const [middleware, mode] of modes) {
    if (mode !== "consumer") {
      continue;
    }
    const provider = findProvider(middleware, appName, modeMap);
    if (provider && !bootstrapped.has(provider)) {
      out.push({ middleware, provider });
    }
  }
  return out;
}

/** `findProviderForMiddleware`: first other app registered as its provider. */
function findProvider(
  middleware: string,
  exclude: string,
  modeMap: Map<string, Map<string, "provider" | "consumer">>
): string | undefined {
  for (const [app, modes] of modeMap) {
    if (app === exclude) {
      continue;
    }
    if (modes.get(middleware) === "provider") {
      return app;
    }
  }
  return undefined;
}

function readProviderModes(
  entries: Array<[unknown, unknown]>
): Map<string, Map<string, "provider" | "consumer">> {
  const out = new Map<string, Map<string, "provider" | "consumer">>();
  for (const [app, inner] of entries) {
    if (typeof app !== "string") {
      continue;
    }
    const roles = new Map<string, "provider" | "consumer">();
    for (const [middleware, mode] of readMapEntries(inner) ?? []) {
      if (typeof middleware === "string" && (mode === "provider" || mode === "consumer")) {
        roles.set(middleware, mode);
      }
    }
    out.set(app, roles);
  }
  return out;
}

/**
 * A `Map`'s entries, duck-typed and defended.
 *
 * `instanceof Map` fails across realms the same way `instanceof Error` does,
 * so the method is what is tested. An array is rejected outright: it has an
 * `entries()` of its own that yields `[index, value]`, which would read as a
 * readable map with no string keys -- an empty answer where the truth is a
 * shape we do not understand.
 */
function readMapEntries(value: unknown): Array<[unknown, unknown]> | undefined {
  if (!isObject(value) || Array.isArray(value)) {
    return undefined;
  }
  const entries = safeGet(value, "entries");
  if (!isFn(entries)) {
    return undefined;
  }
  const out = attempt(() => [...entries.call(value)]);
  if (!Array.isArray(out)) {
    return undefined;
  }
  return out.filter((pair): pair is [unknown, unknown] => Array.isArray(pair) && pair.length >= 2);
}

/* ------------------------------------------------------------------ config */

/**
 * A middleware config, made safe to put in a snapshot.
 *
 * The value is authored by a FynApp and is under no obligation to be JSON: the
 * demo's own configs hold component references, and a middleware config holding
 * a DOM node is entirely normal. `structuredClone` is the right test because it
 * is the *same* test the postMessage bridge applies, so anything that survives
 * here survives the trip to a devtools panel. What fails is reduced to its top
 * level key names, which is enough to recognise the config without pretending
 * to carry it.
 */
function applyConfig(use: MiddlewareUseNode, config: unknown): void {
  if (config === undefined) {
    return;
  }
  const clone = safeGet<any>(globalThis, "structuredClone");
  if (isFn(clone)) {
    const cloned = attempt(() => clone(config));
    if (cloned !== undefined) {
      use.config = cloned;
      use.configKind = "json";
      return;
    }
  } else {
    // No structuredClone (an old browser, an exotic realm). JSON is a weaker
    // test -- it drops functions rather than refusing them -- but its output is
    // clone-safe, which is the property the snapshot actually needs.
    const json = attempt(() => JSON.stringify(config));
    if (typeof json === "string") {
      use.config = JSON.parse(json);
      use.configKind = "json";
      return;
    }
  }
  use.configKind = "opaque";
  use.configKeys = isObject(config) ? Object.keys(config as object) : undefined;
}

/* ------------------------------------------------------------------- joins */

interface ContainerIndexEntry {
  id: string;
  versions: Set<string>;
}

function indexContainers(containers: ContainerNode[]): Map<string, ContainerIndexEntry> {
  const index = new Map<string, ContainerIndexEntry>();
  for (const c of containers) {
    index.set(c.name, { id: c.id, versions: new Set(c.versions.map((v) => v.version)) });
  }
  return index;
}

/**
 * Land a FynApp on its container row.
 *
 * `loadFynAppBasics` builds a FynApp straight off the container, so
 * `fynApp.name`/`fynApp.version` *are* the container's -- the join is exact and
 * needs no heuristic. `containerVersion` is set only when that version is one
 * the container collector actually saw, so a link never claims to point at a
 * row that is not there; the name alone still gets you to the container block.
 */
function joinContainer(node: FynAppNode, index: Map<string, ContainerIndexEntry>): void {
  const entry = index.get(node.name);
  if (!entry) {
    return;
  }
  node.containerId = entry.id;
  if (entry.versions.has(node.version)) {
    node.containerVersion = node.version;
  }
}

/* ------------------------------------------------------------------ shared */

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function errorInfo(err: unknown): { message: string; stack?: string } | undefined {
  if (err === undefined || err === null) {
    return undefined;
  }
  // duck-typed rather than `instanceof Error`: a FynApp loaded into another
  // realm throws that realm's Error, which fails the instanceof check
  const message = safeGet<unknown>(err, "message");
  const stack = safeGet<unknown>(err, "stack");
  if (typeof message === "string") {
    return typeof stack === "string" ? { message, stack } : { message };
  }
  return { message: attempt(() => String(err)) ?? "unknown error" };
}

/** Numeric-aware version ordering, so 19.2.8 sorts after 9.0.0. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = Number(pa[i]);
    const nb = Number(pb[i]);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) {
        return na - nb;
      }
    } else if ((pa[i] ?? "") !== (pb[i] ?? "")) {
      return (pa[i] ?? "") < (pb[i] ?? "") ? -1 : 1;
    }
  }
  return 0;
}
