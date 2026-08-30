import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellLayoutMiddleware } from "../../fynapp-shell-mw/src/middleware/shell-layout.ts";

type MiddlewareHarness = ShellLayoutMiddleware & {
    kernel: {
        loadFynApp?: ReturnType<typeof vi.fn>;
        loader?: { mkRuntime: ReturnType<typeof vi.fn> };
        shutdownFynApp?: ReturnType<typeof vi.fn>;
    } | null;
    regions: Map<string, { container: unknown; fynAppId: string | null; fynApp: unknown }>;
    regionFynApps: Map<string, Map<string, { container: unknown; fynApp: unknown }>>;
    loadedFynApps: Map<string, unknown>;
    fynappContainers: Map<string, unknown>;
    reactRoots: Map<string, unknown>;
    activeRegionLoadIds: Map<string, number>;
    isShellInitiated(fynAppName: string): boolean;
    pendingRegionLoad: Map<string, { region: string; token: number }>;
    awaitDeferredProviders(): Promise<void>;
    loadApp(url: string): void;
    loadFynApp(url: string): Promise<unknown>;
    loadIntoRegion(url: string, region: string): Promise<unknown>;
    manageAppLayout(fynApp: unknown): Promise<void>;
    renderFynAppIntoRegion(fynApp: unknown, region: string): Promise<void>;
    cleanupFynApp(fynAppName: string, fynApp: unknown): Promise<void>;
    unloadFynAppFromRegion(fynAppName: string, region: string): Promise<void>;
    clearRegion(region: string): Promise<void>;
    updateLoadedCount(): void;
};

