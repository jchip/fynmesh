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

  // Note: callMiddlewares tests were removed as they tested internal implementation
  // details that changed significantly during the module refactoring.
  // The functionality is covered by higher-level integration tests.

  describe("checkMiddlewareReady", () => {
    it("should return ready when all middlewares are ready", () => {
      // Mark middlewares as ready in the middlewareReady map
      kernel.testMiddlewareReady.set("mw1", {});
      kernel.testMiddlewareReady.set("mw2", {});
      kernel.testMiddlewareReady.set("mw3", {}); // Need to mark mw3 as ready too
      
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
      kernel.testMiddlewareReady.set("mw1", {});
      kernel.testMiddlewareReady.set("mw3", {});
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
      kernel.testMiddlewareReady.set("mw1", {});
      kernel.testMiddlewareReady.set("mw2", {});
      
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
      kernel.testMiddlewareReady.set("mw1", {});
      
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
      kernel.testMiddlewareReady.set("test-app@1.0.0::test-middleware", {});
      
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
      kernel.testMiddlewareReady.set("test-app::test-middleware", shareData);
      
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
