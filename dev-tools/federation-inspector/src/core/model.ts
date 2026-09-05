/**
 * The inspector's data contract.
 *
 * Every type here is plain JSON: no class instances, no functions, no live
 * loader objects. That is deliberate and load-bearing. The UI renders a
 * `Snapshot` and nothing else, so the same UI can run in the page's realm
 * (standalone bundle) or across a postMessage bridge in a devtools panel,
 * where only structured-cloneable data survives the trip.
 *
 * It also means a snapshot is a bug report: copy it out of the Raw view and
 * the whole page state travels with it.
 */

/** Lifecycle stage of a module, as `System.stageOf` reports it. */
export type LoadStage =
  | "instantiating"
  | "instantiated"
  | "linked"
  | "awaiting-deps"
  | "executing"
  | "executed"
  | "errored"
  /** the loader knows an id but has no record for it yet */
  | "registered";

/**
 * What a module is, as far as the inspector can tell.
 *
 * Derived from id shape, share-scope membership and container exposes -- the
 * loader has no notion of any of these, so this is entirely the inspector's
 * classification and only as good as the conventions it keys off.
 */
export type ModuleKind =
  /** a federation container entry: `__mf_container_<name>` / `__mf_entry_<name>_<file>` */
  | "container-entry"
  /** a chunk some container lists in its exposes map */
  | "exposed"
  /** a copy of a module in a share scope */
  | "shared"
  /** an ordinary code-split chunk belonging to a container */
  | "chunk"
  /** loaded through the loader but attributable to no container */
  | "external"
  | "unknown";

export type IssueSeverity = "error" | "warn" | "info";

export type ViewName =
  | "modules"
  /** only ever offered when `Snapshot.fynmesh` is present */
  | "fynapps"
  /** likewise: middleware is a kernel concept, so no kernel means no tab */
  | "middleware"
  | "containers"
  | "shares"
  | "graph"
  | "issues"
  | "raw";

/**
 * A derived diagnostic.
 *
 * Nothing here is reported by the loader or by federation; every issue is
 * computed from the snapshot, which is why they can be produced for a page
 * that is not instrumented and was not expecting to be inspected.
 */
export interface Issue {
  id: string;
  severity: IssueSeverity;
  /** stable machine code, e.g. "singleton-multiple-copies" */
  code: string;
  title: string;
  detail: string;
  /** search query that focuses whatever this is about */
  focus?: string;
  /** which view explains it best */
  view?: ViewName;
  /** ids/names this issue implicates, for highlighting */
  refs?: string[];
}

/**
 * What this page's builds actually let us see.
 *
 * federation-js minifies with property mangling, so several of its internals
 * are unreachable in a production bundle. Rather than throw or silently show
 * an empty table, each probe records itself here and the UI says which parts
 * of the picture are missing and why.
 */
export interface Capability {
  /** `System.records` -- the formal record-exposure API of the fynmesh fork */
  records: boolean;
  /** `System.registrations` -- id/qualifier to url + pending registration */
  registrations: boolean;
  /** `System.aliases` */
  aliases: boolean;
  /** `System.stageOf` */
  stageOf: boolean;
  /** a `Federation` global was found */
  federation: boolean;
  /** `Federation.$SS` -- the share store, readable */
  shareStore: boolean;
  /** `Container.$SC` -- per-container share config, with semver ranges */
  shareConfig: boolean;
  /**
   * `Container.$SC[key].rvm` -- the per-importer required-version map.
   *
   * Split from `shareConfig` because the two do not travel together: `options`
   * survives federation-js's mangling and `rvm` does not, so a build can hand
   * us every declared semver range and none of the maps behind them. Nothing
   * else on the page retains an rvm once `_S` has returned, so false here
   * means unavailable, not empty.
   */
  requiredVersionMaps: boolean;
  /** `Container.$E` -- exposes map */
  exposes: boolean;
  /** `__FYNAPP_MANIFEST__` present on at least one container */
  manifest: boolean;
  /** `Federation.bundleUrlFor` -- combined-bundle membership */
  bundleMap: boolean;
  /**
   * a FynMesh kernel was found at `globalThis.fynMeshKernel`
   *
   * False is the ordinary case: this is a federation tool first, and a page
   * with no kernel is a page it still fully describes.
   */
  kernel: boolean;
  /** `kernel.runTime.apps` -- the registry that says which containers are FynApps */
  kernelRunTime: boolean;
  /** `kernel.listFynAppStates()` -- mount status, timings and failures */
  kernelLifecycle: boolean;
  /** `kernel.runTime.middlewares` -- the middleware registry */
  kernelMiddleware: boolean;
  /** human-readable notes about anything that probed false */
  notes: string[];
}

