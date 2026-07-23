import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { 
  createMockMiddleware, 
  createMockMiddlewareReg 
} from "./fixtures/mock-middleware";

describe("Module Loading", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
    vi.clearAllMocks();
  });

  describe("loadFynAppBasics", () => {
    it("should create FynApp from entry and load config", async () => {
      const mockEntry = {
        container: {
          name: "test-app",
          version: "1.0.0",
          $E: {
            "./config": "./config",
            "./main": "./main"
          }
        } as any,
        init: vi.fn(),
        get: vi.fn().mockImplementation((exposeName) => {
          if (exposeName === "./config") {
            return () => ({ environment: "test", debug: true });
          }
          if (exposeName === "./main") {
            return () => ({ main: { execute: vi.fn() } });
          }
          return () => ({});
        }),
        setup: vi.fn()
      };

      const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

      expect(mockEntry.init).toHaveBeenCalled();
      expect(mockEntry.setup).toHaveBeenCalled();
      expect(fynApp.name).toBe("test-app");
      expect(fynApp.version).toBe("1.0.0");
      expect(fynApp.config).toEqual({ environment: "test", debug: true });
      expect(fynApp.exposes["./main"]).toBeDefined();
    });

    it("should handle entry without setup function", async () => {
      const mockEntry = {
        container: {
          name: "test-app",
          version: "1.0.0",
          $E: { "./main": "./main" }
        } as any,
        init: vi.fn(),
        get: vi.fn().mockImplementation(() => {
          return () => ({ main: { execute: vi.fn() } });
        })
        // No setup function
      };

      const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

      expect(mockEntry.init).toHaveBeenCalled();
      expect(fynApp.name).toBe("test-app");
      expect(fynApp.version).toBe("1.0.0");
    });

    it("should load middleware from import-exposed dependencies", async () => {
      const testMiddleware = createMockMiddleware({ name: "imported" });
      const mockEntry = {
        container: {
          name: "test-app",
          version: "1.0.0",
          $E: { "./main": "./main" },
          __FYNAPP_MANIFEST__: {
            "import-exposed": {
              "dependency-app": {
                "middleware/imported": {
                  type: "middleware"
                }
              }
            }
          }
        } as any,
        init: vi.fn(),
        get: vi.fn().mockImplementation(() => {
          return () => ({ main: { execute: vi.fn() } });
        }),
        setup: vi.fn()
      };

      // Mock the dependency app in runtime with proper container structure
      const dependencyApp = createMockFynApp({ name: "dependency-app" });
      // The implementation extracts the base path from "middleware/imported" -> "./middleware"
      dependencyApp.entry.container.$E["./middleware"] = "./middleware";
      dependencyApp.entry.get = vi.fn().mockImplementation((exposeName) => {
        if (exposeName === "./middleware") {
          return () => ({ __middleware__imported: testMiddleware });
        }
        return () => ({});
      });
      (kernel as any).runTime.appsLoaded["dependency-app"] = dependencyApp;

      const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

      // Should have loaded the dependency's middleware module  
      expect(dependencyApp.entry.get).toHaveBeenCalledWith("./middleware");
      expect(fynApp.name).toBe("test-app");
    });
  });

  describe("useMiddlewareOnFynModule", () => {
    it("should process middleware metadata in new string format", async () => {
      const testMw = createMockMiddlewareReg();
      kernel.registerMiddleware(testMw);

      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [
          "-FYNAPP_MIDDLEWARE test-app middleware/test-middleware 1.0.0"
        ]
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("ready");
    });

    it("should handle object format with middleware property", async () => {
      const testMw = createMockMiddlewareReg();
      kernel.registerMiddleware(testMw);

      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [{
          middleware: "-FYNAPP_MIDDLEWARE test-app middleware/test-middleware",
          config: { theme: "dark" }
        }]
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("ready");
    });

    it("should return empty string for modules without middleware", async () => {
      const fynApp = createMockFynApp();
      const fynModule = {
        execute: vi.fn()
        // No __middlewareMeta
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("");
    });
  });

  describe("loadMiddlewareFromDependency", () => {
    it("should load middleware module from dependency package", async () => {
      const dependencyApp = createMockFynApp({ name: "dep-app" });
      const testMiddleware = createMockMiddleware({ name: "dep-middleware" });
      
      // Need to set up the container $E property for the expose module to be found
      dependencyApp.entry.container.$E["./middleware/dep"] = "./middleware/dep";
      dependencyApp.entry.get = vi.fn().mockImplementation((exposeName) => {
        if (exposeName === "./middleware/dep") {
          return () => ({ __middleware__dep: testMiddleware });
        }
        return () => ({});
      });

      (kernel as any).runTime.appsLoaded["dep-app"] = dependencyApp;

      await kernel.testLoadMiddlewareFromDependency("dep-app", "middleware/dep/dep-middleware");

      expect(dependencyApp.entry.get).toHaveBeenCalledWith("./middleware/dep");
      
      // Check that middleware was registered
      const middlewares = (kernel as any).runTime.middlewares;
      expect(middlewares["dep-app::dep-middleware"]).toBeDefined();
    });

    it("should handle missing dependency package gracefully", async () => {
      // No dep-app in runtime
      await kernel.testLoadMiddlewareFromDependency("missing-app", "middleware/test");

      // Should not throw, just log debug message
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });
});
