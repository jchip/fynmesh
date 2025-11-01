import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { 
  createMockMiddleware, 
  createMockMiddlewareReg 
} from "./fixtures/mock-middleware";

describe("Middleware Execution", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
    vi.clearAllMocks();
  });

  describe("callMiddlewares", () => {
    it("should call middleware setup and apply in sequence", async () => {
      const setupOrder: string[] = [];
      const applyOrder: string[] = [];
      
      const mw1 = createMockMiddlewareReg({
        middleware: createMockMiddleware({ name: "mw1" })
      });
      mw1.middleware.setup = vi.fn(async () => {
        setupOrder.push("mw1");
        return { status: "ready" };
      });
      mw1.middleware.apply = vi.fn(async () => {
        applyOrder.push("mw1");
      });
      
      const mw2 = createMockMiddlewareReg({
        middleware: createMockMiddleware({ name: "mw2" })
      });
      mw2.middleware.setup = vi.fn(async () => {
        setupOrder.push("mw2");
        return { status: "ready" };
      });
      mw2.middleware.apply = vi.fn(async () => {
        applyOrder.push("mw2");
      });
      
      const fynApp = createMockFynApp({ name: "test-app", version: "1.0.0" });
      
      const fynMod = {}; // Simple module without initialize/execute
      
      const ccs = [
        { 
          reg: { fullKey: "mw1-key", middleware: mw1.middleware, regKey: "test::mw1" },
          mwReg: mw1,
          runtime: {},
          fynApp,
          fynMod,
          module: {}, 
          config: {} 
        },
        { 
          reg: { fullKey: "mw2-key", middleware: mw2.middleware, regKey: "test::mw2" },
          mwReg: mw2,
          runtime: {},
          fynApp,
          fynMod,
          module: {}, 
          config: {} 
        }
      ];
      
      await kernel.testCallMiddlewares(ccs);
      
      expect(setupOrder).toEqual(["mw1", "mw2"]);
      expect(applyOrder).toEqual(["mw1", "mw2"]);
    });

    it("should handle defer status and retry", async () => {
      let setupCallCount = 0;
      const mwReg = createMockMiddlewareReg();
      mwReg.middleware.setup = vi.fn(async () => {
        setupCallCount++;
        // Return defer first, then ready on second call
        return { status: setupCallCount === 1 ? "defer" : "ready" };
      });
      mwReg.middleware.apply = vi.fn(async () => {});
      
      // Mock checkMiddlewareReady to return "ready" so defer becomes retry
      const originalCheck = (kernel as any).checkMiddlewareReady;
      (kernel as any).checkMiddlewareReady = vi.fn().mockReturnValue("ready");
      
      const fynApp = createMockFynApp({ name: "test-app", version: "1.0.0" });
      
      const fynMod = {}; // Simple module without initialize/execute
      
      const ccs = [{
        reg: { fullKey: "test-mw", middleware: mwReg.middleware, regKey: mwReg.regKey },
        mwReg, 
        runtime: {},
        fynApp,
        fynMod,
        module: {}, 
        config: {} 
      }];
      
      try {
        await kernel.testCallMiddlewares(ccs);
        
        expect(mwReg.middleware.setup).toHaveBeenCalledTimes(2);
        expect(mwReg.middleware.apply).toHaveBeenCalled();
      } finally {
        (kernel as any).checkMiddlewareReady = originalCheck;
      }
    });

    it("should throw after max retries", async () => {
      const mwReg = createMockMiddlewareReg();
      mwReg.middleware.setup = vi.fn(async () => ({ status: "defer" }));
      
      // Mock checkMiddlewareReady to always return "ready" (forcing retry)
      const originalCheck = (kernel as any).checkMiddlewareReady;
      (kernel as any).checkMiddlewareReady = vi.fn().mockReturnValue("ready");
      
      const fynApp = createMockFynApp({ name: "test-app", version: "1.0.0" });
      
      const fynMod = {}; // Simple module without initialize/execute
      
      const ccs = [{
        reg: { fullKey: "defer-mw", middleware: mwReg.middleware, regKey: mwReg.regKey },
        mwReg,
        runtime: {},
        fynApp,
        fynMod,
        module: {}, 
        config: {} 
      }];
      
      try {
        await expect(kernel.testCallMiddlewares(ccs)).rejects.toThrow(
          "Middleware setup failed after 2 tries"
        );
        expect(mwReg.middleware.setup).toHaveBeenCalledTimes(2);
      } finally {
        (kernel as any).checkMiddlewareReady = originalCheck;
      }
    });

    it("should call apply even with skip status", async () => {
      // Note: The implementation still calls apply even for skip status
      const mwReg = createMockMiddlewareReg();
      mwReg.middleware.setup = vi.fn(async () => ({ status: "skip" }));
      mwReg.middleware.apply = vi.fn();
      
      const fynApp = createMockFynApp({ name: "test-app", version: "1.0.0" });
      
      const fynMod = {}; // Simple module without initialize/execute
      
      const ccs = [{
        reg: { fullKey: "skip-mw", middleware: mwReg.middleware, regKey: mwReg.regKey },
        mwReg,
        runtime: {},
        fynApp,
        fynMod,
        module: {}, 
        config: {} 
      }];
      
      await kernel.testCallMiddlewares(ccs);
      
      expect(mwReg.middleware.setup).toHaveBeenCalled();
      // The implementation actually calls apply even for skip status
      expect(mwReg.middleware.apply).toHaveBeenCalled();
    });
  });

  describe("checkMiddlewareReady", () => {
    it("should return ready when all middlewares are ready", () => {
      // Mark middlewares as ready in the middlewareReady map
      (kernel as any).middlewareReady.set("mw1", {});
      (kernel as any).middlewareReady.set("mw2", {});
      (kernel as any).middlewareReady.set("mw3", {}); // Need to mark mw3 as ready too
      
      const ccs = [
        { reg: { fullKey: "mw1" }, runtime: {}, mwReg: { regKey: "mw1" }, status: undefined },
        { reg: { fullKey: "mw2" }, runtime: {}, mwReg: { regKey: "mw2" }, status: undefined },
        { reg: { fullKey: "mw3" }, runtime: {}, mwReg: { regKey: "mw3" }, status: undefined }
      ];
      
      const result = kernel.testCheckMiddlewareReady(ccs);
      expect(result).toBe("ready");
    });

    it("should return defer when any middleware is defer", () => {
      // Mark some middlewares as ready
      (kernel as any).middlewareReady.set("mw1", {});
      (kernel as any).middlewareReady.set("mw3", {});
      // mw2 is not ready
      
      const ccs = [
        { reg: { fullKey: "mw1" }, runtime: {}, mwReg: { regKey: "mw1" }, status: undefined },
        { reg: { fullKey: "mw2" }, runtime: {}, mwReg: { regKey: "mw2" }, status: undefined },
        { reg: { fullKey: "mw3" }, runtime: {}, mwReg: { regKey: "mw3" }, status: undefined }
      ];
      
      const result = kernel.testCheckMiddlewareReady(ccs);
      expect(result).toBe("defer");
    });

    it("should handle empty array", () => {
      const ccs: any[] = [];
      const result = kernel.testCheckMiddlewareReady(ccs);
      expect(result).toBe("ready");
    });
  });

  describe("checkDeferCalls", () => {
    it("should return retry when status changed from defer to ready", () => {
      // Mark all middlewares as ready
      (kernel as any).middlewareReady.set("mw1", {});
      (kernel as any).middlewareReady.set("mw2", {});
      
      const ccs = [
        { reg: { fullKey: "mw1" }, runtime: {}, mwReg: { regKey: "mw1" }, status: undefined },
        { reg: { fullKey: "mw2" }, runtime: {}, mwReg: { regKey: "mw2" }, status: undefined }
      ];
      
      // Was defer, now ready = retry
      const result = kernel.testCheckDeferCalls("defer", ccs);
      expect(result).toBe("retry");
    });

    it("should return defer when still deferred", () => {
      // Mark only mw1 as ready, mw2 not ready
      (kernel as any).middlewareReady.set("mw1", {});
      
      const ccs = [
        { reg: { fullKey: "mw1" }, runtime: {}, mwReg: { regKey: "mw1" }, status: undefined },
        { reg: { fullKey: "mw2" }, runtime: {}, mwReg: { regKey: "mw2" }, status: undefined }
      ];
      
      // Was defer, still has defer = defer
      const result = kernel.testCheckDeferCalls("defer", ccs);
      expect(result).toBe("defer");
    });

    it("should return original status when not defer", () => {
      const ccs = [
        { reg: { fullKey: "mw1" }, runtime: {}, mwReg: { regKey: "mw1" }, status: "ready" }
      ];
      
      // Was ready, stays ready
      const result = kernel.testCheckDeferCalls("ready", ccs);
      expect(result).toBe("ready");
    });
  });

  describe("checkSingleMiddlewareReady", () => {
    it("should mark ready when middleware is registered", () => {
      // Mark middleware as ready in the map
      (kernel as any).middlewareReady.set("test-app@1.0.0::test-middleware", {});
      
      const cc = { 
        reg: { fullKey: "test-app@1.0.0::test-middleware" },
        runtime: {} as any,
        status: undefined as any
      };
      
      const result = kernel.testCheckSingleMiddlewareReady(cc);
      
      expect(result).toBe(true);
      expect(cc.status).toBe("ready");
    });

    it("should not mark ready when middleware not found", () => {
      const cc = { 
        reg: { fullKey: "unknown::unknown-middleware" },
        runtime: {} as any,
        status: undefined as any
      };
      
      const result = kernel.testCheckSingleMiddlewareReady(cc);
      
      expect(result).toBe(false);
      expect(cc.status).toBeUndefined();
    });

    it("should update runtime share when middleware ready", () => {
      const shareData = { someData: "value" };
      (kernel as any).middlewareReady.set("test-app::test-middleware", shareData);
      
      const cc = { 
        reg: { fullKey: "test-app::test-middleware" },
        runtime: {} as any,
        status: undefined as any
      };
      
      const result = kernel.testCheckSingleMiddlewareReady(cc);
      
      expect(result).toBe(true);
      expect(cc.runtime.share).toBe(shareData);
      expect(cc.status).toBe("ready");
    });
  });
});
