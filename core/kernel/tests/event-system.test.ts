import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddlewareReg } from "./fixtures/mock-middleware";

describe("Event System", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
    vi.clearAllMocks();
  });

  describe("emitAsync", () => {
    it("should emit custom events through the event system", async () => {
      const eventHandler = vi.fn();
      kernel.events.addEventListener("TEST_EVENT", eventHandler);

      const event = new CustomEvent("TEST_EVENT", {
        detail: { data: "test" }
      });

      const result = await kernel.emitAsync(event);

      expect(eventHandler).toHaveBeenCalledWith(event);
      expect(result).toBe(true);
    });

    it("should handle MIDDLEWARE_READY events", async () => {
      const mwReg = createMockMiddlewareReg();
      const cc = {
        reg: { fullKey: "test::middleware", middleware: mwReg.middleware }
      };

      const event = new CustomEvent("MIDDLEWARE_READY", {
        detail: {
          name: "test-middleware",
          status: "ready",
          cc,
          share: { data: "shared" }
        }
      });

      await kernel.emitAsync(event);

      // Check that middleware is marked as ready
      expect(kernel.testMiddlewareReady.has("test::middleware")).toBe(true);
      expect(kernel.testMiddlewareReady.get("test::middleware")).toEqual({ data: "shared" });
    });

    it("should handle FYNAPP_BOOTSTRAPPED events", async () => {
      // Set up a deferred bootstrap
      const deferredApp = createMockFynApp({ name: "deferred-app" });
      const resolve = vi.fn();
      kernel.testDeferredBootstraps.push({ fynApp: deferredApp, resolve });

      // Mark dependencies as satisfied
      kernel.testFynAppBootstrapStatus.set("provider-app", "bootstrapped");

      const event = new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "provider-app", version: "1.0.0" }
      });

      await kernel.emitAsync(event);

      // The bootstrapping app should be cleared
      expect(kernel.testBootstrappingApp).toBeNull();
    });
  });

  describe("signalMiddlewareReady", () => {
    it("should emit MIDDLEWARE_READY event with context details", async () => {
      const eventHandler = vi.fn();
      kernel.events.addEventListener("MIDDLEWARE_READY", eventHandler);

      const cc = {
        reg: {
          fullKey: "test::middleware",
          middleware: { name: "test-middleware" }
        }
      };

      await kernel.signalMiddlewareReady(cc as any, {
        share: { theme: "dark" }
      });

      expect(eventHandler).toHaveBeenCalled();
      const emittedEvent = eventHandler.mock.calls[0][0];
      expect(emittedEvent.detail).toMatchObject({
        name: "test-middleware",
        status: "ready",
        share: { theme: "dark" },
        cc
      });
    });

    it("should use defaults when details not provided", async () => {
      const eventHandler = vi.fn();
      kernel.events.addEventListener("MIDDLEWARE_READY", eventHandler);

      const cc = {
        reg: {
          fullKey: "test::middleware",
          middleware: { name: "test-middleware" }
        }
      };

      await kernel.signalMiddlewareReady(cc as any);

      const emittedEvent = eventHandler.mock.calls[0][0];
      expect(emittedEvent.detail.name).toBe("test-middleware");
      expect(emittedEvent.detail.status).toBe("ready");
    });
  });
});
