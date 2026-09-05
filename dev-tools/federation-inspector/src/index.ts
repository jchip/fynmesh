/**
 * federation-inspector — library entry.
 *
 * Importing this has no side effects: nothing is mounted, no hook is
 * installed, no global is written. That is what makes it usable from an
 * extension, from a test, and from an app that wants the inspector on a key
 * combination of its own. `standalone.ts` is the entry that does mount itself.
 *
 * Three layers, usable independently:
 *
 *   collect()   read a page's loader into a plain JSON Snapshot
 *   analyse()   derive the graph, share resolution and diagnostics from one
 *   mount()     render the UI over an Adapter that supplies snapshots
 */

export { collect, fingerprint } from "./core/collect.js";
export type { CollectOptions } from "./core/collect.js";
export { probe } from "./core/capability.js";

export { analyse } from "./analysis/index.js";
export type { Analysis } from "./analysis/index.js";
export {
  buildGraph,
  neighbourhood,
  layerLayout,
  resolveShares,
  consumersOf,
  findIssues,
  parseQuery,
  filterModules,
  matches,
  toggleFacet,
  fuzzy,
  satisfies,
  maxSatisfying,
  compareVersionStrings,
  parseVersion,
} from "./analysis/index.js";
export type { Graph, Term } from "./analysis/index.js";

export { mount, ELEMENT_NAME } from "./ui/mount.jsx";
export type { MountOptions, InspectorHandle } from "./ui/mount.jsx";

export { LiveAdapter } from "./adapters/live.js";
export type { LiveAdapterOptions } from "./adapters/live.js";
export { RemoteAdapter, serveRemote, windowTransport } from "./adapters/remote.js";
export type { ServeOptions } from "./adapters/remote.js";
export type { Adapter, Transport, RemoteMessage } from "./adapters/types.js";

export { emptySnapshot, CONTAINER_ID_PREFIX, ENTRY_ID_PREFIX } from "./core/model.js";
export type {
  Snapshot,
  ModuleNode,
  ModuleKind,
  ModuleRef,
  ContainerNode,
  ContainerVersionNode,
  ShareScopeNode,
  ShareKeyNode,
  ShareVersionNode,
  ShareDecl,
  ExposeInfo,
  BundleNode,
  Issue,
  IssueSeverity,
  LoadStage,
  LoaderInfo,
  Capability,
  FynAppManifest,
  ViewName,
} from "./core/model.js";
