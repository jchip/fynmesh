/**
 * Manifest Resolution Module
 * Handles FynApp manifest fetching, caching, and dependency resolution
 */

import type {
  FynAppManifest,
  RegistryResolver,
  RegistryResolverResult,
  KernelTelemetry,
} from "../types";
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";
import { getFederation } from "../util";

export interface ManifestMeta {
  name: string;
  version: string;
  url: string;
  distBase: string;
}

export interface ResolvedManifest {
  key: string;
  res: RegistryResolverResult;
  manifest: FynAppManifest;
}

export interface DependencyGraph {
  nodes: Set<string>;
  adj: Map<string, Set<string>>;
  indegree: Map<string, number>;
}

export interface ManifestResolver {
  /** Resolved manifests keyed by `name@version`. */
  manifestCache: Map<string, FynAppManifest>;
  /** Per-package metadata gathered while walking the dependency graph. */
  nodeMeta: Map<string, ManifestMeta>;
  setRegistryResolver(resolver: RegistryResolver): void;
  setPreloadCallback(callback: (url: string, depth: number) => void): void;
  /** Preload the entry file of each requested FynApp, before the dependency
   * graph is built, so the first batch starts fetching in parallel. */
  warmPreload(requests: Array<{ name: string; range?: string }>): Promise<void>;
  getDistBase(res: RegistryResolverResult): string;
  resolveAndFetch(name: string, range?: string): Promise<ResolvedManifest>;
  buildGraph(requests: Array<{ name: string; range?: string }>): Promise<DependencyGraph>;
  topoBatches(graph: DependencyGraph): string[][];
}

/**
 * Built as a closure over its state rather than a class.
 *
 * The state is per-instance and entirely private, and every helper below is
 * reachable only from within — which is exactly the shape a minifier can act
 * on. Class members can never be renamed below their declared name, inlined, or
 * dropped when unused; closure variables are renamed to one character, and
 * single-use helpers get inlined away entirely. The methods that remain on the
 * returned object are only those the kernel and the tests call.
 *
 * The cast keeps `new ManifestResolver(tel)` working and correctly typed
 * at every existing call site: calling a function with `new` evaluates to the
 * object it returns.
 */
