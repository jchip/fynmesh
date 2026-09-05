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
  Capability,
  ContainerNode,
  FynAppNode,
  FynAppStatus,
  FynMeshNode,
  KernelBuild,
  MiddlewareNode,
  MiddlewareUseNode,
  MiddlewareVersionNode,
} from "../model.js";
import { attempt, isFn, safeGet } from "../capability.js";

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

  const mwNodes = cap.kernelMiddleware ? buildMiddlewares(middlewares, runTime) : [];
  const registered = indexRegistry(registry);
  const appNodes = buildApps(registered, states ?? [], mwNodes, containers, middlewares);

  // consumers are the middleware registry read from the other side; doing it
  // here rather than in `buildMiddlewares` keeps one pass over the apps
  for (const node of appNodes) {
    for (const use of node.usesMiddleware) {
      const mw = use.resolvedRegKey
        ? mwNodes.find((m) => m.regKey === use.resolvedRegKey)
        : undefined;
      if (mw && !mw.consumers.includes(node.key)) {
        mw.consumers.push(node.key);
      }
    }
  }

  const fynmesh: FynMeshNode = {
    build,
    apps: appNodes,
    middlewares: mwNodes,
  };
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
 * The version is *not* replayed. The kernel resolves a range with its own
 * semver, and guessing here would put a fullKey on screen that the app may not
 * be running -- so `resolvedFullKey` is filled in only where there is nothing
 * to guess: an exact version key, a single registered version, or no range at
 * all (which is the `default` slot by definition).
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

  const versionMap = registry[regKey];
  const exact = use.range ? safeGet<any>(versionMap, use.range) : undefined;
  const versions = Object.keys(versionMap).filter((v) => v !== DEFAULT_SLOT);
  const unambiguous =
    exact ??
    (!use.range || use.range === "*" || versions.length === 1
      ? safeGet<any>(versionMap, DEFAULT_SLOT) ?? safeGet<any>(versionMap, versions[0])
      : undefined);

  const fullKey = safeGet<string>(unambiguous, "fullKey");
  if (typeof fullKey === "string") {
    use.resolvedFullKey = fullKey;
  }
}

/**
 * The middleware registry, from the provider's side.
 *
 * `runTime.middlewares[provider::name][version]` plus a `default` slot holding
 * whichever version registered first. The slot is not a version, so it is
 * reported as a flag on the version it duplicates rather than as a row of its
 * own -- and it earns that flag, because `getMiddleware` returns the default
 * for any range it cannot satisfy.
 */
function buildMiddlewares(middlewares: any, runTime: any): MiddlewareNode[] {
  const autoApply = safeGet<any>(runTime, "autoApply");
  const autoFynapp = fullKeysOf(safeGet(autoApply, "fynapp"));
  const autoMw = fullKeysOf(safeGet(autoApply, "mw"));

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
    for (const version of Object.keys(versionMap)) {
      if (version === DEFAULT_SLOT) {
        continue;
      }
      const reg = safeGet<any>(versionMap, version);
      if (!isObject(reg)) {
        continue;
      }
      versions.push(versionNode(version, reg, reg === defaultReg));
    }

    const node: MiddlewareNode = { regKey, name, provider, versions, consumers: [] };
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
    out.push(node);
  }

  return out.sort((a, b) => a.regKey.localeCompare(b.regKey));
}

function versionNode(version: string, reg: any, isDefault: boolean): MiddlewareVersionNode {
  const host = safeGet<any>(reg, "hostFynApp");
  const hostName = safeGet<string>(host, "name");
  const hostVersion = safeGet<string>(host, "version");
  const mw = safeGet<any>(reg, "mw");
  const scope = safeGet(mw, "autoApplyScope");

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
    overridesExecution:
      isFn(safeGet(mw, "canOverrideExecution")) ||
      isFn(safeGet(mw, "overrideInitialize")) ||
      isFn(safeGet(mw, "overrideExecute")),
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
