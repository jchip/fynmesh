import { describe, it, expect, vi, beforeEach } from "vitest";
import { KernelTelemetryImpl } from "../src/kernel-telemetry";
import type { TelemetryEntry, TelemetryTransport, KernelTelemetry } from "../src/types";

// Module-level imports for direct testing
import { ManifestResolver } from "../src/modules/manifest-resolver";
import { BootstrapCoordinator } from "../src/modules/bootstrap-coordinator";
import { MiddlewareManager } from "../src/modules/middleware-manager";
import { ModuleLoader } from "../src/modules/module-loader";
import { MiddlewareExecutor } from "../src/modules/middleware-executor";
import { FynEventTarget } from "../src/event-target";

// Kernel-level imports
import { TestKernel, createTestKernel, createMockManifest } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddlewareReg, createMockMiddleware, createMockAutoApplyMiddleware } from "./fixtures/mock-middleware";

// ---------------------------------------------------------------------------
// Helper: create a spy telemetry that records all captured entries
// ---------------------------------------------------------------------------
function createSpyTelemetry(): { telemetry: KernelTelemetry; entries: Array<Omit<TelemetryEntry, "ts">> } {
  const entries: Array<Omit<TelemetryEntry, "ts">> = [];

  const makeScopedTelemetry = (prefix: string): KernelTelemetry => ({
    capture(entry) {
      entries.push({ ...entry, name: `${prefix}.${entry.name}` });
    },
    scope(sub) {
      return makeScopedTelemetry(`${prefix}.${sub}`);
    },
    flush() {},
  });

  const telemetry: KernelTelemetry = {
    capture(entry) {
      entries.push(entry);
    },
    scope(prefix) {
      return makeScopedTelemetry(prefix);
    },
    flush() {},
  };

  return { telemetry, entries };
}

// Helper: create a mock transport for KernelTelemetryImpl-based tests
function createMockTransport() {
  const batches: TelemetryEntry[][] = [];
  const transport: TelemetryTransport = {
    async send(batch) {
      batches.push(batch);
    },
  };
  return { transport, batches };
}

// Helper: find entries by name pattern
function findEntries(entries: Array<Omit<TelemetryEntry, "ts">>, namePattern: string) {
  return entries.filter((e) => e.name.includes(namePattern));
}

