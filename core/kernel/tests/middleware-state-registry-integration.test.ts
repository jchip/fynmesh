import { describe, it, expect, beforeEach } from 'vitest';
import { FynMeshKernelCore } from '../src/kernel-core.js';
import { MiddlewareStateRegistry } from '../src/middleware-state-registry.js';
import { ObservableState } from '../src/observable-state.js';
import type { FynApp } from '../src/types.js';

// Create a minimal concrete kernel for testing
class TestKernel extends FynMeshKernelCore {
  async loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null> {
    return null;
  }
}

describe('MiddlewareStateRegistry Integration', () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = new TestKernel();
  });

  describe('getMiddlewareRegistry', () => {
    it('should return global registry when scope is "global"', () => {
      const registry = kernel.getMiddlewareRegistry("global");
      expect(registry).toBeInstanceOf(MiddlewareStateRegistry);
    });

    it('should return the same global registry on multiple calls', () => {
      const registry1 = kernel.getMiddlewareRegistry("global");
      const registry2 = kernel.getMiddlewareRegistry("global");
      expect(registry1).toBe(registry2);
    });

    it('should create and return region-scoped registry', () => {
      const registry = kernel.getMiddlewareRegistry({ region: "header" });
      expect(registry).toBeInstanceOf(MiddlewareStateRegistry);
    });

    it('should return the same region registry on multiple calls', () => {
      const registry1 = kernel.getMiddlewareRegistry({ region: "header" });
      const registry2 = kernel.getMiddlewareRegistry({ region: "header" });
      expect(registry1).toBe(registry2);
    });

    it('should create different registries for different regions', () => {
      const headerRegistry = kernel.getMiddlewareRegistry({ region: "header" });
      const sidebarRegistry = kernel.getMiddlewareRegistry({ region: "sidebar" });
      expect(headerRegistry).not.toBe(sidebarRegistry);
    });

    it('should create region registry as child of global registry', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "content" });

      expect(regionRegistry.getParent()).toBe(globalRegistry);
    });
  });

  describe('Hierarchical state sharing', () => {
    it('should allow region to access global state', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "main" });

      // Provide state in global scope
      globalRegistry.provide("theme", { mode: "dark" });

      // Access from region scope
      const state = regionRegistry.lookup<{ mode: string }>("theme");
      expect(state).toBeDefined();
      expect(state?.get()).toEqual({ mode: "dark" });
    });

    it('should allow region to override global state', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "sidebar" });

      // Provide state in both scopes
      globalRegistry.provide("theme", { mode: "dark" });
      regionRegistry.provide("theme", { mode: "light" });

      // Region lookup should get local override
      const regionState = regionRegistry.lookup<{ mode: string }>("theme");
      expect(regionState?.get()).toEqual({ mode: "light" });

      // Global lookup should still get global state
      const globalState = globalRegistry.lookup<{ mode: string }>("theme");
      expect(globalState?.get()).toEqual({ mode: "dark" });
    });

    it('should allow different regions to have independent state', () => {
      const headerRegistry = kernel.getMiddlewareRegistry({ region: "header" });
      const footerRegistry = kernel.getMiddlewareRegistry({ region: "footer" });

      // Provide different state in each region
      headerRegistry.provide("visible", true);
      footerRegistry.provide("visible", false);

      // Each region should have its own state
      expect(headerRegistry.lookup<boolean>("visible")?.get()).toBe(true);
      expect(footerRegistry.lookup<boolean>("visible")?.get()).toBe(false);
    });
  });

  describe('Observable state reactivity', () => {
    it('should support reactive updates in global scope', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const state = globalRegistry.provide("counter", 0);

      let updateCount = 0;
      let lastValue = 0;

      state.subscribe((value) => {
        updateCount++;
        lastValue = value;
      });

      expect(updateCount).toBe(1); // Initial call
      expect(lastValue).toBe(0);

      state.set(5);
      expect(updateCount).toBe(2);
      expect(lastValue).toBe(5);
    });

    it('should support reactive updates in region scope', () => {
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "main" });
      const state = regionRegistry.provide("data", { items: [] });

      let updateCount = 0;

      state.subscribe(() => {
        updateCount++;
      });

      state.update(current => ({ ...current, items: [1, 2, 3] }));
      expect(updateCount).toBe(2); // Initial + update
      expect(state.get().items).toEqual([1, 2, 3]);
    });

    it('should allow cross-region observation of global state', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const region1Registry = kernel.getMiddlewareRegistry({ region: "region1" });
      const region2Registry = kernel.getMiddlewareRegistry({ region: "region2" });

      // Provide global state
      const state = globalRegistry.provide("sharedData", "initial");

      let region1Updates = 0;
      let region2Updates = 0;

      // Both regions observe the same global state
      region1Registry.lookup<string>("sharedData")?.subscribe(() => {
        region1Updates++;
      });

      region2Registry.lookup<string>("sharedData")?.subscribe(() => {
        region2Updates++;
      });

      // Update global state
      state.set("updated");

      // Both regions should receive updates
      expect(region1Updates).toBe(2); // Initial + update
      expect(region2Updates).toBe(2); // Initial + update
    });
  });

  describe('Late-join discovery', () => {
    it('should support waitFor in region scope', async () => {
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "async" });

      // Start waiting before state is provided
      const waitPromise = regionRegistry.waitFor<string>("asyncData", 1000);

      // Provide state after a delay
      setTimeout(() => {
        regionRegistry.provide("asyncData", "loaded");
      }, 10);

      const state = await waitPromise;
      expect(state.get()).toBe("loaded");
    });

    it('should resolve waitFor immediately if state exists', async () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      globalRegistry.provide("existing", "value");

      const state = await globalRegistry.waitFor<string>("existing");
      expect(state.get()).toBe("value");
    });

    it('should timeout if state is never provided', async () => {
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "timeout" });

      await expect(
        regionRegistry.waitFor<string>("nonexistent", 50)
      ).rejects.toThrow("Timeout waiting for state: nonexistent");
    });
  });

  describe('State cleanup', () => {
    it('should clean up region registry without affecting global', () => {
      const globalRegistry = kernel.getMiddlewareRegistry("global");
      const regionRegistry = kernel.getMiddlewareRegistry({ region: "cleanup" });

      globalRegistry.provide("global", "data");
      regionRegistry.provide("local", "data");

      // Clear region registry
      regionRegistry.clear();

      // Region state should be gone
      expect(regionRegistry.lookup("local")).toBeUndefined();

      // Global state should remain
      expect(globalRegistry.lookup("global")).toBeDefined();
    });

    it('should remove specific state from registry', () => {
      const registry = kernel.getMiddlewareRegistry({ region: "remove" });

      registry.provide("state1", "value1");
      registry.provide("state2", "value2");

      expect(registry.remove("state1")).toBe(true);
      expect(registry.lookup("state1")).toBeUndefined();
      expect(registry.lookup("state2")).toBeDefined();
    });
  });

  describe('Multiple kernel instances', () => {
    it('should maintain separate registries per kernel instance', () => {
      const kernel1 = new TestKernel();
      const kernel2 = new TestKernel();

      const registry1 = kernel1.getMiddlewareRegistry("global");
      const registry2 = kernel2.getMiddlewareRegistry("global");

      registry1.provide("data", "kernel1");
      registry2.provide("data", "kernel2");

      expect(registry1.lookup<string>("data")?.get()).toBe("kernel1");
      expect(registry2.lookup<string>("data")?.get()).toBe("kernel2");
    });

    it('should maintain separate region registries per kernel instance', () => {
      const kernel1 = new TestKernel();
      const kernel2 = new TestKernel();

      const region1 = kernel1.getMiddlewareRegistry({ region: "test" });
      const region2 = kernel2.getMiddlewareRegistry({ region: "test" });

      expect(region1).not.toBe(region2);
    });
  });
});
