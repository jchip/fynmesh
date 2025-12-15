import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { 
  createMockMiddleware, 
  createMockMiddlewareReg 
} from "./fixtures/mock-middleware";

describe("Bootstrap Coordination", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
    vi.clearAllMocks();
  });

  describe("bootstrapFynApp", () => {
    it("should serialize bootstraps (one at a time)", async () => {
      const fynApp1 = createMockFynApp({ name: "app1" });
      const fynApp2 = createMockFynApp({ name: "app2" });
      
      // Mock main modules
      fynApp1.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any 
      };
      fynApp2.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any 
      };
      
      // Start two bootstraps concurrently
      const bootstrap1 = kernel.bootstrapFynApp(fynApp1);
      const bootstrap2 = kernel.bootstrapFynApp(fynApp2);
      
      // app1 should be bootstrapping, app2 should be deferred
      expect(kernel.testBootstrappingApp).toBe("app1");
      expect(kernel.testDeferredBootstraps).toHaveLength(1);
      
      await bootstrap1;
      await bootstrap2;
      
      expect((fynApp1.exposes["./main"] as any).main.execute).toHaveBeenCalled();
      expect((fynApp2.exposes["./main"] as any).main.execute).toHaveBeenCalled();
    });

    it("should defer when another app is bootstrapping", async () => {
      const fynApp1 = createMockFynApp({ name: "app1" });
      const fynApp2 = createMockFynApp({ name: "app2" });
      
      fynApp1.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any
      };
      fynApp2.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any
      };
      
      // Set app1 as currently bootstrapping
      kernel.testBootstrappingApp = "app1";
      
      // Try to bootstrap app2
      const bootstrapPromise = kernel.bootstrapFynApp(fynApp2);
      
      // app2 should be deferred
      expect(kernel.testDeferredBootstraps).toHaveLength(1);
      expect(kernel.testDeferredBootstraps[0].fynApp.name).toBe("app2");
      
      // Simulate app1 finishing
      await kernel.emitAsync(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "app1", version: "1.0.0" }
      }));
      
      await bootstrapPromise;
      expect((fynApp2.exposes["./main"] as any).main.execute).toHaveBeenCalled();
    });

    it("should defer when dependencies not satisfied", async () => {
      const providerApp = createMockFynApp({ name: "provider-app" });
      const consumerApp = createMockFynApp({ name: "consumer-app" });
      
      // Setup provider/consumer relationship
      kernel.testFynAppProviderModes.set("provider-app", new Map([
        ["test-middleware", "provider"]
      ]));
      kernel.testFynAppProviderModes.set("consumer-app", new Map([
        ["test-middleware", "consumer"]
      ]));
      
      consumerApp.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any
      };
      
      // Try to bootstrap consumer before provider
      const bootstrapPromise = kernel.bootstrapFynApp(consumerApp);
      
      // Should be deferred
      expect(kernel.testDeferredBootstraps).toHaveLength(1);
      
      // Mark provider as bootstrapped
      kernel.testFynAppBootstrapStatus.set("provider-app", "bootstrapped");
      await kernel.emitAsync(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "provider-app", version: "1.0.0" }
      }));
      
      await bootstrapPromise;
      expect((consumerApp.exposes["./main"] as any).main.execute).toHaveBeenCalled();
    });

    it("should resume deferred bootstraps when a bootstrap fails", async () => {
      const fynApp1 = createMockFynApp({ name: "app1" });
      const fynApp2 = createMockFynApp({ name: "app2" });

      // app1 fails during execute
      fynApp1.exposes["./main"] = {
        main: {
          execute: vi.fn(() => {
            throw new Error("boom");
          }),
        } as any,
      };

      // app2 should still bootstrap after app1 fails
      fynApp2.exposes["./main"] = {
        main: {
          execute: vi.fn(),
        } as any,
      };

      const bootstrap1 = kernel.bootstrapFynApp(fynApp1);
      const bootstrap2 = kernel.bootstrapFynApp(fynApp2);

      expect(kernel.testBootstrappingApp).toBe("app1");
      expect(kernel.testDeferredBootstraps).toHaveLength(1);

      await bootstrap1;
      await bootstrap2;

      expect((fynApp2.exposes["./main"] as any).main.execute).toHaveBeenCalled();
    });

    it("should emit FYNAPP_BOOTSTRAPPED event", async () => {
      const fynApp = createMockFynApp({ name: "test-app" });
      fynApp.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any
      };
      
      const eventSpy = vi.fn();
      kernel.events.addEventListener("FYNAPP_BOOTSTRAPPED", eventSpy);
      
      await kernel.bootstrapFynApp(fynApp);
      
      expect(eventSpy).toHaveBeenCalled();
      const event = eventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.detail.name).toBe("test-app");
    });

    it("should handle bootstrap errors gracefully", async () => {
      const fynApp = createMockFynApp({ name: "error-app" });
      const errorMessage = "Bootstrap failed!";
      
      // Mock main module that throws
      fynApp.exposes["./main"] = { 
        main: {
          execute: vi.fn().mockRejectedValue(new Error(errorMessage))
        } as any
      };

      const failSpy = vi.fn();
      kernel.events.addEventListener("FYNAPP_BOOTSTRAP_FAILED", failSpy);

      // Kernel isolates failures and does not rethrow from bootstrapFynApp
      await kernel.bootstrapFynApp(fynApp);

      expect(failSpy).toHaveBeenCalled();
      expect(kernel.testBootstrappingApp).toBeNull();
    });

    it("should clear bootstrap lock on error", async () => {
      const fynApp1 = createMockFynApp({ name: "error-app" });
      const fynApp2 = createMockFynApp({ name: "next-app" });
      
      fynApp1.exposes["./main"] = { 
        main: {
          execute: vi.fn().mockRejectedValue(new Error("Failed"))
        } as any
      };
      fynApp2.exposes["./main"] = { 
        main: {
          execute: vi.fn()
        } as any
      };
      
      // Start bootstrap that will fail
      const bootstrap1 = kernel.bootstrapFynApp(fynApp1);
      
      // Queue another bootstrap
      const bootstrap2 = kernel.bootstrapFynApp(fynApp2);
      
      // First should not throw (kernel isolates errors)
      await bootstrap1;
      
      // Lock should be cleared
      expect(kernel.testBootstrappingApp).toBeNull();
      
      // Second should proceed
      await bootstrap2;
      expect((fynApp2.exposes["./main"] as any).main.execute).toHaveBeenCalled();
    });
  });

  describe("areBootstrapDependenciesSatisfied", () => {
    it("should return true when no provider/consumer info", () => {
      const fynApp = createMockFynApp({ name: "app" });
      
      const result = kernel.testAreBootstrapDependenciesSatisfied(fynApp);
      
      expect(result).toBe(true);
    });

    it("should wait for provider apps to bootstrap first", () => {
      const consumerApp = createMockFynApp({ name: "consumer" });
      
      // Set consumer mode for middleware
      kernel.testFynAppProviderModes.set("consumer", new Map([
        ["test-middleware", "consumer"]
      ]));
      
      // Set provider mode for another app
      kernel.testFynAppProviderModes.set("provider", new Map([
        ["test-middleware", "provider"]
      ]));
      
      // Provider not bootstrapped yet
      const result = kernel.testAreBootstrapDependenciesSatisfied(consumerApp);
      
      expect(result).toBe(false);
    });

    it("should allow bootstrap when all providers ready", () => {
      const consumerApp = createMockFynApp({ name: "consumer" });
      
      // Set consumer mode
      kernel.testFynAppProviderModes.set("consumer", new Map([
        ["test-middleware", "consumer"]
      ]));
      
      // Set provider mode
      kernel.testFynAppProviderModes.set("provider", new Map([
        ["test-middleware", "provider"]
      ]));
      
      // Mark provider as bootstrapped
      kernel.testFynAppBootstrapStatus.set("provider", "bootstrapped");
      
      const result = kernel.testAreBootstrapDependenciesSatisfied(consumerApp);
      
      expect(result).toBe(true);
    });
  });

  describe("findProviderForMiddleware", () => {
    it("should find provider for middleware", () => {
      // Set up provider
      kernel.testFynAppProviderModes.set("provider-app", new Map([
        ["test-middleware", "provider"]
      ]));
      
      const result = kernel.testFindProviderForMiddleware("test-middleware", "other-app");
      
      expect(result).toBe("provider-app");
    });

    it("should exclude specified fynapp", () => {
      // Set up provider
      kernel.testFynAppProviderModes.set("app1", new Map([
        ["test-middleware", "provider"]
      ]));
      
      // Should not return app1 when it's excluded
      const result = kernel.testFindProviderForMiddleware("test-middleware", "app1");
      
      expect(result).toBeNull();
    });

    it("should return null when no provider found", () => {
      // No providers set up
      const result = kernel.testFindProviderForMiddleware("unknown-middleware", "app");
      
      expect(result).toBeNull();
    });
  });
});