// ---------------------------------------------------------------------------
// 1. MiddlewareManager telemetry capture points
// ---------------------------------------------------------------------------
describe("Telemetry Capture Points", () => {
  describe("MiddlewareManager", () => {
    let spy: ReturnType<typeof createSpyTelemetry>;
    let manager: MiddlewareManager;

    beforeEach(() => {
      spy = createSpyTelemetry();
      manager = new MiddlewareManager(spy.telemetry);
    });

    it("should capture 'registered' event when middleware is registered", () => {
      const mwReg = createMockMiddlewareReg();

      manager.registerMiddleware(mwReg);

      const registered = findEntries(spy.entries, "registered");
      expect(registered).toHaveLength(1);
      expect(registered[0].type).toBe("event");
      expect(registered[0].data).toEqual({
        key: mwReg.regKey,
        version: mwReg.hostFynApp.version,
        autoApply: false,
      });
    });

    it("should capture 'registered' with autoApply: true for auto-apply middleware", () => {
      const middleware = createMockAutoApplyMiddleware(["fynapp"]);
      const mwReg = createMockMiddlewareReg({ middleware });

      manager.registerMiddleware(mwReg);

      const registered = findEntries(spy.entries, "registered");
      expect(registered).toHaveLength(1);
      expect(registered[0].data!.autoApply).toBe(true);
    });

    it("should not capture 'registered' for duplicate registrations", () => {
      const mwReg = createMockMiddlewareReg();

      manager.registerMiddleware(mwReg);
      manager.registerMiddleware(mwReg); // duplicate

      const registered = findEntries(spy.entries, "registered");
      expect(registered).toHaveLength(1);
    });

    it("should capture 'scan.completed' event when module is scanned", () => {
      const fynApp = createMockFynApp();
      const exposedModule = {
        __middleware__test: {
          name: "test-mw",
          setup: vi.fn(),
          apply: vi.fn(),
        },
      };

      manager.scanAndRegisterMiddleware(fynApp, "./middleware/test", exposedModule);

      const scanCompleted = findEntries(spy.entries, "scan.completed");
      expect(scanCompleted).toHaveLength(1);
      expect(scanCompleted[0].type).toBe("event");
      expect(scanCompleted[0].data).toEqual({
        app: fynApp.name,
        expose: "./middleware/test",
        count: 1,
      });
    });

    it("should capture scan.completed with count: 0 when no middlewares found", () => {
      const fynApp = createMockFynApp();
      const exposedModule = { someExport: {} };

      manager.scanAndRegisterMiddleware(fynApp, "./main", exposedModule);

      const scanCompleted = findEntries(spy.entries, "scan.completed");
      expect(scanCompleted).toHaveLength(1);
      expect(scanCompleted[0].data!.count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ModuleLoader telemetry capture points
  // ---------------------------------------------------------------------------
  describe("ModuleLoader", () => {
    let spy: ReturnType<typeof createSpyTelemetry>;
    let loader: ModuleLoader;

    beforeEach(() => {
      spy = createSpyTelemetry();
      loader = new ModuleLoader(spy.telemetry);
    });

    it("should capture 'fynapp.init' and 'fynapp.basics_loaded' during loadFynAppBasics", async () => {
      const mockEntry = {
        container: {
          name: "test-app",
          version: "2.0.0",
          $E: { "./main": "./main" },
        } as any,
        init: vi.fn(),
        get: vi.fn().mockResolvedValue(() => ({ main: { execute: vi.fn() } })),
      };

      await loader.loadFynAppBasics(mockEntry as any, {});

      const initEvents = findEntries(spy.entries, "fynapp.init");
      expect(initEvents).toHaveLength(1);
      expect(initEvents[0].type).toBe("event");
      expect(initEvents[0].data).toEqual({ app: "test-app", version: "2.0.0" });

      const loadedEvents = findEntries(spy.entries, "fynapp.basics_loaded");
      expect(loadedEvents).toHaveLength(1);
      expect(loadedEvents[0].type).toBe("event");
      expect(loadedEvents[0].data).toEqual({ app: "test-app", version: "2.0.0" });
    });

    it("should capture 'fynunit.execute' during invokeFynUnit", async () => {
      const fynApp = createMockFynApp();
      const fynUnit = { execute: vi.fn() };

      await loader.invokeFynUnit(fynUnit, fynApp);

      const executeEvents = findEntries(spy.entries, "fynunit.execute");
      expect(executeEvents).toHaveLength(1);
      expect(executeEvents[0].type).toBe("event");
      expect(executeEvents[0].data).toEqual({ app: fynApp.name });
    });

    it("should not capture 'fynunit.execute' when fynUnit has no execute", async () => {
      const fynApp = createMockFynApp();
      const fynUnit = {}; // no execute method

      await loader.invokeFynUnit(fynUnit, fynApp);

      const executeEvents = findEntries(spy.entries, "fynunit.execute");
      expect(executeEvents).toHaveLength(0);
    });

    it("should capture 'expose.not_found' error when module doesn't exist", async () => {
      const fynApp = createMockFynApp();
      // Container without the expected expose
      (fynApp.entry.container as any).$E = {};

      const result = await loader.loadExposeModule(fynApp, "./nonexistent");

      expect(result.success).toBe(false);

      const notFoundErrors = findEntries(spy.entries, "expose.not_found");
      expect(notFoundErrors).toHaveLength(1);
      expect(notFoundErrors[0].type).toBe("error");
      expect(notFoundErrors[0].data).toEqual({
        app: fynApp.name,
        expose: "./nonexistent",
      });
      expect(notFoundErrors[0].error).toBeDefined();
      expect(notFoundErrors[0].error!.message).toContain("No expose module");
    });

    it("should capture 'dependency.not_found' error when package not found", async () => {
      const result = await loader.loadMiddlewareFromDependency(
        "missing-package",
        "middleware/test",
        {} // empty appsLoaded
      );

      expect(result.success).toBe(false);

      const notFoundErrors = findEntries(spy.entries, "dependency.not_found");
      expect(notFoundErrors).toHaveLength(1);
      expect(notFoundErrors[0].type).toBe("error");
      expect(notFoundErrors[0].data).toEqual({
        package: "missing-package",
        path: "middleware/test",
      });
      expect(notFoundErrors[0].error!.message).toContain("not found in runtime");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. BootstrapCoordinator telemetry capture points
  // ---------------------------------------------------------------------------
  describe("BootstrapCoordinator", () => {
    let spy: ReturnType<typeof createSpyTelemetry>;
    let events: FynEventTarget;
    let coordinator: BootstrapCoordinator;

    beforeEach(() => {
      spy = createSpyTelemetry();
      events = new FynEventTarget();
      coordinator = new BootstrapCoordinator(events, undefined, spy.telemetry);
    });

    it("should capture 'lock.acquired' when bootstrap lock is acquired", () => {
      coordinator.acquireBootstrapLock("app1");

      const lockEvents = findEntries(spy.entries, "lock.acquired");
      expect(lockEvents).toHaveLength(1);
      expect(lockEvents[0].type).toBe("event");
      expect(lockEvents[0].data).toEqual({ app: "app1" });
    });

    it("should not capture 'lock.acquired' when lock acquisition fails", () => {
      coordinator.acquireBootstrapLock("app1"); // acquires
      spy.entries.length = 0; // reset
      coordinator.acquireBootstrapLock("app2"); // fails

      const lockEvents = findEntries(spy.entries, "lock.acquired");
      expect(lockEvents).toHaveLength(0);
    });

    it("should capture 'deferred' when bootstrap is deferred", async () => {
      coordinator.bootstrappingApp = "app1"; // someone else is bootstrapping

      const fynApp = createMockFynApp({ name: "app2" });
      const promise = coordinator.deferBootstrap(fynApp);

      const deferredEvents = findEntries(spy.entries, "deferred");
      expect(deferredEvents).toHaveLength(1);
      expect(deferredEvents[0].type).toBe("event");
      expect(deferredEvents[0].data!.app).toBe("app2");
      expect(deferredEvents[0].data!.reason).toContain("app1");

      // Resolve the deferred bootstrap to avoid hanging promise
      coordinator.releaseBootstrapLock();
      events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "app1", version: "1.0.0" },
      }));
      await promise;
    });

    it("should capture 'completed' when bootstrap completes via event", async () => {
      events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "app1", version: "1.0.0" },
      }));

      // Give event handler time to run
      await new Promise(resolve => setTimeout(resolve, 10));

      const completedEvents = findEntries(spy.entries, "completed");
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].type).toBe("event");
      expect(completedEvents[0].data).toEqual({ app: "app1" });
    });

    it("should capture 'failed' error when bootstrap fails via event", async () => {
      events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAP_FAILED", {
        detail: { name: "app1", version: "1.0.0", error: new Error("boom") },
      }));

      await new Promise(resolve => setTimeout(resolve, 10));

      const failedErrors = findEntries(spy.entries, "failed");
      expect(failedErrors).toHaveLength(1);
      expect(failedErrors[0].type).toBe("error");
      expect(failedErrors[0].data).toEqual({ app: "app1" });
    });

    it("should capture 'resumed' when deferred bootstrap is resumed", async () => {
      const fynApp = createMockFynApp({ name: "app2" });
      coordinator.bootstrappingApp = "app1";

      const promise = coordinator.deferBootstrap(fynApp);

      // Trigger completion of app1 which should resume app2
      coordinator.releaseBootstrapLock();
      events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAPPED", {
        detail: { name: "app1", version: "1.0.0" },
      }));

      await promise;

      const resumedEvents = findEntries(spy.entries, "resumed");
      expect(resumedEvents).toHaveLength(1);
      expect(resumedEvents[0].type).toBe("event");
      expect(resumedEvents[0].data).toEqual({ app: "app2" });
    });

    it("should capture 'timeout' error when bootstrap times out", async () => {
      vi.useFakeTimers();

      const shortTimeoutCoordinator = new BootstrapCoordinator(events, 100, spy.telemetry);
      shortTimeoutCoordinator.bootstrappingApp = "app1";

      const fynApp = createMockFynApp({ name: "app2" });
      const promise = shortTimeoutCoordinator.deferBootstrap(fynApp);

      // Advance past timeout
      vi.advanceTimersByTime(150);
      await promise;

      const timeoutErrors = findEntries(spy.entries, "timeout");
      expect(timeoutErrors).toHaveLength(1);
      expect(timeoutErrors[0].type).toBe("error");
      expect(timeoutErrors[0].data!.app).toBe("app2");
      expect(timeoutErrors[0].data!.timeout).toBe(100);
      expect(timeoutErrors[0].error!.message).toContain("timeout");

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. MiddlewareExecutor telemetry capture points
  // ---------------------------------------------------------------------------
  describe("MiddlewareExecutor", () => {
    let spy: ReturnType<typeof createSpyTelemetry>;
    let executor: MiddlewareExecutor;

    beforeEach(() => {
      spy = createSpyTelemetry();
      executor = new MiddlewareExecutor(spy.telemetry);
    });

    it("should capture 'call.started' when callMiddlewares is invoked", async () => {
      const fynApp = createMockFynApp();
      const mwReg = createMockMiddlewareReg();
      const ccs = [
        {
          meta: { info: { name: "test", provider: "test-app", version: "1.0.0" }, config: {} },
          fynUnit: { execute: vi.fn() },
          fynMod: { execute: vi.fn() },
          fynApp,
          reg: mwReg,
          kernel: {} as any,
          runtime: { fynApp, middlewareContext: new Map() },
          status: "",
        },
      ];

      // Pre-mark middleware as ready so execution completes
      executor.setMiddlewareReady(mwReg.fullKey, {});

      await executor.callMiddlewares(ccs);

      const callStarted = findEntries(spy.entries, "call.started");
      expect(callStarted).toHaveLength(1);
      expect(callStarted[0].type).toBe("event");
      expect(callStarted[0].data!.count).toBe(1);
      expect(callStarted[0].data!.app).toBe(fynApp.name);
    });

    it("should capture 'setup.completed' after middleware setup", async () => {
      const fynApp = createMockFynApp();
      const middleware = createMockMiddleware({
        setup: vi.fn().mockResolvedValue({ status: "ready" }),
      });
      const mwReg = createMockMiddlewareReg({ middleware });
      const ccs = [
        {
          meta: { info: { name: "test", provider: "test-app", version: "1.0.0" }, config: {} },
          fynUnit: { execute: vi.fn() },
          fynMod: { execute: vi.fn() },
          fynApp,
          reg: mwReg,
          kernel: {} as any,
          runtime: { fynApp, middlewareContext: new Map() },
          status: "",
        },
      ];

      await executor.callMiddlewares(ccs);

      const setupCompleted = findEntries(spy.entries, "setup.completed");
      expect(setupCompleted).toHaveLength(1);
      expect(setupCompleted[0].type).toBe("event");
      expect(setupCompleted[0].data).toEqual({
        middleware: mwReg.regKey,
        app: fynApp.name,
      });
    });

    it("should capture 'execute.completed' after FynUnit execution", async () => {
      const fynApp = createMockFynApp();
      const mwReg = createMockMiddlewareReg();
      const ccs = [
        {
          meta: { info: { name: "test", provider: "test-app", version: "1.0.0" }, config: {} },
          fynUnit: { execute: vi.fn() },
          fynMod: { execute: vi.fn() },
          fynApp,
          reg: mwReg,
          kernel: {} as any,
          runtime: { fynApp, middlewareContext: new Map() },
          status: "",
        },
      ];

      executor.setMiddlewareReady(mwReg.fullKey, {});
      await executor.callMiddlewares(ccs);

      const executeCompleted = findEntries(spy.entries, "execute.completed");
      expect(executeCompleted).toHaveLength(1);
      expect(executeCompleted[0].type).toBe("event");
      expect(executeCompleted[0].data!.app).toBe(fynApp.name);
      expect(executeCompleted[0].data!.override).toBe(false);
    });

    it("should capture 'call.deferred' when middleware is not ready", async () => {
      const fynApp = createMockFynApp();
      const middleware = createMockMiddleware({
        setup: vi.fn().mockResolvedValue({ status: "defer" }),
      });
      const mwReg = createMockMiddlewareReg({ middleware });
      const ccs = [
        {
          meta: { info: { name: "test", provider: "test-app", version: "1.0.0" }, config: {} },
          fynUnit: { execute: vi.fn() },
          fynMod: { execute: vi.fn() },
          fynApp,
          reg: mwReg,
          kernel: {} as any,
          runtime: { fynApp, middlewareContext: new Map() },
          status: "",
        },
      ];

      const result = await executor.callMiddlewares(ccs);

      expect(result).toBe("defer");

      const deferredEvents = findEntries(spy.entries, "call.deferred");
      expect(deferredEvents.length).toBeGreaterThanOrEqual(1);
      expect(deferredEvents[0].type).toBe("event");
      expect(deferredEvents[0].data!.app).toBe(fynApp.name);
    });

    it("should capture 'auto_apply.failed' when auto-apply middleware throws", async () => {
      const fynApp = createMockFynApp();
      const middleware = createMockAutoApplyMiddleware(["fynapp"], {
        setup: vi.fn().mockRejectedValue(new Error("auto-apply boom")),
      });
      const mwReg = createMockMiddlewareReg({ middleware });

      const errors = await executor.applyAutoScopeMiddlewares(
        fynApp,
        undefined,
        {} as any,
        { fynapp: [mwReg], middleware: [] },
        () => ({ fynApp, middlewareContext: new Map() }),
      );

      expect(errors).toHaveLength(1);

      const autoApplyFailed = findEntries(spy.entries, "auto_apply.failed");
      expect(autoApplyFailed).toHaveLength(1);
      expect(autoApplyFailed[0].type).toBe("error");
      expect(autoApplyFailed[0].data).toEqual({
        middleware: mwReg.regKey,
        app: fynApp.name,
      });
      expect(autoApplyFailed[0].error!.message).toBe("auto-apply boom");
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ManifestResolver telemetry capture points
  // ---------------------------------------------------------------------------
  describe("ManifestResolver", () => {
    let spy: ReturnType<typeof createSpyTelemetry>;
    let resolver: ManifestResolver;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      spy = createSpyTelemetry();
      resolver = new ManifestResolver(spy.telemetry);

      mockFetch = vi.fn();
      global.fetch = mockFetch;
      global.location = { href: "http://localhost:3000/" } as any;
      (globalThis as any).Federation = { import: vi.fn() };
    });

    it("should capture 'resolve.duration' metric and 'resolved' event on cache hit", async () => {
      const manifest = createMockManifest({ name: "app1", version: "1.0.0" });
      (resolver as any).manifestCache.set("app1@1.0.0", manifest);

      const mockRegistryResolver = vi.fn().mockResolvedValue({
        name: "app1",
        version: "1.0.0",
        manifestUrl: "/app1/dist/fynapp.manifest.json",
        distBase: "/app1/dist/",
      });
      resolver.setRegistryResolver(mockRegistryResolver);

      await resolver.resolveAndFetch("app1", "1.0.0");

      const durationMetrics = findEntries(spy.entries, "resolve.duration");
      expect(durationMetrics).toHaveLength(1);
      expect(durationMetrics[0].type).toBe("metric");
      expect(durationMetrics[0].value).toBeGreaterThanOrEqual(0);
      expect(durationMetrics[0].data!.name).toBe("app1");

      const resolvedEvents = findEntries(spy.entries, "resolved");
      expect(resolvedEvents).toHaveLength(1);
      expect(resolvedEvents[0].type).toBe("event");
      expect(resolvedEvents[0].data!.name).toBe("app1");
      expect(resolvedEvents[0].data!.version).toBe("1.0.0");
    });

    it("should capture 'resolve.duration' and 'resolved' on fetch", async () => {
      const manifest = createMockManifest({ name: "app2", version: "2.0.0" });

      // Federation.import returns no embedded manifest
      (globalThis as any).Federation.import = vi.fn().mockResolvedValue({});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => manifest,
      });

      const mockRegistryResolver = vi.fn().mockResolvedValue({
        name: "app2",
        version: "2.0.0",
        manifestUrl: "/app2/dist/fynapp.manifest.json",
        distBase: "/app2/dist/",
      });
      resolver.setRegistryResolver(mockRegistryResolver);

      await resolver.resolveAndFetch("app2");

      const durationMetrics = findEntries(spy.entries, "resolve.duration");
      expect(durationMetrics).toHaveLength(1);
      expect(durationMetrics[0].type).toBe("metric");
      expect(durationMetrics[0].value).toBeGreaterThanOrEqual(0);

      const resolvedEvents = findEntries(spy.entries, "resolved");
      expect(resolvedEvents).toHaveLength(1);
      expect(resolvedEvents[0].data!.name).toBe("app2");
      expect(resolvedEvents[0].data!.version).toBe("2.0.0");
    });

    it("should capture 'resolved' with embedded manifest version", async () => {
      const manifest = createMockManifest({ name: "app3", version: "3.0.0" });

      // Federation.import returns embedded manifest
      (globalThis as any).Federation.import = vi.fn().mockResolvedValue({
        __FYNAPP_MANIFEST__: manifest,
      });

      const mockRegistryResolver = vi.fn().mockResolvedValue({
        name: "app3",
        version: "3.0.0",
        manifestUrl: "/app3/dist/fynapp.manifest.json",
        distBase: "/app3/dist/",
      });
      resolver.setRegistryResolver(mockRegistryResolver);

      await resolver.resolveAndFetch("app3");

      const resolvedEvents = findEntries(spy.entries, "resolved");
      expect(resolvedEvents).toHaveLength(1);
      expect(resolvedEvents[0].data!.version).toBe("3.0.0");
    });

    it("should capture 'graph.built' event after buildGraph", async () => {
      const manifest = createMockManifest({ name: "root", version: "1.0.0" });

      (globalThis as any).Federation.import = vi.fn().mockResolvedValue({
        __FYNAPP_MANIFEST__: manifest,
      });

      const mockRegistryResolver = vi.fn().mockResolvedValue({
        name: "root",
        version: "1.0.0",
        manifestUrl: "/root/dist/fynapp.manifest.json",
        distBase: "/root/dist/",
      });
      resolver.setRegistryResolver(mockRegistryResolver);

      const graph = await resolver.buildGraph([{ name: "root" }]);

      const graphBuilt = findEntries(spy.entries, "graph.built");
      expect(graphBuilt).toHaveLength(1);
      expect(graphBuilt[0].type).toBe("event");
      expect(graphBuilt[0].data!.nodes).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. kernel-core (FynMeshKernelCore) telemetry capture points
  // ---------------------------------------------------------------------------
  describe("kernel-core (via TestKernel with telemetry)", () => {
    let kernel: TestKernel;
    let transport: ReturnType<typeof createMockTransport>;

    beforeEach(() => {
      transport = createMockTransport();
      kernel = createTestKernel({ telemetryConfig: { transport: transport.transport } });

      // Mock global environment needed for manifest resolution
      global.location = { href: "http://localhost:3000/" } as any;
      (globalThis as any).Federation = {
        import: vi.fn().mockResolvedValue({}),
      };
    });

    it("should capture 'bootstrap.started' and 'bootstrap.completed' on successful bootstrap", async () => {
      const fynApp = createMockFynApp({ name: "my-app", version: "1.0.0" });
      fynApp.exposes["./main"] = {
        main: { execute: vi.fn() },
      } as any;

      await kernel.testBootstrapFynApp(fynApp);
      kernel.telemetry.flush();

      expect(transport.batches.length).toBeGreaterThanOrEqual(1);
      const allEntries = transport.batches.flat();

      const startedEntries = allEntries.filter((e) => e.name === "bootstrap.started");
      expect(startedEntries).toHaveLength(1);
      expect(startedEntries[0].data).toEqual({ app: "my-app", version: "1.0.0" });

      // bootstrap.completed appears multiple times: once from kernel-core and once per
      // BootstrapCoordinator instance listening on the events (the parent class creates one,
      // then TestKernel replaces it but the old listener remains attached).
      const completedEntries = allEntries.filter((e) => e.name === "bootstrap.completed");
      expect(completedEntries.length).toBeGreaterThanOrEqual(1);
      expect(completedEntries[0].data).toEqual({ app: "my-app", version: "1.0.0" });
    });

    it("should capture 'bootstrap.failed' error on bootstrap failure", async () => {
      const fynApp = createMockFynApp({ name: "fail-app" });
      // Provide a main export that will throw during validation
      fynApp.exposes["./main"] = {
        main: 42, // not a function or FynUnit - will throw in validateFynUnit
      } as any;

      await kernel.testBootstrapFynApp(fynApp);
      kernel.telemetry.flush();

      const allEntries = transport.batches.flat();
      // bootstrap.failed appears multiple times: once from kernel-core and once per
      // BootstrapCoordinator listener (see note in bootstrap.completed test above).
      const failedEntries = allEntries.filter((e) => e.name === "bootstrap.failed");
      expect(failedEntries.length).toBeGreaterThanOrEqual(1);
      // The first entry is from kernel-core which includes the error message
      const kernelFailedEntry = failedEntries.find((e) => e.error?.message?.includes("must be a function"));
      expect(kernelFailedEntry).toBeDefined();
      expect(kernelFailedEntry!.type).toBe("error");
      expect(kernelFailedEntry!.data!.app).toBe("fail-app");
    });

    it("should capture 'shutdown.started' and 'shutdown.completed' on successful shutdown", async () => {
      const fynApp = createMockFynApp({ name: "shutdown-app", version: "1.0.0" });
      (kernel as any).runTime.appsLoaded["shutdown-app"] = fynApp;

      const result = await kernel.shutdownFynApp("shutdown-app");

      kernel.telemetry.flush();
      const allEntries = transport.batches.flat();

      expect(result).toBe(true);

      const startedEntries = allEntries.filter((e) => e.name === "shutdown.started");
      expect(startedEntries).toHaveLength(1);
      expect(startedEntries[0].data).toEqual({ app: "shutdown-app" });

      const completedEntries = allEntries.filter((e) => e.name === "shutdown.completed");
      expect(completedEntries).toHaveLength(1);
      expect(completedEntries[0].data).toEqual({ app: "shutdown-app", version: "1.0.0" });
    });

    it("should capture 'shutdown.failed' error when shutdown throws", async () => {
      const fynApp = createMockFynApp({ name: "crash-app", version: "1.0.0" });
      fynApp.exposes["./main"] = {
        main: {
          shutdown: vi.fn().mockRejectedValue(new Error("shutdown boom")),
        },
      } as any;
      (kernel as any).runTime.appsLoaded["crash-app"] = fynApp;

      const result = await kernel.shutdownFynApp("crash-app");

      kernel.telemetry.flush();
      const allEntries = transport.batches.flat();

      expect(result).toBe(false);

      const failedEntries = allEntries.filter((e) => e.name === "shutdown.failed");
      expect(failedEntries).toHaveLength(1);
      expect(failedEntries[0].type).toBe("error");
      expect(failedEntries[0].data!.app).toBe("crash-app");
      expect(failedEntries[0].error!.message).toBe("shutdown boom");
    });

    it("should capture 'load_batch.started' and 'load_batch.completed' during loadFynAppsByName", async () => {
      // Mock fetch for manifest resolution
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createMockManifest({ name: "batch-app", version: "1.0.0" }),
      });

      await kernel.loadFynAppsByName([
        { name: "batch-app" },
      ]);

      kernel.telemetry.flush();
      const allEntries = transport.batches.flat();

      const startedEntries = allEntries.filter((e) => e.name === "load_batch.started");
      expect(startedEntries).toHaveLength(1);
      expect(startedEntries[0].data).toEqual({ count: 1 });

      const completedEntries = allEntries.filter((e) => e.name === "load_batch.completed");
      expect(completedEntries).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Scoped telemetry integration - verify modules get correct prefixes
  //    when wired through the kernel
  // ---------------------------------------------------------------------------
  describe("scoped telemetry through kernel", () => {
    it("should prefix module entries with the correct scope when using KernelTelemetryImpl", async () => {
      const { transport, batches } = createMockTransport();
      const kernel = createTestKernel({ telemetryConfig: { transport } });

      // Trigger middleware manager capture via kernel.registerMiddleware
      const mwReg = createMockMiddlewareReg();
      kernel.registerMiddleware(mwReg);

      kernel.telemetry.flush();

      const allEntries = batches.flat();
      // MiddlewareManager is scoped to "middleware"
      const mwEntries = allEntries.filter((e) => e.name.startsWith("middleware."));
      expect(mwEntries.length).toBeGreaterThanOrEqual(1);
      expect(mwEntries.some((e) => e.name === "middleware.registered")).toBe(true);
    });

    it("should scope bootstrap coordinator entries with 'bootstrap' prefix", async () => {
      const { transport, batches } = createMockTransport();
      const kernel = createTestKernel({ telemetryConfig: { transport } });

      // Trigger lock acquisition
      kernel.testBootstrappingApp = null;
      const fynApp = createMockFynApp({ name: "scoped-app" });
      fynApp.exposes["./main"] = { main: { execute: vi.fn() } } as any;
      await kernel.testBootstrapFynApp(fynApp);

      kernel.telemetry.flush();
      const allEntries = batches.flat();

      const bootstrapEntries = allEntries.filter((e) => e.name.startsWith("bootstrap."));
      // Should have at least lock.acquired and completed
      expect(bootstrapEntries.length).toBeGreaterThanOrEqual(1);
    });
  });
});
