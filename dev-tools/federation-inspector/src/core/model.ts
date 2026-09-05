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
  /** `Container.$E` -- exposes map */
  exposes: boolean;
  /** `__FYNAPP_MANIFEST__` present on at least one container */
  manifest: boolean;
  /** `Federation.bundleUrlFor` -- combined-bundle membership */
  bundleMap: boolean;
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
  /** versions this container is able to provide */
  versions: string[];
  /** required-version map: importer dir to the range from its nearest package.json */
  rvm?: Record<string, string>;
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
  "consume-shared"?: Record<string, { semver?: string; singleton?: boolean }>;
  "import-exposed"?: Record<
    string,
    Record<
      string,
      {
        semver?: string;
        sites?: string[];
        type?: string;
        exposeModule?: string;
        middlewareName?: string;
      }
    >
  >;
  "shared-providers"?: Record<string, { semver?: string; provides?: string[] }>;
  [key: string]: unknown;
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
    exposes: false,
    manifest: false,
    bundleMap: false,
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