export const ManifestResolver = function (telemetry?: KernelTelemetry): ManifestResolver {
  const tel = telemetry ?? noOpTelemetry;
  const manifestCache = new Map<string, FynAppManifest>();
  const nodeMeta = new Map<string, ManifestMeta>();
  const preloadedEntries = new Map<string, number>();
  let registryResolver: RegistryResolver | undefined;
  let preloadCallback: ((url: string, depth: number) => void) | undefined;

  const calculateDistBase = (res: RegistryResolverResult): string =>
    res.distBase || new URL(res.url, location.href).pathname.replace(/\/[^/]*$/, "/");

  /** Preload an entry file, deduplicated by URL and tracking its depth. */
  const preloadEntryFile = (distBase: string, depth: number): void => {
    const entryUrl = `${distBase}fynapp-entry.js`;
    if (preloadedEntries.has(entryUrl)) {
      return;
    }
    preloadedEntries.set(entryUrl, depth);
    if (preloadCallback) {
      console.debug(`⚡ Preloading entry file: ${entryUrl} (depth: ${depth})`);
      preloadCallback(entryUrl, depth);
    }
  };

  const updateNodeMeta = (
    key: string,
    res: RegistryResolverResult,
    manifest: FynAppManifest,
  ): void => {
    nodeMeta.set(key, {
      name: res.name,
      version: manifest.version || res.version,
      url: res.url,
      distBase: calculateDistBase(res),
    });
  };

  /** Emit the resolve.duration metric and resolved event for a completed resolution. */
  const reportResolved = (t0: number, name: string, version: string | undefined): void => {
    tel.capture({ type: "metric", name: "resolve.duration", value: Date.now() - t0, data: { name } });
    captureEvent(tel, "resolved", { name, version });
  };

  /**
   * Cache a freshly obtained manifest under its resolved key and report it.
   * Shared by the embedded-manifest and fetched-manifest paths, which differ
   * only in where the manifest came from.
   */
  const cacheResolved = (
    t0: number,
    name: string,
    res: RegistryResolverResult,
    manifest: FynAppManifest,
  ): ResolvedManifest => {
    const version = manifest.version || res.version;
    const key = `${res.name}@${version}`;
    manifestCache.set(key, manifest);
    updateNodeMeta(key, res, manifest);
    reportResolved(t0, name, version);
    return { key, res, manifest };
  };

  const fetchJson = async (url: string): Promise<any> => {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };

  const resolveAndFetch = async (name: string, range?: string): Promise<ResolvedManifest> => {
    const t0 = Date.now();
    if (!registryResolver) {
      throw new Error("No registry resolver configured");
    }

    const res = await registryResolver(name, range);

    // Optimize: Create final key once and check cache
    const resolvedVersion = res.version;
    const cacheKey = `${res.name}@${resolvedVersion}`;
    const cached = manifestCache.get(cacheKey);

    if (cached) {
      // Fast path: already cached
      updateNodeMeta(cacheKey, { ...res, version: resolvedVersion }, cached);
      reportResolved(t0, name, cached.version || resolvedVersion);
      return { key: cacheKey, res, manifest: cached };
    }

    // Manifest resolution has four tiers, first success wins. See
    // notes/BUILD-ARTIFACTS.md for what each source contains.
    //
    //   1. `__FYNAPP_MANIFEST__` embedded in the entry file -- free, since the
    //      entry has to be imported anyway to get the container.
    //   2. `fynapp.manifest.json` -- same content, one extra request per app.
    //   3. `federation.json` -- PARTIAL. It has no `import-exposed` and no
    //      `shared-providers`, so an app resolved this way comes up with no
    //      dependency edges: it loads, nothing it depends on loads with it.
    //   4. A synthesized empty manifest, so the demo can proceed regardless.
    //
    // Tier 1 first: extract the embedded manifest from the entry file (zero HTTP
    // overhead). Federation.import() loads the SystemJS module so the manifest
    // export can be read off it.
    try {
      const entryUrl = res.url.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
      const entryModule = await getFederation().import(entryUrl);
      if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
        return cacheResolved(t0, name, res, entryModule.__FYNAPP_MANIFEST__);
      }
    } catch (embeddedErr) {
      // Entry module doesn't exist or doesn't have embedded manifest, fall back to fetching
    }

    let manifest: FynAppManifest;
    try {
      manifest = await fetchJson(res.url);
    } catch (err1) {
      try {
        // Tier 3: fallback to federation.json in same dist -- partial, see above
        manifest = await fetchJson(
          res.url.replace(/fynapp\.manifest\.json$/, "federation.json"),
        );
      } catch (err2) {
        // demo fallback: synthesize an empty manifest (no requires) and proceed
        manifest = { name, version: res.version, requires: [] };
      }
    }

    return cacheResolved(t0, name, res, manifest);
  };

  const buildGraph = async (
    requests: Array<{ name: string; range?: string }>,
  ): Promise<DependencyGraph> => {
    const adj = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    const nodes = new Set<string>();

    const visit = async (
      name: string,
      range?: string,
      parentKey?: string,
      depth: number = 0,
    ): Promise<string> => {
      const { key, manifest } = await resolveAndFetch(name, range);
      const isNewNode = !nodes.has(key);

      if (isNewNode) {
        nodes.add(key);
        indegree.set(key, indegree.get(key) ?? 0);
      }

      if (parentKey) {
        // Edge: dep (key) -> parent (parentKey)
        const set = adj.get(key) || new Set<string>();
        if (!set.has(parentKey)) {
          set.add(parentKey);
          adj.set(key, set);
          indegree.set(parentKey, (indegree.get(parentKey) ?? 0) + 1);
        }
      }

      // Only process dependencies if this is the first time visiting this node
      if (!isNewNode) {
        return key;
      }

      // Preload a dependency's entry file, then walk into it. The three
      // dependency sources below differ only in where they get the name and
      // semver from; everything after that is identical.
      const visitDep = async (depName: string, semver?: string): Promise<void> => {
        preloadEntryFile(calculateDistBase(await registryResolver!(depName, semver)), depth + 1);
        await visit(depName, semver, key, depth + 1);
      };

      // Process explicit requires field
      for (const req of manifest.requires || []) {
        await visitDep(req.name, req.range);
      }

      // Process import-exposed dependencies (middleware providers, component libraries, etc.)
      const importExposed = manifest["import-exposed"];
      if (importExposed && typeof importExposed === "object") {
        for (const [packageName, modules] of Object.entries(importExposed)) {
          // Extract semver from any module in this package
          let semver: string | undefined;
          if (modules && typeof modules === "object") {
            // Find the first module with a semver
            for (const moduleInfo of Object.values(modules)) {
              if (moduleInfo && typeof moduleInfo === "object" && "semver" in moduleInfo) {
                semver = moduleInfo.semver as string;
                break;
              }
            }
          }
          await visitDep(packageName, semver);
        }
      }

      // Process shared-providers dependencies (shared module providers like React)
      const sharedProviders = manifest["shared-providers"];
      if (sharedProviders && typeof sharedProviders === "object") {
        console.debug(`📦 Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
        for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
          // Extract semver from the provider info
          let semver: string | undefined;
          if (providerInfo && typeof providerInfo === "object" && "semver" in providerInfo) {
            semver = providerInfo.semver as string;
          }
          console.debug(`  → Loading shared provider: ${packageName}@${semver || 'latest'}`);
          await visitDep(packageName, semver);
        }
      }

      return key;
    };

    for (const r of requests) {
      await visit(r.name, r.range);
    }

    console.debug('buildGraph completed, nodes:', Array.from(nodes));
    captureEvent(tel, "graph.built", { nodes: nodes.size });
    return { nodes, adj, indegree };
  };

  const topoBatches = (graph: DependencyGraph): string[][] => {
    const { nodes, adj } = graph;
    const indegree = new Map(graph.indegree);
    const q: string[] = [];

    for (const n of nodes) {
      if ((indegree.get(n) ?? 0) === 0) q.push(n);
    }

    const order: string[] = [];
    const batches: string[][] = [];

    while (q.length) {
      // process a batch (all current zero indegree)
      const batch = q.splice(0, q.length);
      batches.push(batch);
      for (const u of batch) {
        order.push(u);
        for (const v of adj.get(u) ?? []) {
          indegree.set(v, (indegree.get(v) ?? 0) - 1);
          if ((indegree.get(v) ?? 0) === 0) q.push(v);
        }
      }
    }

    if (order.length < nodes.size) {
      const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
      console.warn(`⚠️ Dependency cycle detected among: ${cyclic.join(", ")} - proceeding with best-effort loading`);
      // Add all cyclic nodes as a final batch
      batches.push(cyclic);
    }

    return batches;
  };

  return {
    // Exposed because the manifest-resolution tests seed and assert them
    // directly; they are the caching behaviour those tests exist to cover.
    manifestCache,
    nodeMeta,
    setRegistryResolver: (resolver) => {
      registryResolver = resolver;
    },
    setPreloadCallback: (callback) => {
      preloadCallback = callback;
    },
    async warmPreload(requests) {
      if (!preloadCallback || !registryResolver) return;
      for (const r of requests) {
        preloadEntryFile(calculateDistBase(await registryResolver(r.name, r.range)), 0);
      }
    },
    getDistBase: calculateDistBase,
    resolveAndFetch,
    buildGraph,
    topoBatches,
  };
} as unknown as new (tel?: KernelTelemetry) => ManifestResolver;
