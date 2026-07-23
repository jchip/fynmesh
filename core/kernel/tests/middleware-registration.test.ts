import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp, createMockFynAppWithMiddleware } from "./fixtures/mock-fynapp";
import { 
  createMockMiddleware, 
  createMockMiddlewareReg,
  createMockAutoApplyMiddleware 
} from "./fixtures/mock-middleware";

describe("Middleware Registration", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  describe("registerMiddleware", () => {
    it("should register middleware with correct keys", () => {
      const mwReg = createMockMiddlewareReg();
      
      kernel.registerMiddleware(mwReg);
      
      const middlewares = (kernel as any).runTime.middlewares;
      expect(middlewares[mwReg.regKey]).toBeDefined();
      expect(middlewares[mwReg.regKey][mwReg.hostFynApp.version]).toBe(mwReg);
      expect(middlewares[mwReg.regKey].default).toBe(mwReg);
    });

    it("should skip duplicate registrations", () => {
      const mwReg = createMockMiddlewareReg();
      const consoleSpy = vi.spyOn(console, "debug");
      
      kernel.registerMiddleware(mwReg);
      kernel.registerMiddleware(mwReg); // Duplicate
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("⚠️ Middleware already registered: test-app::test-middleware@1.0.0 - skipping duplicate registration")
      );
    });

    it("should set default version to first registered", () => {
      const mwReg1 = createMockMiddlewareReg({
        hostFynApp: createMockFynApp({ version: "1.0.0" })
      });
      const mwReg2 = createMockMiddlewareReg({
        regKey: mwReg1.regKey,
        hostFynApp: createMockFynApp({ version: "2.0.0" })
      });
      
      kernel.registerMiddleware(mwReg1);
      kernel.registerMiddleware(mwReg2);
      
      const middlewares = (kernel as any).runTime.middlewares;
      expect(middlewares[mwReg1.regKey].default).toBe(mwReg1);
      expect(middlewares[mwReg1.regKey]["1.0.0"]).toBe(mwReg1);
      expect(middlewares[mwReg1.regKey]["2.0.0"]).toBe(mwReg2);
    });

    it("should handle auto-apply scope: fynapp", () => {
      const middleware = createMockAutoApplyMiddleware(["fynapp"]);
      const mwReg = createMockMiddlewareReg({ middleware });
      
      kernel.registerMiddleware(mwReg);
      
      const autoApply = (kernel as any).runTime.autoApplyMiddlewares;
      expect(autoApply).toBeDefined();
      expect(autoApply.fynapp).toContain(mwReg);
      expect(autoApply.middleware).not.toContain(mwReg);
    });

    it("should handle auto-apply scope: middleware", () => {
      const middleware = createMockAutoApplyMiddleware(["middleware"]);
      const mwReg = createMockMiddlewareReg({ middleware });
      
      kernel.registerMiddleware(mwReg);
      
      const autoApply = (kernel as any).runTime.autoApplyMiddlewares;
      expect(autoApply).toBeDefined();
      expect(autoApply.middleware).toContain(mwReg);
      expect(autoApply.fynapp).not.toContain(mwReg);
    });

    it("should handle auto-apply scope: all", () => {
      const middleware = createMockAutoApplyMiddleware(["all"]);
      const mwReg = createMockMiddlewareReg({ middleware });
      
      kernel.registerMiddleware(mwReg);
      
      const autoApply = (kernel as any).runTime.autoApplyMiddlewares;
      expect(autoApply).toBeDefined();
      expect(autoApply.fynapp).toContain(mwReg);
      expect(autoApply.middleware).toContain(mwReg);
    });

    it("should handle explicit-use middleware (no autoApplyScope)", () => {
      const middleware = createMockMiddleware(); // No autoApplyScope
      const mwReg = createMockMiddlewareReg({ middleware });
      
      kernel.registerMiddleware(mwReg);
      
      const autoApply = (kernel as any).runTime.autoApplyMiddlewares;
      // Should not create autoApplyMiddlewares if none have autoApplyScope
      if (autoApply) {
        expect(autoApply.fynapp).not.toContain(mwReg);
        expect(autoApply.middleware).not.toContain(mwReg);
      }
    });
  });

  describe("getMiddleware", () => {
    it("should find middleware by name and provider", () => {
      const mwReg = createMockMiddlewareReg({
        regKey: "provider-app::middleware-name",
        middleware: createMockMiddleware({ name: "middleware-name" })
      });
      
      kernel.registerMiddleware(mwReg);
      
      const found = kernel.getMiddleware("middleware-name", "provider-app");
      expect(found).toBe(mwReg);
    });

    it("should fallback to any provider when not specified", () => {
      const mwReg = createMockMiddlewareReg({
        regKey: "some-provider::middleware-name",
        middleware: createMockMiddleware({ name: "middleware-name" })
      });
      
      kernel.registerMiddleware(mwReg);
      
      const found = kernel.getMiddleware("middleware-name");
      expect(found).toBe(mwReg);
    });

    it("should return DummyMiddlewareReg when not found", () => {
      const found = kernel.getMiddleware("non-existent");
      expect(found.regKey).toBe("");
    });
  });

  describe("loadExposeModule", () => {
    it("should load module and scan for middleware", async () => {
      const fynApp = createMockFynApp();
      const mockModule = {
        __middleware__test: createMockMiddleware({ name: "test-middleware" }),
        otherExport: "value"
      };
      
      // Mock the entry.get to return our module
      fynApp.entry.get = vi.fn().mockResolvedValue(() => mockModule);
      (fynApp.entry.container as any).$E["./main"] = {};
      
      await kernel.testLoadExposeModule(fynApp, "./main", true);
      
      expect(fynApp.exposes["./main"]).toBe(mockModule);
      
      // Check that middleware was registered
      const middlewares = (kernel as any).runTime.middlewares;
      const regKey = `${fynApp.name}::test-middleware`;
      expect(middlewares[regKey]).toBeDefined();
    });

    it("should skip already scanned modules", async () => {
      const fynApp = createMockFynApp();
      const mockModule = {
        __middleware__test: createMockMiddleware({ name: "test-middleware" }),
      };
      
      fynApp.entry.get = vi.fn().mockResolvedValue(() => mockModule);
      (fynApp.entry.container as any).$E["./main"] = {};
      
      const consoleSpy = vi.spyOn(console, "debug");
      
      // Load twice
      await kernel.testLoadExposeModule(fynApp, "./main", true);
      await kernel.testLoadExposeModule(fynApp, "./main", true);
      
      // Should skip second scan
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("⏭️  Skipping middleware scan for './main' - already scanned for"),
        expect.stringContaining("test-app"),
        expect.stringContaining("1.0.0")
      );
    });

    it("should register found middleware", async () => {
      const fynApp = createMockFynApp();
      const middleware1 = createMockMiddleware({ name: "middleware-1" });
      const middleware2 = createMockMiddleware({ name: "middleware-2" });
      
      const mockModule = {
        __middleware__first: middleware1,
        __middleware__second: middleware2,
        normalExport: "value"
      };
      
      fynApp.entry.get = vi.fn().mockResolvedValue(() => mockModule);
      (fynApp.entry.container as any).$E["./middleware/test"] = {};
      
      await kernel.testLoadExposeModule(fynApp, "./middleware/test", true);
      
      const middlewares = (kernel as any).runTime.middlewares;
      expect(middlewares[`${fynApp.name}::middleware-1`]).toBeDefined();
      expect(middlewares[`${fynApp.name}::middleware-2`]).toBeDefined();
    });

    it("should handle modules without middleware", async () => {
      const fynApp = createMockFynApp();
      const mockModule = {
        onlyNormalExports: "value",
        anotherExport: 42
      };
      
      fynApp.entry.get = vi.fn().mockResolvedValue(() => mockModule);
      (fynApp.entry.container as any).$E["./main"] = {};
      
      await kernel.testLoadExposeModule(fynApp, "./main", true);
      
      expect(fynApp.exposes["./main"]).toBe(mockModule);
      
      // No middleware should be registered
      const middlewares = (kernel as any).runTime.middlewares;
      const middlewareKeys = Object.keys(middlewares);
      expect(middlewareKeys.filter(k => k.startsWith(fynApp.name))).toHaveLength(0);
    });

    it("should not load if expose module not found", async () => {
      const fynApp = createMockFynApp();
      const consoleSpy = vi.spyOn(console, "debug");

      // No expose module in container
      delete fynApp.entry.container.$E["./main"];

      await kernel.testLoadExposeModule(fynApp, "./main", true);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("❌ No expose module")
      );
      expect(fynApp.exposes["./main"]).toBeUndefined();
    });
  });
});
