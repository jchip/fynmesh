import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShellLayoutMiddleware } from "../../fynapp-shell-mw/src/middleware/shell-layout.ts";

type MiddlewareHarness = ShellLayoutMiddleware & {
    kernel: { loadFynApp: ReturnType<typeof vi.fn> } | null;
    regions: Map<string, { container: unknown; fynAppId: string | null; fynApp: unknown }>;
    loadedFynApps: Map<string, unknown>;
    activeRegionLoadIds: Map<string, number>;
    awaitDeferredProviders(): Promise<void>;
    loadApp(url: string): void;
    loadFynApp(url: string): Promise<unknown>;
    loadIntoRegion(url: string, region: string): Promise<unknown>;
    manageAppLayout(fynApp: unknown): Promise<void>;
    renderFynAppIntoRegion(fynApp: unknown, region: string): Promise<void>;
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
});