function createMiddleware(): MiddlewareHarness {
    return new ShellLayoutMiddleware() as unknown as MiddlewareHarness;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

function exposeRegion(middleware: MiddlewareHarness, region: "main" | "sidebar"): void {
    middleware.regions.get(region)!.container = {};
}

beforeEach(() => {
    vi.stubGlobal("document", {
        getElementById: vi.fn(() => null),
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    delete (globalThis as Record<string, unknown>).__fynmeshDeferredProviders;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("ShellLayoutMiddleware deferred-provider handshake", () => {
    it("waits for deferred providers before its public dynamic-load API calls the kernel", async () => {
        const middleware = createMiddleware();
        const providers = deferred();
        const loaded = { name: "fynapp-2-react18" };
        const kernelLoad = vi.fn().mockResolvedValue(loaded);
        middleware.kernel = { loadFynApp: kernelLoad };
        (globalThis as Record<string, unknown>).__fynmeshDeferredProviders = providers.promise;

        const request = middleware.loadFynApp("/fynapp-2-react18/dist");
        await Promise.resolve();

        expect(kernelLoad).not.toHaveBeenCalled();

        providers.resolve();
        await expect(request).resolves.toBe(loaded);
        expect(kernelLoad).toHaveBeenCalledOnce();
    });

    it("waits before the sidebar-facing loadApp API starts a regional load", async () => {
        const middleware = createMiddleware();
        const providers = deferred();
        const regionalLoad = vi
            .spyOn(middleware, "loadIntoRegion")
            .mockResolvedValue(null);
        (globalThis as Record<string, unknown>).__fynmeshDeferredProviders = providers.promise;

        middleware.loadApp("/fynapp-2-react18/dist");
        await Promise.resolve();

        expect(regionalLoad).not.toHaveBeenCalled();

        providers.resolve();
        await vi.waitFor(() => {
            expect(regionalLoad).toHaveBeenCalledWith("/fynapp-2-react18/dist", "main");
        });
    });

    it("does not make a direct regional load wait on deferred providers", async () => {
        const middleware = createMiddleware();
        const providers = deferred();
        const kernelLoad = vi.fn().mockResolvedValue(null);
        middleware.kernel = { loadFynApp: kernelLoad };
        exposeRegion(middleware, "sidebar");
        (globalThis as Record<string, unknown>).__fynmeshDeferredProviders = providers.promise;

        await expect(
            middleware.loadIntoRegion("/fynapp-sidebar/dist", "sidebar")
        ).resolves.toBeNull();

        expect(kernelLoad).toHaveBeenCalledWith("/fynapp-sidebar/dist");
    });
});

describe("ShellLayoutMiddleware background layout classification", () => {
    it("does not let a background-loaded provider claim the main region", async () => {
        const middleware = createMiddleware();
        const provider = { name: "fynapp-react-18", version: "18.0.0" };
        exposeRegion(middleware, "main");
        const render = vi
            .spyOn(middleware, "renderFynAppIntoRegion")
            .mockResolvedValue(undefined);
        vi.spyOn(middleware, "updateLoadedCount").mockImplementation(() => {});

        await middleware.manageAppLayout(provider);

        expect(render).not.toHaveBeenCalled();
        expect(middleware.regions.get("main")!.fynApp).toBeNull();
        expect(middleware.loadedFynApps.has(provider.name)).toBe(false);
    });

    it("does not let a prefix-sharing sibling ride in on another app's load", async () => {
        const middleware = createMiddleware();
        const background = { name: "fynapp-1", version: "1.0.0" };
        exposeRegion(middleware, "main");
        // The user asked for fynapp-1-b; fynapp-1 is a different app entirely
        middleware.activeRegionLoadIds.set("fynapp-1-b", 1);
        const render = vi
            .spyOn(middleware, "renderFynAppIntoRegion")
            .mockResolvedValue(undefined);
        vi.spyOn(middleware, "updateLoadedCount").mockImplementation(() => {});

        await middleware.manageAppLayout(background);

        expect(render).not.toHaveBeenCalled();
        expect(middleware.regions.get("main")!.fynApp).toBeNull();
        expect(middleware.loadedFynApps.has(background.name)).toBe(false);
    });

    it("keeps a versioned dist load shell-initiated when its container name drops the suffix", async () => {
        const middleware = createMiddleware();
        const provider = { name: "fynapp-x1", version: "1.0.0" };
        exposeRegion(middleware, "main");
        middleware.activeRegionLoadIds.set("fynapp-x1-v1", 1);
        const render = vi
            .spyOn(middleware, "renderFynAppIntoRegion")
            .mockResolvedValue(undefined);
        vi.spyOn(middleware, "updateLoadedCount").mockImplementation(() => {});

        await middleware.manageAppLayout(provider);

        expect(render).toHaveBeenCalledWith(provider, "main");
        expect(middleware.regions.get("main")!.fynApp).toBe(provider);
        expect(middleware.loadedFynApps.get(provider.name)).toBe(provider);
    });

    it("treats only a version suffix as the same app", () => {
        const middleware = createMiddleware();
        middleware.activeRegionLoadIds.set("fynapp-x1-v2", 1);

        expect(middleware.isShellInitiated("fynapp-x1")).toBe(true);
        expect(middleware.isShellInitiated("fynapp-x1-v2")).toBe(true);
        expect(middleware.isShellInitiated("fynapp-x1-v")).toBe(false);
        expect(middleware.isShellInitiated("fynapp-x")).toBe(false);
        expect(middleware.isShellInitiated("fynapp")).toBe(false);
    });
});

function createFynApp(name = "fynapp-cleanup") {
    return {
        name,
        version: "1.0.0",
        middlewareContext: new Map(),
        exposes: { "./main": { main: { shutdown: vi.fn() } } },
    };
}

/**
 * Stage a FynApp in a region the way manageAppLayout leaves it, so the unload
 * paths have a container to drop and tracking entries to clear.
 */
function stageInRegion(
    middleware: MiddlewareHarness,
    fynApp: { name: string },
    region: "main" | "sidebar",
) {
    const container = { remove: vi.fn(), style: {} as Record<string, string> };
    exposeRegion(middleware, region);
    const regionInfo = middleware.regions.get(region)!;
    regionInfo.fynAppId = fynApp.name;
    regionInfo.fynApp = fynApp;
    middleware.regionFynApps.get(region)!.set(fynApp.name, { container, fynApp });
    middleware.loadedFynApps.set(fynApp.name, fynApp);
    middleware.fynappContainers.set(fynApp.name, container);
    vi.spyOn(middleware, "updateLoadedCount").mockImplementation(() => {});
    return container;
}

describe("ShellLayoutMiddleware cleanup", () => {
    it("routes unload through the kernel's complete shutdown lifecycle", async () => {
        const middleware = createMiddleware();
        const fynApp = createFynApp();
        const shutdownFynApp = vi.fn().mockResolvedValue(true);
        const mkRuntime = vi.fn();
        middleware.kernel = { shutdownFynApp, loader: { mkRuntime } };

        await middleware.cleanupFynApp(fynApp.name, fynApp);

        expect(shutdownFynApp).toHaveBeenCalledOnce();
        expect(shutdownFynApp).toHaveBeenCalledWith(fynApp.name);
        // The kernel owns the hook call now — the shell must not invoke ./main itself
        expect(fynApp.exposes["./main"].main.shutdown).not.toHaveBeenCalled();
        expect(mkRuntime).not.toHaveBeenCalled();
    });

    it("clears shell tracking only after the kernel shutdown settles", async () => {
        const middleware = createMiddleware();
        const fynApp = createFynApp();
        const shutdownGate = deferred();
        middleware.kernel = {
            shutdownFynApp: vi.fn(() => shutdownGate.promise),
        };
        const root = { unmount: vi.fn() };
        middleware.reactRoots.set(fynApp.name, root);
        middleware.loadedFynApps.set(fynApp.name, fynApp);

        const cleanup = middleware.cleanupFynApp(fynApp.name, fynApp);
        await Promise.resolve();

        expect(root.unmount).not.toHaveBeenCalled();
        expect(middleware.loadedFynApps.has(fynApp.name)).toBe(true);

        shutdownGate.resolve();
        await cleanup;

        expect(root.unmount).toHaveBeenCalledOnce();
        expect(middleware.loadedFynApps.has(fynApp.name)).toBe(false);
        expect(middleware.reactRoots.has(fynApp.name)).toBe(false);
    });

    it("holds the FynApp's DOM in place until an async shutdown completes", async () => {
        const middleware = createMiddleware();
        const fynApp = createFynApp();
        const shutdownGate = deferred();
        middleware.kernel = {
            shutdownFynApp: vi.fn(() => shutdownGate.promise),
        };
        const container = stageInRegion(middleware, fynApp, "main");

        const unload = middleware.unloadFynAppFromRegion(fynApp.name, "main");
        await Promise.resolve();

        // A shutdown hook still needs the tree it rendered into
        expect(container.remove).not.toHaveBeenCalled();

        shutdownGate.resolve();
        await unload;

        expect(container.remove).toHaveBeenCalledOnce();
        expect(middleware.regionFynApps.get("main")!.has(fynApp.name)).toBe(false);
        expect(middleware.regions.get("main")!.fynAppId).toBeNull();
    });

    it("absorbs a rejected shutdown and still finishes the unload", async () => {
        const middleware = createMiddleware();
        const fynApp = createFynApp();
        const failure = new Error("shutdown exploded");
        middleware.kernel = {
            shutdownFynApp: vi.fn().mockRejectedValue(failure),
        };
        const container = stageInRegion(middleware, fynApp, "main");

        await expect(
            middleware.unloadFynAppFromRegion(fynApp.name, "main"),
        ).resolves.toBeUndefined();

        expect(console.warn).toHaveBeenCalledWith(
            `Failed to shutdown FynApp ${fynApp.name}:`,
            failure,
        );
        expect(container.remove).toHaveBeenCalledOnce();
        expect(middleware.loadedFynApps.has(fynApp.name)).toBe(false);
        expect(middleware.regionFynApps.get("main")!.has(fynApp.name)).toBe(false);
    });

    it("keeps a re-load that lands while the shutdown is still in flight", async () => {
        const middleware = createMiddleware();
        const fynApp = createFynApp("fynapp-churn");
        const gate = deferred();
        middleware.kernel = { shutdownFynApp: vi.fn(() => gate.promise) };
        const staleContainer = stageInRegion(middleware, fynApp, "main");
        const regionApps = middleware.regionFynApps.get("main")!;

        const unload = middleware.unloadFynAppFromRegion(fynApp.name, "main");
        await Promise.resolve();

        // The user re-loads the same FynApp before its shutdown resolves
        const freshContainer = { remove: vi.fn(), style: {} as Record<string, string> };
        const freshEntry = { container: freshContainer, fynApp };
        regionApps.set(fynApp.name, freshEntry);

        gate.resolve();
        await unload;

        // The stale container goes, the live re-loaded entry stays tracked
        expect(staleContainer.remove).toHaveBeenCalledOnce();
        expect(freshContainer.remove).not.toHaveBeenCalled();
        expect(regionApps.get(fynApp.name)).toBe(freshEntry);
    });

    it("shuts every FynApp in a region down before clearing it", async () => {
        const middleware = createMiddleware();
        const first = createFynApp("fynapp-first");
        const second = createFynApp("fynapp-second");
        const shutdownFynApp = vi.fn().mockResolvedValue(true);
        middleware.kernel = { shutdownFynApp };
        const firstContainer = stageInRegion(middleware, first, "main");
        const secondContainer = stageInRegion(middleware, second, "main");

        await middleware.clearRegion("main");

        expect(shutdownFynApp.mock.calls).toEqual([[first.name], [second.name]]);
        expect(firstContainer.remove).toHaveBeenCalledOnce();
        expect(secondContainer.remove).toHaveBeenCalledOnce();
        expect(middleware.regionFynApps.get("main")!.size).toBe(0);
    });
});

describe("ShellLayoutMiddleware pending-region bookkeeping", () => {
    it("clears the pending region when the kernel load throws", async () => {
        const middleware = createMiddleware();
        const failure = new Error("entry blew up");
        middleware.kernel = { loadFynApp: vi.fn().mockRejectedValue(failure) };
        exposeRegion(middleware, "main");

        await expect(
            middleware.loadIntoRegion("/fynapp-notes/dist", "main"),
        ).rejects.toBe(failure);

        expect(middleware.pendingRegionLoad.has("fynapp-notes")).toBe(false);
    });

    it("clears the pending region when the kernel load returns null", async () => {
        const middleware = createMiddleware();
        middleware.kernel = { loadFynApp: vi.fn().mockResolvedValue(null) };
        exposeRegion(middleware, "main");

        await expect(
            middleware.loadIntoRegion("/fynapp-notes/dist", "main"),
        ).resolves.toBeNull();

        expect(middleware.pendingRegionLoad.has("fynapp-notes")).toBe(false);
    });

    it("does not let a failed load hand its region to a later background app", async () => {
        const middleware = createMiddleware();
        middleware.kernel = { loadFynApp: vi.fn().mockResolvedValue(null) };
        exposeRegion(middleware, "sidebar");
        exposeRegion(middleware, "main");
        const render = vi
            .spyOn(middleware, "renderFynAppIntoRegion")
            .mockResolvedValue(undefined);
        vi.spyOn(middleware, "updateLoadedCount").mockImplementation(() => {});

        await middleware.loadIntoRegion("/fynapp-notes/dist", "sidebar");

        // Same FynApp bootstraps on its own afterwards — nothing asked for it now
        await middleware.manageAppLayout({ name: "fynapp-notes", version: "1.0.0" });

        expect(render).not.toHaveBeenCalled();
        expect(middleware.regions.get("sidebar")!.fynApp).toBeNull();
    });

    it("keeps the region a newer concurrent request claimed when the older load fails", async () => {
        const middleware = createMiddleware();
        const firstLoad = deferred();
        const kernelLoad = vi
            .fn()
            .mockImplementationOnce(() => firstLoad.promise.then(() => null))
            .mockResolvedValue(null);
        middleware.kernel = { loadFynApp: kernelLoad };
        exposeRegion(middleware, "sidebar");
        exposeRegion(middleware, "main");

        const stale = middleware.loadIntoRegion("/fynapp-notes/dist", "sidebar");
        await Promise.resolve();

        // A second request for the same app takes over the pending entry...
        middleware.pendingRegionLoad.set("fynapp-notes", { region: "main", token: 99 });

        // ...and the first one failing must not delete it
        firstLoad.resolve();
        await stale;

        expect(middleware.pendingRegionLoad.get("fynapp-notes")).toEqual({
            region: "main",
            token: 99,
        });
    });
});