export interface LoaderInfo {
  /** index in `Snapshot.loaders`; every module carries one of these */
  index: number;
  baseUrl?: string;
  recordCount: number;
  registrationCount: number;
  /** true when this is `globalThis.System` */
  isGlobal: boolean;
}

export interface ModuleRef {
  id: string;
  /** set when the target is not in `modules` -- a dangling dep */
  missing?: boolean;
}

export interface RegistrationInfo {
  /** container versions this id is registered under, `registrations.qualifiersOf` */
  qualifiers: string[];
  url?: string;
  /** a registration was handed to the loader and has been consumed */
  taken?: boolean;
  /** a registration is sitting unconsumed */
  pending?: boolean;
}

export interface ModuleNode {
  /** the loader's id: a url, or a `__mf_*` / `./chunk.js` specifier */
  id: string;
  url?: string;
  kind: ModuleKind;
  stage: LoadStage;
  /** names in `System.aliases` that point at this id */
  aliases: string[];
  /** dependency ids, in declaration order */
  deps: ModuleRef[];
  /** ids that depend on this one, inverted from `deps` */
  dependents: ModuleRef[];
  /** namespace keys, once executed */
  exports?: string[];
  error?: { message: string; stack?: string };
  /** the container this module belongs to, when attributable */
  container?: { name: string; version?: string };
  /** share scope, when this module participates in one */
  scope?: string;
  /** set when this module IS a copy of a shared module */
  shareKey?: string;
  /** version, when this is a shared copy or a container entry */
  version?: string;
  /** url of the combined file this arrived in, when it is not its own file */
  bundle?: string;
  registration?: RegistrationInfo;
  /** index into `Snapshot.loaders` */
  loader: number;
  /** order the loader first learned about this module, for "load order" sort */
  seq: number;
}

/** One share declaration made by one container version. */
export interface ShareDecl {
  key: string;
  /** the semver range this container asked for (`$SC[key].options.semver`) */
  requestedRange?: string;
  singleton?: boolean;
  /** false when `options.import === false`: consume-only, provides nothing */
  importable?: boolean;
  shareScope: string;
  /**
   * versions this container is able to provide
   *
   * Reconstructed from the share store, not read off the container: see
   * `indexProvidedCopies` in the federation collector.
   */
  versions: string[];
  /**
   * the subset of `versions` something actually supplied a copy of
   *
   * Announcing and supplying are two different events in federation-js:
   * `Federation._S` files a source the moment a container says it *can*
   * provide a version, while the store entry only gains a `url` or an `id`
   * once a module was really handed over. Reading a source as a copy is what
   * had the Containers view claim `marko@5.37.31` while Issues warned nobody
   * had supplied it -- so both facts are carried, and the reader is told which
   * one they are looking at.
   */
  supplied?: string[];
  /** required-version map: importer dir to the range from its nearest package.json */
  rvm?: Record<string, string>;
  /**
   * true when this row was reconstructed from the share store because the
   * container's own declaration could not be read -- so the absence of a
   * `requestedRange` here means unknown, not unconstrained
   */
  inferred?: boolean;
  /** filled in by analysis: what the range actually resolved to */
  resolved?: {
    version?: string;
    url?: string;
    /** `requestedRange` is satisfied by `resolved.version` */
    satisfies: boolean;
    /** why, in words, when it is not */
    reason?: string;
  };
}

export interface ExposeInfo {
  /** the expose name, e.g. "./main" */
  name: string;
  /** the chunk id it maps to, which is what an importer actually gets */
  chunkId: string;
  url?: string;
  stage?: LoadStage;
}

export interface ContainerVersionNode {
  version: string;
  /** `__mf_container_<name>`, or the entry chunk id */
  entryId: string;
  entryUrl?: string;
  stage: LoadStage;
  scope: string;
  exposes: ExposeInfo[];
  /** shares this container version can provide */
  provides: ShareDecl[];
  /** shares this container version consumes */
  consumes: ShareDecl[];
  /** `__FYNAPP_MANIFEST__`, verbatim, when present */
  manifest?: FynAppManifest;
  /** combined file to the chunk fileNames it carries */
  bundles?: Record<string, string[]>;
  /** ids of modules attributed to this container version */
  moduleIds: string[];
}

