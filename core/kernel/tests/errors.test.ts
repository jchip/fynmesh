import { describe, it, expect } from "vitest";
import {
  KernelError,
  KernelErrorCode,
  ModuleLoadError,
  MiddlewareError,
  BootstrapError,
  ManifestError,
  FederationError,
  Result,
  ok,
  err,
  isError,
  isOk,
  unwrap,
  unwrapOr,
} from "../src/errors.ts";

describe("KernelError", () => {
  describe("KernelError base class", () => {
    it("should create error with code and message", () => {
      const error = new KernelError(
        KernelErrorCode.MODULE_NOT_FOUND,
        "Module not found"
      );

      expect(error.code).toBe(KernelErrorCode.MODULE_NOT_FOUND);
      expect(error.message).toBe("Module not found");
      expect(error.name).toBe("KernelError");
    });

    it("should include context in error", () => {
      const error = new KernelError(
        KernelErrorCode.MODULE_NOT_FOUND,
        "Module not found",
        { context: { moduleName: "test-module" } }
      );

      expect(error.context).toEqual({ moduleName: "test-module" });
    });

    it("should include cause in error", () => {
      const cause = new Error("Original error");
      const error = new KernelError(
        KernelErrorCode.MODULE_NOT_FOUND,
        "Module not found",
        { cause }
      );

      expect(error.cause).toBe(cause);
    });

    it("should format detailed string", () => {
      const cause = new Error("Original error");
      const error = new KernelError(
        KernelErrorCode.MODULE_NOT_FOUND,
        "Module not found",
        {
          context: { moduleName: "test-module" },
          cause,
        }
      );

      const detailed = error.toDetailedString();
      expect(detailed).toContain("[KernelError:1001]");
      expect(detailed).toContain("Module not found");
      expect(detailed).toContain("test-module");
      expect(detailed).toContain("Original error");
    });
  });

  describe("ModuleLoadError", () => {
    it("should create with fynApp context", () => {
      const error = new ModuleLoadError(
        KernelErrorCode.EXPOSE_MODULE_NOT_FOUND,
        "Expose module not found",
        {
          fynAppName: "my-app",
          fynAppVersion: "1.0.0",
          exposeName: "./main",
        }
      );

      expect(error.name).toBe("ModuleLoadError");
      expect(error.code).toBe(KernelErrorCode.EXPOSE_MODULE_NOT_FOUND);
      expect(error.context?.fynAppName).toBe("my-app");
      expect(error.context?.fynAppVersion).toBe("1.0.0");
      expect(error.context?.exposeName).toBe("./main");
    });
  });

  describe("MiddlewareError", () => {
    it("should create with middleware context", () => {
      const error = new MiddlewareError(
        KernelErrorCode.MIDDLEWARE_SETUP_FAILED,
        "Middleware setup failed",
        {
          middlewareName: "design-tokens",
          provider: "provider-app",
          fynAppName: "consumer-app",
        }
      );

      expect(error.name).toBe("MiddlewareError");
      expect(error.code).toBe(KernelErrorCode.MIDDLEWARE_SETUP_FAILED);
      expect(error.context?.middlewareName).toBe("design-tokens");
      expect(error.context?.provider).toBe("provider-app");
      expect(error.context?.fynAppName).toBe("consumer-app");
    });
  });

  describe("BootstrapError", () => {
    it("should create with bootstrap context", () => {
      const error = new BootstrapError(
        KernelErrorCode.BOOTSTRAP_FAILED,
        "Bootstrap failed",
        {
          fynAppName: "my-app",
          phase: "middleware-loading",
        }
      );

      expect(error.name).toBe("BootstrapError");
      expect(error.code).toBe(KernelErrorCode.BOOTSTRAP_FAILED);
      expect(error.context?.fynAppName).toBe("my-app");
      expect(error.context?.phase).toBe("middleware-loading");
    });
  });

  describe("ManifestError", () => {
    it("should create with manifest context", () => {
      const error = new ManifestError(
        KernelErrorCode.MANIFEST_FETCH_FAILED,
        "Failed to fetch manifest",
        {
          manifestUrl: "http://example.com/manifest.json",
          packageName: "my-package",
        }
      );

      expect(error.name).toBe("ManifestError");
      expect(error.code).toBe(KernelErrorCode.MANIFEST_FETCH_FAILED);
      expect(error.context?.manifestUrl).toBe("http://example.com/manifest.json");
      expect(error.context?.packageName).toBe("my-package");
    });
  });

  describe("FederationError", () => {
    it("should create with federation context", () => {
      const error = new FederationError(
        KernelErrorCode.FEDERATION_NOT_LOADED,
        "Federation.js not loaded",
        {
          entryUrl: "http://example.com/entry.js",
        }
      );

      expect(error.name).toBe("FederationError");
      expect(error.code).toBe(KernelErrorCode.FEDERATION_NOT_LOADED);
      expect(error.context?.entryUrl).toBe("http://example.com/entry.js");
    });
  });

  describe("Result type helpers", () => {
    it("ok() should create success result", () => {
      const result = ok("value");

      expect(result.success).toBe(true);
      expect(isOk(result)).toBe(true);
      expect(isError(result)).toBe(false);
      if (result.success) {
        expect(result.value).toBe("value");
      }
    });

    it("err() should create error result", () => {
      const error = new KernelError(KernelErrorCode.MODULE_NOT_FOUND, "Not found");
      const result = err(error);

      expect(result.success).toBe(false);
      expect(isOk(result)).toBe(false);
      expect(isError(result)).toBe(true);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });

    it("unwrap() should return value for success", () => {
      const result = ok("value");
      expect(unwrap(result)).toBe("value");
    });

    it("unwrap() should throw for error", () => {
      const error = new KernelError(KernelErrorCode.MODULE_NOT_FOUND, "Not found");
      const result = err(error);
      expect(() => unwrap(result)).toThrow(error);
    });

    it("unwrapOr() should return value for success", () => {
      const result = ok("value");
      expect(unwrapOr(result, "default")).toBe("value");
    });

    it("unwrapOr() should return default for error", () => {
      const error = new KernelError(KernelErrorCode.MODULE_NOT_FOUND, "Not found");
      const result = err(error);
      expect(unwrapOr(result, "default")).toBe("default");
    });
  });

  describe("Error code values", () => {
    it("should have correct code ranges", () => {
      // Module errors: 1xxx
      expect(KernelErrorCode.MODULE_NOT_FOUND).toBe(1001);
      expect(KernelErrorCode.MODULE_LOAD_FAILED).toBe(1002);
      expect(KernelErrorCode.EXPOSE_MODULE_NOT_FOUND).toBe(1003);
      expect(KernelErrorCode.DEPENDENCY_NOT_FOUND).toBe(1004);

      // Middleware errors: 2xxx
      expect(KernelErrorCode.MIDDLEWARE_NOT_FOUND).toBe(2001);
      expect(KernelErrorCode.MIDDLEWARE_SETUP_FAILED).toBe(2002);
      expect(KernelErrorCode.MIDDLEWARE_APPLY_FAILED).toBe(2003);
      expect(KernelErrorCode.MIDDLEWARE_FILTER_ERROR).toBe(2004);

      // Bootstrap errors: 3xxx
      expect(KernelErrorCode.BOOTSTRAP_FAILED).toBe(3001);
      expect(KernelErrorCode.REGISTRY_RESOLVER_MISSING).toBe(3002);

      // Manifest errors: 4xxx
      expect(KernelErrorCode.MANIFEST_FETCH_FAILED).toBe(4001);
      expect(KernelErrorCode.MANIFEST_PARSE_FAILED).toBe(4002);

      // Federation errors: 5xxx
      expect(KernelErrorCode.FEDERATION_NOT_LOADED).toBe(5001);
      expect(KernelErrorCode.FEDERATION_ENTRY_FAILED).toBe(5002);
    });
  });
});
