/**
 * FynApp lifecycle: mount tracking, error boundary, suspend/resume (epic FYM-1)
 *
 * - FYM-10: FynAppLifecycle module + kernel mount tracking (bootstrapping ->
 *   mounted, removed on shutdown; getFynAppState / listFynAppStates).
 * - FYM-11: per-FynApp error boundary — a throwing bootstrap is recorded as a
 *   `failed` state and does not stop sibling apps.
 * - FYM-9: suspend()/resume() FynUnit hooks + suspendFynApp/resumeFynApp.
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
  kernel.initRunTime({ apps: {}, middlewares: {} });
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

describe("FynAppLifecycle module (FYM-10)", () => {
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

describe("kernel mount tracking (FYM-10)", () => {
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

// ---------------------------------------------------------------------------
// Per-FynApp error boundary
// ---------------------------------------------------------------------------

describe("kernel per-FynApp error boundary (FYM-11)", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("records a throwing bootstrap as a failed state with the error retained", async () => {
    const boom = new Error("execute boom");

    // bootstrap isolates the failure and does not throw
    await expect(
      bootApp(kernel, "crashy", {
        execute() {
          throw boom;
        },
      }),
    ).resolves.toBeDefined();

    const state = kernel.getFynAppState("crashy");
    expect(state?.status).toBe("failed");
    expect(state?.error).toBe(boom);
  });

  it("isolates a failed app so a sibling still mounts", async () => {
    const okExecute = vi.fn();

    await bootApp(kernel, "fail-app", {
      execute() {
        throw new Error("first app boom");
      },
    });
    await bootApp(kernel, "ok-app", { execute: okExecute });

    expect(kernel.getFynAppState("fail-app")?.status).toBe("failed");
    expect(kernel.getFynAppState("ok-app")?.status).toBe("mounted");
    expect(okExecute).toHaveBeenCalledTimes(1);
  });

  it("clears the failed error once the app is shut down", async () => {
    await bootApp(kernel, "crashy", {
      execute() {
        throw new Error("boom");
      },
    });
    expect(kernel.getFynAppState("crashy")?.status).toBe("failed");

    await kernel.shutdownFynApp("crashy");
    expect(kernel.getFynAppState("crashy")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// suspend / resume
// ---------------------------------------------------------------------------

describe("kernel suspend/resume (FYM-9)", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("suspends a mounted app: calls suspend(), sets suspended, emits event", async () => {
    const suspend = vi.fn();
    const suspendedEvt = vi.fn();
    kernel.events.on("FYNAPP_SUSPENDED", suspendedEvt);

    await bootApp(kernel, "nav", { execute: vi.fn(), suspend });

    await expect(kernel.suspendFynApp("nav")).resolves.toBe(true);
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(kernel.getFynAppState("nav")?.status).toBe("suspended");
    expect((suspendedEvt.mock.calls[0][0] as CustomEvent).detail.name).toBe("nav");
  });

  it("resumes a suspended app: calls resume(), sets mounted, emits event", async () => {
    const resume = vi.fn();
    const resumedEvt = vi.fn();
    kernel.events.on("FYNAPP_RESUMED", resumedEvt);

    await bootApp(kernel, "nav", { execute: vi.fn(), resume });
    await kernel.suspendFynApp("nav");

    await expect(kernel.resumeFynApp("nav")).resolves.toBe(true);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(kernel.getFynAppState("nav")?.status).toBe("mounted");
    expect((resumedEvt.mock.calls[0][0] as CustomEvent).detail.name).toBe("nav");
  });

  it("transitions state even when the FynUnit has no suspend/resume hooks", async () => {
    await bootApp(kernel, "plain", { execute: vi.fn() });

    await expect(kernel.suspendFynApp("plain")).resolves.toBe(true);
    expect(kernel.getFynAppState("plain")?.status).toBe("suspended");
    await expect(kernel.resumeFynApp("plain")).resolves.toBe(true);
    expect(kernel.getFynAppState("plain")?.status).toBe("mounted");
  });

  it("rejects invalid transitions without calling hooks", async () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    await bootApp(kernel, "nav", { execute: vi.fn(), suspend, resume });

    // cannot resume a mounted app
    await expect(kernel.resumeFynApp("nav")).resolves.toBe(false);
    expect(resume).not.toHaveBeenCalled();
    expect(kernel.getFynAppState("nav")?.status).toBe("mounted");

    // cannot suspend twice
    await kernel.suspendFynApp("nav");
    expect(suspend).toHaveBeenCalledTimes(1);
    await expect(kernel.suspendFynApp("nav")).resolves.toBe(false);
    expect(suspend).toHaveBeenCalledTimes(1);
  });

  it("returns false for an unknown app", async () => {
    await expect(kernel.suspendFynApp("ghost")).resolves.toBe(false);
    await expect(kernel.resumeFynApp("ghost")).resolves.toBe(false);
  });
});
