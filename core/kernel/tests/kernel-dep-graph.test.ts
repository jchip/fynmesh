import { describe, it, expect, beforeEach, vi } from "vitest";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import type { RegistryResolverResult, FynAppManifest } from "../src/types.js";

class TestKernel extends FynMeshKernelCore {
  public loadCalls: string[] = [];

  async loadFynApp(baseUrl: string): Promise<void> {
    this.loadCalls.push(baseUrl);
  }
}

describe("Kernel dependency graph and resolver", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = new TestKernel();
    vi.restoreAllMocks();
  });

  it("throws if registry resolver not set", async () => {
    await expect(kernel.loadFynAppsByName([{ name: "a" }])).rejects.toThrow(
      /No registry resolver configured/
    );
  });

  it("loads in topological order with concurrency=1", async () => {
    // a <- b <- c (c depends on b and a)
    kernel.setRegistryResolver(async (name: string): Promise<RegistryResolverResult> => ({
      name,
      version: "1.0.0",
      manifestUrl: `http://test/${name}/dist/fynapp.manifest.json`,
      distBase: `/${name}/dist/`,
    }));

    const fetchMock = vi.fn(async (url: string) => {
      const name = url.split("/")[3]; // http://test/<name>/dist/...
      let manifest: FynAppManifest;
      if (name === "a") {
        manifest = { app: { name: "a", version: "1.0.0" }, requires: [] };
      } else if (name === "b") {
        manifest = { app: { name: "b", version: "1.0.0" }, requires: [{ name: "a", range: "^1.0.0" }] };
      } else if (name === "c") {
        manifest = { app: { name: "c", version: "1.0.0" }, requires: [{ name: "a" }, { name: "b" }] };
      } else {
        manifest = { app: { name, version: "1.0.0" }, requires: [] };
      }
      return { ok: true, json: async () => manifest } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    await kernel.loadFynAppsByName([{ name: "c" }], { concurrency: 1 });
    expect(kernel.loadCalls).toEqual(["/a/dist/", "/b/dist/", "/c/dist/"]);
  });

  it("falls back to federation.json when fynapp.manifest.json 404s", async () => {
    kernel.setRegistryResolver(async (name: string) => ({
      name,
      version: "1.0.0",
      manifestUrl: `http://test/${name}/dist/fynapp.manifest.json`,
      distBase: `/${name}/dist/`,
    }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("fynapp.manifest.json")) {
        return { ok: false, status: 404 } as any;
      }
      if (url.endsWith("federation.json")) {
        const manifest: FynAppManifest = { app: { name: "fallback", version: "1.0.0" }, requires: [] };
        return { ok: true, json: async () => manifest } as any;
      }
      return { ok: false, status: 404 } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    await kernel.loadFynAppsByName([{ name: "fallback" }], { concurrency: 1 });
    expect(kernel.loadCalls).toEqual(["/fallback/dist/"]);
  });

  it("synthesizes manifest when both primary and fallback are missing", async () => {
    kernel.setRegistryResolver(async (name: string) => ({
      name,
      version: "1.0.0",
      manifestUrl: `http://test/${name}/dist/fynapp.manifest.json`,
      distBase: `/${name}/dist/`,
    }));

    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 } as any));
    vi.stubGlobal("fetch", fetchMock);

    await kernel.loadFynAppsByName([{ name: "synth" }], { concurrency: 1 });
    expect(kernel.loadCalls).toEqual(["/synth/dist/"]);
  });

  it("respects concurrency for independent apps", async () => {
    kernel.setRegistryResolver(async (name: string) => ({
      name,
      version: "1.0.0",
      manifestUrl: `http://test/${name}/dist/fynapp.manifest.json`,
      distBase: `/${name}/dist/`,
    }));
    const fetchMock = vi.fn(async (url: string) => {
      const name = url.split("/")[3];
      const manifest: FynAppManifest = { app: { name, version: "1.0.0" }, requires: [] };
      return { ok: true, json: async () => manifest } as any;
    });
    vi.stubGlobal("fetch", fetchMock);

    await kernel.loadFynAppsByName([{ name: "x" }, { name: "y" }], { concurrency: 2 });
    expect(kernel.loadCalls.sort()).toEqual(["/x/dist/", "/y/dist/"].sort());
  });
});


