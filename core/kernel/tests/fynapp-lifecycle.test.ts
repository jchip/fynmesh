/**
 * FynApp lifecycle: mount tracking, error boundary, suspend/resume (epic FYM-4)
 *
 * - FYM-5: FynAppLifecycle module + kernel mount tracking (bootstrapping ->
 *   mounted, removed on shutdown; getFynAppState / listFynAppStates).
 * - FYM-6: per-FynApp error boundary — a throwing bootstrap is recorded as a
 *   `failed` state and does not stop sibling apps.
 * - FYM-7: suspend()/resume() FynUnit hooks + suspendFynApp/resumeFynApp.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import { FynAppLifecycle } from "../src/modules/fynapp-lifecycle.js";
import type { FynApp, FynAppEntry, FynUnit, FynUnitRuntime } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers (mirror tests/fyn-bus-kernel-flows.test.ts)
// ---------------------------------------------------------------------------

class FlowTestKernel extends FynMeshKernelCore {
  async loadFynApp(): Promise<FynApp | null> {
    return null;
  }
}

function createKernel(): FlowTestKernel {
  const kernel = new FlowTestKernel();
  kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
  return kernel;
}

function makeEntry(name: string, version: string, unit: FynUnit | ((rt: FynUnitRuntime) => any)): FynAppEntry {
  return {
    container: {
      name,
      version,
      $E: { "./main": "./main" },
    } as any,
    init: vi.fn(),
    get: vi.fn().mockImplementation((exposeName: string) =>
      Promise.resolve(() => (exposeName === "./main" ? { main: unit } : {})),
    ),
    setup: vi.fn().mockResolvedValue(undefined),
  } as unknown as FynAppEntry;
}

async function bootApp(
  kernel: FynMeshKernelCore,
  name: string,
  unit: FynUnit | ((rt: FynUnitRuntime) => any),
  version = "1.0.0",
): Promise<FynApp> {
  const fynApp = await kernel.loadFynAppBasics(makeEntry(name, version, unit));
  await kernel.bootstrapFynApp(fynApp);
  return fynApp;
}

// ---------------------------------------------------------------------------
// FynAppLifecycle module (unit)
// ---------------------------------------------------------------------------

describe("FynAppLifecycle module (FYM-5)", () => {
  let lc: FynAppLifecycle;

  beforeEach(() => {
    lc = new FynAppLifecycle();
  });

  it("keys state by name@version and returns it via get()", () => {
    lc.set("app", "1.0.0", "mounted");
    lc.set("app", "2.0.0", "bootstrapping");

    expect(lc.get("app", "1.0.0")?.status).toBe("mounted");
    expect(lc.get("app", "2.0.0")?.status).toBe("bootstrapping");
    expect(lc.get("app", "9.9.9")).toBeUndefined();
  });

  it("stamps mountedAt only on the mounted transition and preserves it after", () => {
    const boot = lc.set("app", "1.0.0", "bootstrapping");
    expect(boot.mountedAt).toBeUndefined();

    const mounted = lc.set("app", "1.0.0", "mounted");
    expect(mounted.mountedAt).toBeTypeOf("number");

    const suspended = lc.set("app", "1.0.0", "suspended");
    expect(suspended.mountedAt).toBe(mounted.mountedAt);
  });

  it("retains error only for the failed status", () => {
    const err = new Error("boom");
    expect(lc.set("app", "1.0.0", "failed", err).error).toBe(err);
    // a non-failed transition clears the error
    expect(lc.set("app", "1.0.0", "mounted", err).error).toBeUndefined();
  });

  it("find() resolves by name@version or by bare name (latest wins)", () => {
    lc.set("app", "1.0.0", "mounted");
    lc.set("app", "2.0.0", "suspended");

    expect(lc.find("app@1.0.0")?.version).toBe("1.0.0");
    // bare name -> most recently updated version
    expect(lc.find("app")?.version).toBe("2.0.0");
    expect(lc.find("missing")).toBeUndefined();
  });

  it("list() returns all tracked states and remove() stops tracking", () => {
    lc.set("a", "1.0.0", "mounted");
    lc.set("b", "1.0.0", "failed", new Error("x"));
    expect(lc.list()).toHaveLength(2);

    lc.remove("a", "1.0.0");
    expect(lc.list()).toHaveLength(1);
    expect(lc.get("a", "1.0.0")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mount tracking through the real kernel
// ---------------------------------------------------------------------------

describe("kernel mount tracking (FYM-5)", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("marks a FynApp mounted after a successful bootstrap", async () => {
    await bootApp(kernel, "nav", { execute: vi.fn() });

    const state = kernel.getFynAppState("nav");
    expect(state?.status).toBe("mounted");
    expect(state?.version).toBe("1.0.0");
    expect(state?.mountedAt).toBeTypeOf("number");
    expect(kernel.listFynAppStates()).toHaveLength(1);
  });

  it("stops tracking a FynApp after shutdown", async () => {
    await bootApp(kernel, "nav", { execute: vi.fn() });
    expect(kernel.getFynAppState("nav")?.status).toBe("mounted");

    await expect(kernel.shutdownFynApp("nav")).resolves.toBe(true);

    expect(kernel.getFynAppState("nav")).toBeUndefined();
    expect(kernel.listFynAppStates()).toHaveLength(0);
  });

  it("tracks multiple versions independently", async () => {
    await bootApp(kernel, "widgets", { execute: vi.fn() }, "1.0.0");
    await bootApp(kernel, "widgets", { execute: vi.fn() }, "2.0.0");

    expect(kernel.getFynAppState("widgets@1.0.0")?.status).toBe("mounted");
    expect(kernel.getFynAppState("widgets@2.0.0")?.status).toBe("mounted");
    expect(kernel.listFynAppStates()).toHaveLength(2);
  });
});