export interface ContainerNode {
  name: string;
  /** `__mf_container_<name>` */
  id: string;
  versions: ContainerVersionNode[];
}

export interface ShareSourceInfo {
  id: string;
  container: string;
  version?: string;
}

export interface ShareConsumerInfo {
  container: string;
  containerVersion?: string;
  /** the range the consumer asked for */
  range?: string;
  /** the range is satisfied by this version */
  satisfied: boolean;
}

export interface ShareVersionNode {
  version: string;
  /** set when a copy was actually provided from here */
  url?: string;
  chunkId?: string;
  /** the loader has a record for this copy */
  loaded: boolean;
  stage?: LoadStage;
  sources: ShareSourceInfo[];
  consumers: ShareConsumerInfo[];
}

export interface ShareKeyNode {
  key: string;
  /** any declaring container marked it singleton */
  singleton: boolean;
  versions: ShareVersionNode[];
  /** how many versions have an actual loaded copy */
  loadedCount: number;
  issues: Issue[];
}

export interface ShareScopeNode {
  name: string;
  keys: ShareKeyNode[];
}

export interface BundleNode {
  /** url of the physical combined file */
  url: string;
  /** urls of the modules it carries */
  members: string[];
  /** members the loader has a record for */
  loadedCount: number;
}

/**
 * The FynMesh build manifest a fynapp container entry assigns to itself.
 *
 * Optional enrichment: federation-js knows nothing about it, so every field is
 * treated as untrusted and read only defensively.
 */
