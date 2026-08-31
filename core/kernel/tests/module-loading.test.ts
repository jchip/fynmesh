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

    it("should not re-init a container federation already initialized", async () => {
      // A re-load after shutdownFynApp hands back a live container: federation-js
      // has no teardown, so $SS survives. Calling init() again would only warn.
      const mockEntry = {
        container: {
          name: "test-app",
          version: "1.0.0",
          $SS: { "esm-react": {} },
          $E: { "./main": "./main" }
        } as any,
        init: vi.fn(),
        get: vi.fn().mockImplementation(() => {
          return () => ({ main: { execute: vi.fn() } });
        })
      };

      const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

      expect(mockEntry.init).not.toHaveBeenCalled();
      // Skipping init must not cost the app anything else
      expect(fynApp.name).toBe("test-app");
      expect(fynApp.version).toBe("1.0.0");
      expect(fynApp.exposes["./main"]).toBeDefined();
    });

    it("should init a container that has no share scope yet", async () => {
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
      };

      await kernel.testLoadFynAppBasics(mockEntry);

      expect(mockEntry.init).toHaveBeenCalledOnce();
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
      (kernel as any).runTime.apps["dependency-app"] = dependencyApp;

      const fynApp = await kernel.testLoadFynAppBasics(mockEntry);

      // Should have loaded the dependency's middleware module  
      expect(dependencyApp.entry.get).toHaveBeenCalledWith("./middleware");
      expect(fynApp.name).toBe("test-app");
    });
  });

  describe("useMiddlewareOnFynUnit", () => {
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
          mw: "-FYNAPP_MIDDLEWARE test-app middleware/test-middleware",
          config: { theme: "dark" }
        }]
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("ready");
    });

    it("throws when a declaration is a Promise rather than an id string", async () => {
      /*
       * FYM-283 - `mw: import("pkg/middleware/x/x", { with: { type:
       * "fynapp-middleware" } })` reaches the kernel as a Promise whenever the
       * build strips those import attributes, because the federation plugin
       * never rewrote the import into an id. This used to be logged at debug
       * level and dropped: no middleware ran, `execute` was never called, and
       * bootstrap still reported success, so the app just rendered nothing.
       */
      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [
          { mw: Promise.resolve({}), config: { theme: "dark" } },
        ],
      };

      await expect(
        kernel.testUseMiddlewareOnFynModule(fynModule, fynApp)
      ).rejects.toThrow(/cannot read/i);
    });

    it("names the app and the shape it got, so the build defect is findable", async () => {
      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [{ mw: Promise.resolve({}), config: {} }],
      };

      await expect(
        kernel.testUseMiddlewareOnFynModule(fynModule, fynApp)
      ).rejects.toThrow(/test-app.*mw: object.*import attributes/is);
    });

    it("throws on a declaration shape it has no branch for at all", async () => {
      const fynApp = createMockFynApp();
      const fynModule = { __middlewareMeta: [42] };

      await expect(
        kernel.testUseMiddlewareOnFynModule(fynModule, fynApp)
      ).rejects.toThrow(/cannot read/i);
    });

    it("keeps waiting when a legacy `info` names middleware not registered yet", async () => {
      // not a defect - the middleware can still arrive, so this one is not fatal
      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [{ info: { name: "not-registered-yet" } }],
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("ready");
    });

    it("keeps waiting when an id string names middleware not registered yet", async () => {
      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [
          "-FYNAPP_MIDDLEWARE other-app middleware/not-registered 1.0.0",
        ],
      };

      const result = await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);

      expect(result).toBe("ready");
    });

    it("says out loud that a unit resolving no middleware will not execute", async () => {
      // the silence is the bug: bootstrap reported success either way (FYM-283)
      const errors: string[] = [];
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation((...args: any[]) => errors.push(args.join(" ")));

      const fynApp = createMockFynApp();
      const fynModule = {
        __middlewareMeta: [{ info: { name: "not-registered-yet" } }],
      };

      await kernel.testUseMiddlewareOnFynModule(fynModule, fynApp);
      spy.mockRestore();

      expect(errors.join("\n")).toMatch(/resolved none.*render nothing/s);
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

      (kernel as any).runTime.apps["dep-app"] = dependencyApp;

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
