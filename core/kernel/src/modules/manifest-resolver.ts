/**
 * Manifest Resolution Module
 * Handles FynApp manifest fetching, caching, and dependency resolution
 */

import type {
  FynAppManifest,
  RegistryResolver,
  RegistryResolverResult,
} from "../types";

export interface ManifestMeta {
  name: string;
  version: string;
  manifestUrl: string;
  distBase: string;
}

export interface ResolvedManifest {
  key: string;
  res: RegistryResolverResult;
  manifest: FynAppManifest;
}

export class ManifestResolver {
  private registryResolver?: RegistryResolver;
  private manifestCache: Map<string, FynAppManifest> = new Map();
  private nodeMeta: Map<string, ManifestMeta> = new Map();

  /**
   * Install a registry resolver (browser: demo server paths)
   */
  setRegistryResolver(resolver: RegistryResolver): void {
    this.registryResolver = resolver;
  }

  /**
   * Get metadata for a resolved package
   */
  getNodeMeta(key: string): ManifestMeta | undefined {
    return this.nodeMeta.get(key);
  }

  /**
   * Get all node metadata
   */
  getAllNodeMeta(): Map<string, ManifestMeta> {
    return this.nodeMeta;
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.manifestCache.clear();
    this.nodeMeta.clear();
  }

  /**
   * Fetch JSON from URL
   */
  private async fetchJson(url: string): Promise<any> {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  /**
   * Resolve and fetch a manifest with caching
   */
  async resolveAndFetch(name: string, range?: string): Promise<ResolvedManifest> {
    if (!this.registryResolver) {
      throw new Error("No registry resolver configured");
    }
    
    const res = await this.registryResolver(name, range);
    
    // Optimize: Create final key once and check cache
    const resolvedVersion = res.version;
    const cacheKey = `${res.name}@${resolvedVersion}`;
    const cached = this.manifestCache.get(cacheKey);
    
    if (cached) {
      // Fast path: already cached
      const distBase = res.distBase || 
        (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
      this.nodeMeta.set(cacheKey, { 
        name: res.name, 
        version: resolvedVersion, 
        manifestUrl: res.manifestUrl, 
        distBase 
      });
      return { key: cacheKey, res, manifest: cached };
    }

    let manifest: FynAppManifest;

    // Try to extract embedded manifest from entry file first (zero HTTP overhead)
    // Use Federation.import() to load the SystemJS module and extract the manifest export
    try {
      const Federation = (globalThis as any).Federation;
      if (Federation) {
        const entryUrl = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
        const entryModule = await Federation.import(entryUrl);
        if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
          manifest = entryModule.__FYNAPP_MANIFEST__;
          const distBase = res.distBase || 
            (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
          // Use version from manifest if available, fallback to resolver version
          const finalVersion = manifest.version || res.version;
          const key = `${res.name}@${finalVersion}`;
          this.manifestCache.set(key, manifest);
          this.nodeMeta.set(key, { 
            name: res.name, 
            version: finalVersion, 
            manifestUrl: res.manifestUrl, 
            distBase 
          });
          return { key, res, manifest };
        }
      }
    } catch (embeddedErr) {
      // Entry module doesn't exist or doesn't have embedded manifest, fall back to fetching
    }

    try {
      manifest = await this.fetchJson(res.manifestUrl);
    } catch (err1) {
      try {
        // fallback to federation.json in same dist
        const fallback = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "federation.json");
        manifest = await this.fetchJson(fallback);
      } catch (err2) {
        // demo fallback: synthesize an empty manifest (no requires) and proceed
        manifest = { name, version: res.version, requires: [] };
      }
    }
    
    const distBase = res.distBase || 
      (new URL(res.manifestUrl, location.href)).pathname.replace(/\/[^/]*$/, "/");
    // Use version from manifest if available, fallback to resolver version
    const finalVersion = manifest.version || res.version;
    const key = `${res.name}@${finalVersion}`;
    this.manifestCache.set(key, manifest);
    this.nodeMeta.set(key, { 
      name: res.name, 
      version: finalVersion, 
      manifestUrl: res.manifestUrl, 
      distBase 
    });
    return { key, res, manifest };
  }

  /**
   * Build dependency graph by resolving manifests recursively
   */
  async buildGraph(requests: Array<{ name: string; range?: string }>): Promise<{
    nodes: Set<string>;
    adj: Map<string, Set<string>>;
    indegree: Map<string, number>;
  }> {
    const adj = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    const nodes = new Set<string>();

    const visit = async (name: string, range?: string, parentKey?: string): Promise<string> => {
      const { key, manifest } = await this.resolveAndFetch(name, range);
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

      // Process explicit requires field
      const requires = manifest.requires || [];
      for (const req of requires) {
        await visit(req.name, req.range, key);
      }

      // Process import-exposed dependencies (middleware providers, component libraries, etc.)
      const importExposed = manifest["import-exposed"];
      if (importExposed && typeof importExposed === "object") {
        for (const [packageName, modules] of Object.entries(importExposed)) {
          // Extract requireVersion from any module in this package
          let requireVersion: string | undefined;
          if (modules && typeof modules === "object") {
            // Find the first module with a requireVersion
            for (const moduleInfo of Object.values(modules)) {
              if (moduleInfo && typeof moduleInfo === "object" && "requireVersion" in moduleInfo) {
                requireVersion = moduleInfo.requireVersion as string;
                break;
              }
            }
          }
          // Visit this package as a dependency
          await visit(packageName, requireVersion, key);
        }
      }

      // Process shared-providers dependencies (shared module providers like React)
      const sharedProviders = manifest["shared-providers"];
      if (sharedProviders && typeof sharedProviders === "object") {
        console.debug(`📦 Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
        for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
          // Extract requireVersion from the provider info
          let requireVersion: string | undefined;
          if (providerInfo && typeof providerInfo === "object" && "requireVersion" in providerInfo) {
            requireVersion = providerInfo.requireVersion as string;
          }
          console.debug(`  → Loading shared provider: ${packageName}@${requireVersion || 'latest'}`);
          // Visit this package as a dependency
          await visit(packageName, requireVersion, key);
        }
      }

      return key;
    };

    for (const r of requests) {
      await visit(r.name, r.range);
    }

    console.debug('buildGraph completed, nodes:', Array.from(nodes));
    return { nodes, adj, indegree };
  }

  /**
   * Calculate topological batches for parallel loading
   */
  topoBatches(graph: { 
    nodes: Set<string>; 
    adj: Map<string, Set<string>>; 
    indegree: Map<string, number> 
  }): string[][] {
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
      throw new Error(`Dependency cycle detected among: ${cyclic.join(", ")}`);
    }

    return batches;
  }
}