export interface FynAppManifest {
  name?: string;
  version?: string;
  exposes?: Record<string, string>;
  /**
   * A shared module this build declared it consumes but does not provide.
   *
   * `semver` is the whole entry. The enrichment builds a fresh `{ semver }`
   * from the shared config and drops the rest, so the `singleton` this used to
   * declare here never existed in any emitted manifest -- checked against
   * every built demo manifest, where it appears zero times. Read singleton-ness
   * off `provide-shared`, or off the live `$SC`.
   */
  "consume-shared"?: Record<string, { semver?: string }>;
  /**
   * A shared module this build declared it provides.
   *
   * Open-ended because the enrichment stores the author's whole shared config
   * object by reference rather than picking fields out of it, so anything the
   * config carried lands here. `singleton` and `semver` are on every real
   * entry; `requiredVersion` shows up as a map of peer ranges, not a string.
   */
  "provide-shared"?: Record<
    string,
    {
      semver?: string;
      singleton?: boolean;
      eager?: boolean;
      import?: boolean;
      [key: string]: unknown;
    }
  >;
  "import-exposed"?: Record<
    string,
    Record<
      string,
      {
        semver?: string;
        sites?: string[];
        /** `"module"` or `"middleware"`; the producer emits no other value */
        type?: string;
        /** middleware imports only: the expose the middleware was found on */
        exposeModule?: string;
        /** middleware imports only */
        middlewareName?: string;
      }
    >
  >;
  "shared-providers"?: Record<string, { semver?: string; provides?: string[] }>;
  /**
   * The generic dialect's share map.
   *
   * Written only by rollup-plugin-federation's no-enrichment branch, and
   * always written by it -- so its presence, empty or not, is what tells the
   * two manifest dialects apart. See `manifestDialect` in the containers view.
   */
  shared?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

/* -------------------------------------------------------------- FynMesh */

/**
 * Which build of `@fynmesh/kernel` this page is running.
 *
 * A shape probe, never a version check. `kernel.version` is recorded for a bug
 * report but gates nothing, because the shipped build is the moving target and
 * the version number is not: the min build mangles property names the dev build
 * keeps, and which ones is a property of the terser run, not of the release.
 */
export type KernelBuild = "dev" | "minified" | "unknown";

/** `FynAppState.status`, as `FynAppLifecycle` records it. */
export type FynAppStatus =
  | "bootstrapping"
  | "mounted"
  | "suspended"
  | "failed"
  | "shutdown";

/** One `__middlewareMeta` entry, normalised across its three declaration forms. */
export interface MiddlewareUseNode {
  name?: string;
  provider?: string;
  /** the semver range the consumer asked for, when it declared one */
  range?: string;
  /**
   * the shape it was written in: a bare `-FYNAPP_MIDDLEWARE ...` string, a
   * `{ mw, config }` object, or the `{ info, config }` object `useMiddleware`
   * produces. `unknown` is a declaration the kernel itself would refuse.
   */
  form: "string" | "mw" | "info" | "unknown";
  /** the raw string, for the two string forms -- kept even when it will not parse */
  raw?: string;
  /** the config, when it survived a structured clone */
  config?: unknown;
  configKind?: "json" | "opaque";
  /** top-level keys only, when the config could not be cloned */
  configKeys?: string[];
  /** something is registered under this name in `runTime.middlewares` */
  registered: boolean;
  /** the `provider::name` key it resolved to */
  resolvedRegKey?: string;
  /**
   * the exact registration, when there is only one it could be.
   *
   * Left undefined when a declared range has to be matched against several
   * registered versions: the kernel resolves that with its own semver, and a
   * guess here would name a version the app may not actually be running.
   */
  resolvedFullKey?: string;
  /** the registered version key it resolved to */
  resolvedVersion?: string;
  /** which branch of the kernel's resolution order got there */
  resolvedVia?: MiddlewareResolution;
  /** `middlewareContext` has an entry under this name */
  delivered: boolean;
}

/**
 * How one declaration lands on one registered version.
 *
 * The branches of `MiddlewareManager.resolveFromVersionMap`, kept apart because
 * they mean different things even when they pick the same registration:
 * `default` asked for nothing and got the slot, while `fallback` asked for a
 * range, got nothing that satisfied it, and is running a version it did not ask
 * for. `unresolved` is the collector's own: the middleware is registered but
 * which version this lands on could not be read.
 */
export type MiddlewareResolution = "exact" | "range" | "default" | "fallback" | "unresolved";

/** One FynApp's declaration, seen from the middleware it resolves to. */
export interface MiddlewareConsumerNode {
  /** `name@version` of the consuming FynApp */
  app: string;
  /** the semver range it declared, when it declared one */
  range?: string;
  /**
   * it named this provider, so the kernel's exact `provider::name` lookup hit.
   *
   * False means the kernel resolved it by scanning for the name, which is the
   * path that picks a provider on the consumer's behalf when a name is
   * registered more than once (FYM-333).
   */
  pinnedProvider: boolean;
  /** the app's `middlewareContext` carries an entry under this middleware's name */
  delivered: boolean;
  via: MiddlewareResolution;
}

export interface MiddlewareVersionNode {
  version: string;
  /**
   * occupies the registry's `default` slot: what a lookup that asks for no
   * version resolves to.
   *
   * The *first* version registered, and the kernel never re-points it
   * (FYM-332) -- re-pointing to the highest would move `default` under a page
   * that is already running. So this is not "the best version", it is "the one
   * a version-less lookup gets".
   */
  isDefault: boolean;
  fullKey: string;
  /** `name@version` of the FynApp hosting it */
  hostApp: string;
  exposeName: string;
  exportName: string;
  autoApplyScope?: string[];
  hasSetup: boolean;
  hasApply: boolean;
  hasShouldApply: boolean;
  overridesExecution: boolean;
  /** which of the three override hooks it implements; empty, never absent */
  overrideHooks: string[];
  /** the declarations that resolve to this version */
  consumers: MiddlewareConsumerNode[];
}

export interface MiddlewareNode {
  /** `provider::name` */
  regKey: string;
  name: string;
  provider: string;
  versions: MiddlewareVersionNode[];
  /**
   * version keys in the registry whose registration could not be read.
   *
   * Counted rather than skipped: an empty `versions` beside a non-empty this is
   * unreadable, and beside an empty this is genuinely empty.
   */
  unreadableVersions: string[];
  /** the version occupying the `default` slot; absent when nothing does */
  defaultVersion?: string;
  /** `name@version` of every FynApp whose `__middlewareMeta` names this */
  consumers: string[];
  /** consumers that resolve to this middleware but to none of its versions */
  unpinnedConsumers: MiddlewareConsumerNode[];
  /** other `provider::name` keys registering this same middleware name */
  nameCollisions: string[];
  /** absent, rather than empty, when auto-apply could not be read at all */
  autoApply?: Array<"fynapp" | "mw">;
}

/**
 * One FynApp instance, which is exactly one container version.
 *
 * `loadFynAppBasics` builds a FynApp straight off the container, so name and
 * version are the container's own and the join needs no heuristic. What makes
 * the two views different is what they can say: a container row is what the
 * build published, and this is what the kernel did with it.
 */
export interface FynAppNode {
  name: string;
  version: string;
  /** `name@version` -- the lifecycle table's key, and this node's identity */
  key: string;
  packageName?: string;
  /**
   * present in `runTime.apps`.
   *
   * False for a row known only from the lifecycle table, which is what a
   * shutdown app looks like. Distinguished because such a row has no exposes
   * and no middleware to read, and an empty list there means unreadable, not
   * empty.
   */
  inRegistry: boolean;
  /**
   * the bare-name registry key also points at this instance.
   *
   * `FynAppRegistry.add` files every app under both `name` and `name@version`,
   * so with two versions of one name live the bare key is ambiguous and silently
   * resolves to whichever registered last.
   */
  isDefaultForName: boolean;
  /** undefined when the app is in the registry but has no lifecycle row */
  status?: FynAppStatus;
  mountedAt?: number;
  updatedAt?: number;
  /** the kernel retains this only while status is `failed` */
  error?: { message: string; stack?: string };
  /** joins into `ContainerNode.id` */
  containerId?: string;
  /** set only when the container collector saw this exact version */
  containerVersion?: string;
  /** exposes the kernel actually pulled in (`fynApp.exposes`) */
  loadedExposes: string[];
  /** exposes the build declared (`container.$E`) */
  declaredExposes: string[];
  /** FynUnit hooks the `./main` expose implements */
  unitHooks: string[];
  usesMiddleware: MiddlewareUseNode[];
  /** `middlewareContext` keys, in the order the middleware wrote them */
  middlewareDelivered: string[];
  /** regKeys of middleware hosted by this FynApp */
  providesMiddleware: string[];
  /** `./config` was loaded. The value is never snapshotted -- see the collector */
  hasConfig: boolean;
}

export interface FynMeshNode {
  kernelVersion?: string;
  shareScopeName?: string;
  build: KernelBuild;
  apps: FynAppNode[];
  middlewares: MiddlewareNode[];
  /**
   * `runTime.autoApply` or `mwMgr.getAutoApply()` answered.
   *
   * False makes every `MiddlewareNode.autoApply` unknown rather than none:
   * `runTime.autoApply` is created lazily by the first scoped registration, so
   * a missing field on its own cannot tell "nothing auto-applies" from "this
   * kernel does not say".
   */
  autoApplyReadable: boolean;
}

export interface Snapshot {
  /** schema version, so a remote agent and a panel can disagree loudly */
  schema: 1;
  /** `Date.now()` at collection */
  takenAt: number;
  /** `location.href`, so a panel can label which page this came from */
  origin?: string;
  /** how long the collect took, in ms */
  collectMs: number;
  capability: Capability;
  loaders: LoaderInfo[];
  modules: ModuleNode[];
  containers: ContainerNode[];
  scopes: ShareScopeNode[];
  bundles: BundleNode[];
  /**
   * The FynMesh kernel layer, when there is one on the page.
   *
   * Absent -- not empty -- when `globalThis.fynMeshKernel` is not there, which
   * is what lets the UI hide the FynApps tab rather than render a table that
   * reads as "this page has zero FynApps".
   */
  fynmesh?: FynMeshNode;
  issues: Issue[];
  /** anything that threw during collection, kept rather than swallowed */
  errors: string[];
}

export function emptyCapability(): Capability {
  return {
    records: false,
    registrations: false,
    aliases: false,
    stageOf: false,
    federation: false,
    shareStore: false,
    shareConfig: false,
    requiredVersionMaps: false,
    exposes: false,
    manifest: false,
    bundleMap: false,
    kernel: false,
    kernelRunTime: false,
    kernelLifecycle: false,
    kernelMiddleware: false,
    notes: [],
  };
}

/** An empty snapshot, for "nothing found" and for tests. */
export function emptySnapshot(): Snapshot {
  return {
    schema: 1,
    takenAt: Date.now(),
    collectMs: 0,
    capability: emptyCapability(),
    loaders: [],
    modules: [],
    containers: [],
    scopes: [],
    bundles: [],
    issues: [],
    errors: [],
  };
}

/** Id prefix `_mfContainer` files a container under. */
export const CONTAINER_ID_PREFIX = "__mf_container_";
/** Id prefix `_mfBind` gives a container's entry chunk. */
export const ENTRY_ID_PREFIX = "__mf_entry_";
