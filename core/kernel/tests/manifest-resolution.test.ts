import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel, createMockManifest } from "./fixtures/test-kernel";
import type { RegistryResolver, FynAppManifest } from "../src/types";

describe("Manifest Resolution", () => {
  let kernel: TestKernel;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockResolver: RegistryResolver;

  beforeEach(() => {
    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock location for browser environment
    global.location = { href: "http://localhost:3000/" } as any;

    // Mock globalThis.Federation for embedded manifest tests
    (globalThis as any).Federation = {
      import: vi.fn(),
    };

    mockResolver = vi.fn().mockImplementation(async (name, range) => ({
      name,
      version: range || "1.0.0",
      manifestUrl: `http://localhost:3000/${name}/dist/fynapp.manifest.json`,
      distBase: `http://localhost:3000/${name}/dist/`,
    }));

    kernel = createTestKernel({ registryResolver: mockResolver });
  });

  describe("resolveAndFetch", () => {
    it("should use cached manifest when available", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      // Pre-populate cache
      (kernel.manifestResolver as any).manifestCache.set("app1@1.0.0", manifest);

      const result = await kernel.testResolveAndFetch("app1", "1.0.0");

      expect(result.key).toBe("app1@1.0.0");
      expect(result.manifest).toBe(manifest);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should calculate distBase correctly from manifestUrl", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      // Resolver without distBase
      mockResolver = vi.fn().mockResolvedValue({
        name: "app1",
        version: "1.0.0",
        manifestUrl: "http://localhost:3000/app1/dist/fynapp.manifest.json",
        // No distBase provided
      });

      kernel.setRegistryResolver(mockResolver);

      const result = await kernel.testResolveAndFetch("app1");

      // Should calculate distBase from manifestUrl
      // Should calculate distBase from manifestUrl
      const nodeMeta = (kernel.manifestResolver as any).nodeMeta.get("app1@1.0.0");
      expect(nodeMeta.distBase).toBe("/app1/dist/");
    });

    it("should try embedded manifest first (zero HTTP)", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      // Mock Federation.import to return entry module with embedded manifest
      const mockImport = vi.fn().mockResolvedValue({
        __FYNAPP_MANIFEST__: manifest,
      });
      (globalThis as any).Federation.import = mockImport;

      const result = await kernel.testResolveAndFetch("app1");

      expect(mockImport).toHaveBeenCalledWith("http://localhost:3000/app1/dist/fynapp-entry.js");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.manifest).toEqual(manifest);
    });

    it("should fallback to fynapp.manifest.json", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      // Federation.import fails
      (globalThis as any).Federation.import = vi.fn().mockRejectedValue(new Error("Not found"));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      const result = await kernel.testResolveAndFetch("app1");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/app1/dist/fynapp.manifest.json",
        { credentials: "same-origin" }
      );
      expect(result.manifest).toEqual(manifest);
    });

    it("should fallback to federation.json", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      // Federation.import fails
      (globalThis as any).Federation.import = vi.fn().mockRejectedValue(new Error("Not found"));

      // First fetch fails (fynapp.manifest.json)
      mockFetch.mockRejectedValueOnce(new Error("404"));

      // Second fetch succeeds (federation.json)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      const result = await kernel.testResolveAndFetch("app1");

      expect(mockFetch).toHaveBeenNthCalledWith(2,
        "http://localhost:3000/app1/dist/federation.json",
        { credentials: "same-origin" }
      );
      expect(result.manifest).toEqual(manifest);
    });

    it("should synthesize manifest as last resort", async () => {
      // Federation.import fails
      (globalThis as any).Federation.import = vi.fn().mockRejectedValue(new Error("Not found"));

      // All fetches fail
      mockFetch.mockRejectedValue(new Error("404"));

      const result = await kernel.testResolveAndFetch("app1");

      // Should create synthesized manifest
      expect(result.manifest).toEqual({
        name: "app1",
        version: "1.0.0",
        requires: [],
      });
    });

    it("should cache manifest after fetching", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      // First call - should fetch
      await kernel.testResolveAndFetch("app1");

      // Second call - should use cache
      await kernel.testResolveAndFetch("app1");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should store nodeMeta for all resolution paths", async () => {
      const manifest = createMockManifest({ name: "app1", version: "2.0.0" });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      const result = await kernel.testResolveAndFetch("app1");

      const nodeMeta = (kernel.manifestResolver as any).nodeMeta.get("app1@2.0.0");
      expect(nodeMeta).toBeDefined();
      expect(nodeMeta.name).toBe("app1");
      expect(nodeMeta.version).toBe("2.0.0");
      expect(nodeMeta.manifestUrl).toBe("http://localhost:3000/app1/dist/fynapp.manifest.json");
    });

    it("should handle version from manifest vs resolver", async () => {
      const manifest = createMockManifest({
        name: "app1",
        version: "2.0.0" // Different from resolver version
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      const result = await kernel.testResolveAndFetch("app1", "1.0.0");

      // Should use version from manifest
      expect(result.key).toBe("app1@2.0.0");
      expect((kernel.manifestResolver as any).manifestCache.has("app1@2.0.0")).toBe(true);
    });
  });

  describe("buildGraph", () => {
    it("should build dependency graph from requires", async () => {
      const manifestA = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        requires: [{ name: "app-b" }],
      });

      const manifestB = createMockManifest({
        name: "app-b",
        version: "1.0.0",
        requires: [],
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifestA };
        } else if (url.includes("app-b")) {
          return { ok: true, json: async () => manifestB };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([{ name: "app-a" }]);

      expect(graph.nodes.has("app-a@1.0.0")).toBe(true);
      expect(graph.nodes.has("app-b@1.0.0")).toBe(true);
      expect(graph.adj.get("app-b@1.0.0")?.has("app-a@1.0.0")).toBe(true);
      expect(graph.indegree.get("app-a@1.0.0")).toBe(1);
      expect(graph.indegree.get("app-b@1.0.0")).toBe(0);
    });

    it("should include import-exposed dependencies", async () => {
      const manifest = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        "import-exposed": {
          "middleware-provider": {
            "middleware/test": {
              semver: "2.0.0",
              type: "middleware",
            },
          },
        },
      });

      const middlewareManifest = createMockManifest({
        name: "middleware-provider",
        version: "2.0.0",
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifest };
        } else if (url.includes("middleware-provider")) {
          return { ok: true, json: async () => middlewareManifest };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([{ name: "app-a" }]);

      expect(graph.nodes.has("middleware-provider@2.0.0")).toBe(true);
      expect(graph.adj.get("middleware-provider@2.0.0")?.has("app-a@1.0.0")).toBe(true);
    });

    it("should include shared-providers dependencies", async () => {
      const manifest = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        "shared-providers": {
          "react-provider": {
            semver: "18.0.0",
            provides: ["react", "react-dom"],
          },
        },
      });

      const providerManifest = createMockManifest({
        name: "react-provider",
        version: "18.0.0",
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifest };
        } else if (url.includes("react-provider")) {
          return { ok: true, json: async () => providerManifest };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([{ name: "app-a" }]);

      expect(graph.nodes.has("react-provider@18.0.0")).toBe(true);
      expect(graph.adj.get("react-provider@18.0.0")?.has("app-a@1.0.0")).toBe(true);
    });

    it("should handle circular dependencies gracefully", async () => {
      // Note: The actual implementation should detect cycles in topoBatches
      const manifestA = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        requires: [{ name: "app-b" }],
      });

      const manifestB = createMockManifest({
        name: "app-b",
        version: "1.0.0",
        requires: [{ name: "app-a" }], // Circular dependency
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifestA };
        } else if (url.includes("app-b")) {
          return { ok: true, json: async () => manifestB };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([{ name: "app-a" }]);

      // Graph should still be built
      expect(graph.nodes.has("app-a@1.0.0")).toBe(true);
      expect(graph.nodes.has("app-b@1.0.0")).toBe(true);
    });

    it("should deduplicate nodes", async () => {
      const manifestA = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        requires: [{ name: "app-c" }],
      });

      const manifestB = createMockManifest({
        name: "app-b",
        version: "1.0.0",
        requires: [{ name: "app-c" }],
      });

      const manifestC = createMockManifest({
        name: "app-c",
        version: "1.0.0",
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifestA };
        } else if (url.includes("app-b")) {
          return { ok: true, json: async () => manifestB };
        } else if (url.includes("app-c")) {
          return { ok: true, json: async () => manifestC };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([
        { name: "app-a" },
        { name: "app-b" },
      ]);

      // app-c should only appear once in the graph
      const nodeArray = Array.from(graph.nodes);
      const appCCount = nodeArray.filter((n) => (n as string).startsWith("app-c@")).length;
      expect(appCCount).toBe(1);
    });

    it("should calculate correct indegree", async () => {
      const manifestA = createMockManifest({
        name: "app-a",
        version: "1.0.0",
        requires: [
          { name: "app-b" },
          { name: "app-c" },
        ],
      });

      const manifestB = createMockManifest({
        name: "app-b",
        version: "1.0.0",
        requires: [{ name: "app-c" }],
      });

      const manifestC = createMockManifest({
        name: "app-c",
        version: "1.0.0",
      });

      mockFetch.mockImplementation(async (url) => {
        if (url.includes("app-a")) {
          return { ok: true, json: async () => manifestA };
        } else if (url.includes("app-b")) {
          return { ok: true, json: async () => manifestB };
        } else if (url.includes("app-c")) {
          return { ok: true, json: async () => manifestC };
        }
        throw new Error("Unknown app");
      });

      const graph = await kernel.testBuildGraph([{ name: "app-a" }]);

      // app-a depends on 2 (b and c)
      expect(graph.indegree.get("app-a@1.0.0")).toBe(2);
      // app-b depends on 1 (c)
      expect(graph.indegree.get("app-b@1.0.0")).toBe(1);
      // app-c has no dependencies (but is depended on)
      expect(graph.indegree.get("app-c@1.0.0")).toBe(0);
    });
  });

  describe("topoBatches", () => {
    it("should produce correct topological order", () => {
      const graph = {
        nodes: new Set(["a", "b", "c"]),
        adj: new Map([
          ["c", new Set(["b"])],
          ["b", new Set(["a"])],
        ]),
        indegree: new Map([
          ["a", 1],  // "a" has 1 incoming edge from "b"
          ["b", 1],  // "b" has 1 incoming edge from "c"
          ["c", 0],  // "c" has no incoming edges
        ]),
      };

      const batches = kernel.testTopoBatches(graph);

      expect(batches).toHaveLength(3);
      expect(batches[0]).toEqual(["c"]);
      expect(batches[1]).toEqual(["b"]);
      expect(batches[2]).toEqual(["a"]);
    });

    it("should group independent nodes into batches", () => {
      const graph = {
        nodes: new Set(["a", "b", "c", "d"]),
        adj: new Map([
          ["c", new Set(["a"])],
          ["d", new Set(["b"])],
        ]),
        indegree: new Map([
          ["a", 1],
          ["b", 1],
          ["c", 0],
          ["d", 0],
        ]),
      };

      const batches = kernel.testTopoBatches(graph);

      expect(batches).toHaveLength(2);
      expect(batches[0]).toContain("c");
      expect(batches[0]).toContain("d");
      expect(batches[0]).toHaveLength(2);
      expect(batches[1]).toContain("a");
      expect(batches[1]).toContain("b");
      expect(batches[1]).toHaveLength(2);
    });

    it("should detect cycles, warn, and return cyclic nodes", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
      const graph = {
        nodes: new Set(["a", "b"]),
        adj: new Map([
          ["a", new Set(["b"])],
          ["b", new Set(["a"])],
        ]),
        indegree: new Map([
          ["a", 1],
          ["b", 1],
        ]),
      };

      const batches = kernel.testTopoBatches(graph);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Dependency cycle detected"));
      expect(batches).toHaveLength(1);
      expect(batches[0]).toContain("a");
      expect(batches[0]).toContain("b");

      consoleSpy.mockRestore();
    });

    it("should handle single node graph", () => {
      const graph = {
        nodes: new Set(["a"]),
        adj: new Map(),
        indegree: new Map([["a", 0]]),
      };

      const batches = kernel.testTopoBatches(graph);

      expect(batches).toHaveLength(1);
      expect(batches[0]).toEqual(["a"]);
    });

    it("should handle disconnected graphs", () => {
      const graph = {
        nodes: new Set(["a", "b", "c", "d"]),
        adj: new Map([["a", new Set(["b"])]]),
        indegree: new Map([
          ["a", 0],
          ["b", 1],
          ["c", 0],
          ["d", 0],
        ]),
      };

      const batches = kernel.testTopoBatches(graph);

      expect(batches).toHaveLength(2);
      // First batch has all nodes with indegree 0
      expect(batches[0]).toContain("a");
      expect(batches[0]).toContain("c");
      expect(batches[0]).toContain("d");
      expect(batches[0]).toHaveLength(3);
      // Second batch has b
      expect(batches[1]).toEqual(["b"]);
    });
  });
});
