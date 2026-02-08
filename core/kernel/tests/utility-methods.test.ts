import { describe, it, expect, beforeEach } from "vitest";
import { getTargetMiddlewares, isFynAppMiddlewareProvider, MIDDLEWARE_EXPOSE_PREFIX, MIDDLEWARE_EXPORT_PREFIX } from "../src/util";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";

describe("Utility Methods", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  describe("cleanContainerName", () => {
    it("should replace special characters with underscores", () => {
      expect(kernel.testCleanContainerName("@scope/package-name")).toBe("scope_package_name");
      expect(kernel.testCleanContainerName("package.name")).toBe("package_name");
      expect(kernel.testCleanContainerName("package-name")).toBe("package_name");
      expect(kernel.testCleanContainerName("package/name")).toBe("package_name");
    });

    it("should remove leading underscores", () => {
      expect(kernel.testCleanContainerName("___package")).toBe("package");
      expect(kernel.testCleanContainerName("_@scope/name")).toBe("scope_name");
    });

    it("should handle already clean names", () => {
      expect(kernel.testCleanContainerName("packagename")).toBe("packagename");
      expect(kernel.testCleanContainerName("package_name")).toBe("package_name");
    });
  });

  describe("buildFynAppUrl", () => {
    it("should build URL with default entry file", () => {
      const url = kernel.testBuildFynAppUrl("https://example.com/app/");
      expect(url).toBe("https://example.com/app/fynapp-entry.js");
    });

    it("should build URL with custom entry file", () => {
      const url = kernel.testBuildFynAppUrl("https://example.com/app/", "custom-entry.js");
      expect(url).toBe("https://example.com/app/custom-entry.js");
    });

    it("should handle base URL without trailing slash", () => {
      const url = kernel.testBuildFynAppUrl("https://example.com/app");
      expect(url).toBe("https://example.com/app/fynapp-entry.js");
    });

    it("should handle relative paths", () => {
      const url = kernel.testBuildFynAppUrl("/app/dist/");
      expect(url).toBe("/app/dist/fynapp-entry.js");
    });
  });

  describe("createFynModuleRuntime", () => {
    it("should create runtime with fynApp reference and empty middleware context", () => {
      const fynApp = createMockFynApp({ name: "test-app" });
      const runtime = kernel.testCreateFynModuleRuntime(fynApp);

      expect(runtime.fynApp).toBe(fynApp);
      expect(runtime.middlewareContext).toBeInstanceOf(Map);
      expect(runtime.middlewareContext.size).toBe(0);
    });

    it("should create independent runtime instances", () => {
      const fynApp1 = createMockFynApp({ name: "app1" });
      const fynApp2 = createMockFynApp({ name: "app2" });

      const runtime1 = kernel.testCreateFynModuleRuntime(fynApp1);
      const runtime2 = kernel.testCreateFynModuleRuntime(fynApp2);

      expect(runtime1.fynApp).not.toBe(runtime2.fynApp);
      expect(runtime1.middlewareContext).not.toBe(runtime2.middlewareContext);

      // Modifying one should not affect the other
      runtime1.middlewareContext.set("key", { value: "test" });
      expect(runtime2.middlewareContext.has("key")).toBe(false);
    });
  });

  describe("getTargetMiddlewares", () => {
    it("should return empty array when autoApplyMiddlewares is undefined", () => {
      const fynApp = createMockFynApp();
      const result = getTargetMiddlewares(fynApp, undefined);
      expect(result).toEqual([]);
    });

    it("should return fynapp list for non-middleware-provider FynApps", () => {
      const fynApp = createMockFynApp({ exposes: {} });
      const fynappList = [{ regKey: "mw1" }] as any;
      const middlewareList = [{ regKey: "mw2" }] as any;
      const result = getTargetMiddlewares(fynApp, { fynapp: fynappList, middleware: middlewareList });
      expect(result).toBe(fynappList);
    });

    it("should return middleware list for middleware-provider FynApps", () => {
      const fynApp = createMockFynApp({ exposes: { "./middleware/test": {} } as any });
      const fynappList = [{ regKey: "mw1" }] as any;
      const middlewareList = [{ regKey: "mw2" }] as any;
      const result = getTargetMiddlewares(fynApp, { fynapp: fynappList, middleware: middlewareList });
      expect(result).toBe(middlewareList);
    });
  });

  describe("isFynAppMiddlewareProvider", () => {
    it("should return true when FynApp exposes middleware modules", () => {
      const fynApp = createMockFynApp({ exposes: { "./middleware/test": {} } as any });
      expect(isFynAppMiddlewareProvider(fynApp)).toBe(true);
    });

    it("should return false when FynApp has no middleware exposes", () => {
      const fynApp = createMockFynApp({ exposes: { "./main": {} } as any });
      expect(isFynAppMiddlewareProvider(fynApp)).toBe(false);
    });

    it("should return false when FynApp has empty exposes", () => {
      const fynApp = createMockFynApp({ exposes: {} });
      expect(isFynAppMiddlewareProvider(fynApp)).toBe(false);
    });
  });

  describe("constants", () => {
    it("should define MIDDLEWARE_EXPOSE_PREFIX", () => {
      expect(MIDDLEWARE_EXPOSE_PREFIX).toBe("./middleware");
    });

    it("should define MIDDLEWARE_EXPORT_PREFIX", () => {
      expect(MIDDLEWARE_EXPORT_PREFIX).toBe("__middleware__");
    });
  });
});
