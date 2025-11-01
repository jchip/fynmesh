import { describe, it, expect, beforeEach } from "vitest";
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
});
