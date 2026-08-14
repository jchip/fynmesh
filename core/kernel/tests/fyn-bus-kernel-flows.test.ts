/**
 * FynBus through REAL kernel execution flows (FYM-141)
 *
 * Complements tests/fyn-bus.test.ts (direct FynBusRoot coverage) and
 * tests/fyn-bus-lifecycle.test.ts (facade/dispose bookkeeping, tel,
 * runtime stamping via ModuleLoader). This file drives the bus exclusively
 * through the kernel's own machinery:
 *  - loadFynAppBasics + bootstrapFynApp end-to-end (Path B direct execution)
 *  - Path A middleware coordination via useMiddleware (setup/apply contexts,
 *    deferred setup resumed by signalMiddlewareReady)
 *  - concrete NodeKernel / BrowserKernel instances (BrowserKernel through the
 *    full Federation-mocked loadFynApp path)
 *  - lifecycle events (FYNAPP_BOOTSTRAPPED / FYNAPP_SHUTDOWN) vs the bus
 *  - error isolation when a FynUnit throws after subscribing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import { createNodeKernel } from "../src/node-kernel.js";
import { createBrowserKernel } from "../src/browser-kernel.js";
import { useMiddleware } from "../src/use-middleware.js";
import { KERNEL_BUS_SOURCE } from "../src/fyn-bus.js";
import { FynBusError, KernelErrorCode } from "../src/errors.js";
import type {
  FynApp,
  FynAppEntry,
  FynAppMiddleware,
  FynAppMiddlewareCallContext,
  FynAppMiddlewareReg,
  FynUnit,
  FynUnitRuntime,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal concrete kernel, mirroring kernel-core-integration.test.ts */
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

/**
 * Mock federation entry whose "./main" expose returns the given unit — same
 * shape the existing integration tests feed to loadFynAppBasics.
 */
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

/** Drive a mock FynApp through the kernel's real load + bootstrap path */
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

function makeMwReg(
  provider: string,
  name: string,
  mw: Partial<FynAppMiddleware>,
): FynAppMiddlewareReg {
  const hostFynApp = {
    name: provider,
    version: "1.0.0",
    packageName: provider,
    entry: { container: { name: provider, version: "1.0.0", $E: {} } } as any,
    exposes: {},
    middlewareContext: new Map(),
  } as FynApp;
  return {
    regKey: `${provider}::${name}`,
    fullKey: `${provider}@1.0.0::${name}`,
    hostFynApp,
    exposeName: `./middleware/${name}`,
    exportName: `__middleware__${name}`,
    mw: { name, ...mw } as FynAppMiddleware,
  };
}

// ---------------------------------------------------------------------------
// 1. End-to-end messaging through real bootstrap (Path B)
// ---------------------------------------------------------------------------
describe("FynBus through real kernel bootstrap", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("two apps bootstrapped through the kernel can message each other with stamped meta", async () => {
    const oneReceived: Array<{ payload: unknown; meta: any }> = [];
    const twoReceived: Array<{ payload: unknown; meta: any }> = [];
    let busOne: any;

    await bootApp(kernel, "app-one", {
      execute(rt) {
        busOne = rt.bus;
        rt.bus!.on("chat", (payload, meta) => oneReceived.push({ payload, meta }));
      },
    });

    // app-two subscribes AND emits during its own bootstrap execute
    await bootApp(kernel, "app-two", {
      execute(rt) {
        rt.bus!.on("chat", (payload, meta) => twoReceived.push({ payload, meta }));
        rt.bus!.emit("chat", "hello-from-two");
      },
    });

    // app-one (already bootstrapped) heard app-two's emit; app-two self-filtered
    expect(oneReceived).toEqual([
      { payload: "hello-from-two", meta: { topic: "chat", source: "app-two", channel: "" } },
    ]);
    expect(twoReceived).toEqual([]);

    // Reverse direction with the bus facade app-one got from its runtime
    busOne.emit("chat", "hello-from-one");
    expect(twoReceived).toEqual([
      { payload: "hello-from-one", meta: { topic: "chat", source: "app-one", channel: "" } },
    ]);
    expect(oneReceived).toHaveLength(1); // no self-echo
  });

  it("channel views created during execute stay scoped between bootstrapped apps", async () => {
    const rootSpy = vi.fn();
    const cartSpy = vi.fn();

    await bootApp(kernel, "shop-ui", {
      execute(rt) {
        rt.bus!.on("item-added", rootSpy);
        rt.bus!.channel("cart").on("item-added", cartSpy);
      },
    });

    await bootApp(kernel, "shop-actions", {
      execute(rt) {
        rt.bus!.channel("cart").emit("item-added", { sku: "A1" });
      },
    });

    expect(rootSpy).not.toHaveBeenCalled();
    expect(cartSpy).toHaveBeenCalledTimes(1);
    expect(cartSpy).toHaveBeenCalledWith(
      { sku: "A1" },
      { topic: "item-added", source: "shop-actions", channel: "cart" },
    );
  });

  it("an RPC handler registered during one bootstrap serves a request made in a later bootstrap", async () => {
    const handlerMeta: any[] = [];
    let responseSeen: unknown;

    await bootApp(kernel, "math-provider", {
      execute(rt) {
        rt.bus!.handle("math.add", (payload: any, meta) => {
          handlerMeta.push(meta);
          return payload.a + payload.b;
        });
      },
    });

    await bootApp(kernel, "math-consumer", {
      async execute(rt) {
        responseSeen = await rt.bus!.request("math.add", { a: 2, b: 3 });
      },
    });

    expect(responseSeen).toBe(5);
    expect(handlerMeta).toEqual([{ topic: "math.add", source: "math-consumer", channel: "" }]);
  });

  it("a request issued during an early bootstrap resolves when a later app registers the handler", async () => {
    let pending: Promise<unknown> | undefined;

    // Must NOT await inside execute: bootstraps are serialized, so awaiting a
    // handler that only appears in the NEXT app's bootstrap would deadlock
    // until the request timeout. Late-loading providers are the normal case.
    await bootApp(kernel, "early-consumer", {
      execute(rt) {
        pending = rt.bus!.request("config.get", "theme", { timeout: 2000 });
      },
    });

    await bootApp(kernel, "late-provider", {
      execute(rt) {
        rt.bus!.handle("config.get", (key: any, meta) => ({ key, askedBy: meta.source }));
      },
    });

    await expect(pending!).resolves.toEqual({ key: "theme", askedBy: "early-consumer" });
  });

  it("initialize and execute receive the SAME bus facade, matching the kernel's cached per-app facade", async () => {
    const buses: any[] = [];

    const fynApp = await bootApp(kernel, "two-phase-app", {
      initialize(rt: FynUnitRuntime) {
        buses.push(rt.bus);
        return { status: "ready" };
      },
      execute(rt: FynUnitRuntime) {
        buses.push(rt.bus);
      },
    });

    expect(buses).toHaveLength(2);
    expect(buses[0]).toBeDefined();
    expect(buses[0]).toBe(buses[1]);
    // Facade identity is per name@version, not per runtime object: a freshly
    // created runtime still exposes the very same facade instance.
    expect(kernel.loader.mkRuntime(fynApp).bus).toBe(buses[0]);
  });
});

// ---------------------------------------------------------------------------
// 2. Middleware paths (Path A: useMiddleware + middleware coordination)
// ---------------------------------------------------------------------------
describe("FynBus in middleware call contexts", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("cc.runtime.bus works inside middleware setup and is the same facade the FynUnit executes with", async () => {
    const setupCCs: FynAppMiddlewareCallContext[] = [];
    const mwPing = vi.fn();
    const apply = vi.fn();
    const setup = vi.fn().mockImplementation(async (cc: FynAppMiddlewareCallContext) => {
      setupCCs.push(cc);
      // Subscribe from inside the middleware setup call context
      cc.runtime.bus!.on("mw-ping", mwPing);
      await cc.kernel.signalMiddlewareReady(cc);
      return { status: "ready" };
    });
    kernel.registerMiddleware(makeMwReg("mw-host", "bus-probe", { setup, apply }));

    const execRuntimes: FynUnitRuntime[] = [];
    const unit = useMiddleware(
      { info: { name: "bus-probe", provider: "mw-host", version: "^1.0.0" }, config: {} },
      { execute: (rt: FynUnitRuntime) => void execRuntimes.push(rt) },
    );

    await bootApp(kernel, "mw-user-one", unit);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(execRuntimes).toHaveLength(1);
    expect(setupCCs[0].runtime.bus).toBeDefined();
    // Middleware coordination reuses one runtime for setup, initialize, execute
    expect(execRuntimes[0].bus).toBe(setupCCs[0].runtime.bus);

    // The subscription made during setup is live after bootstrap
    kernel.bus.emit("mw-ping", { n: 1 });
    expect(mwPing).toHaveBeenCalledWith(
      { n: 1 },
      { topic: "mw-ping", source: KERNEL_BUS_SOURCE, channel: "" },
    );

    // FYM-143: a middleware whose setup signals ready and returns
    // { status: "ready" } gets apply() on this same first pass — the in-flight
    // cc is refreshed from the ready map right after the signal lands.
    expect(apply).toHaveBeenCalledTimes(1);
    expect(setupCCs[0].status).toBe("ready");
  });

  it("cc.runtime.bus works inside middleware apply for the next app using an already-ready middleware", async () => {
    const appliedSpy = vi.fn();
    const applyCCs: FynAppMiddlewareCallContext[] = [];
    const setup = vi.fn().mockImplementation(async (cc: FynAppMiddlewareCallContext) => {
      await cc.kernel.signalMiddlewareReady(cc);
      return { status: "ready" };
    });
    const apply = vi.fn().mockImplementation((cc: FynAppMiddlewareCallContext) => {
      applyCCs.push(cc);
      // Emit from inside the apply call context
      cc.runtime.bus!.emit("mw-applied", { app: cc.fynApp.name });
    });
    kernel.registerMiddleware(makeMwReg("mw-host", "bus-applier", { setup, apply }));
    kernel.bus.on("mw-applied", appliedSpy);

    const meta = { info: { name: "bus-applier", provider: "mw-host", version: "^1.0.0" }, config: {} };
    await bootApp(kernel, "mw-user-one", useMiddleware(meta, { execute: vi.fn() }));

    // Second app finds the middleware ready up front -> full setup + apply
    const execRuntimes: FynUnitRuntime[] = [];
    await bootApp(
      kernel,
      "mw-user-two",
      useMiddleware(meta, { execute: (rt: FynUnitRuntime) => void execRuntimes.push(rt) }),
    );

    // FYM-143: apply runs for BOTH apps — the first pass no longer skips it
    expect(apply).toHaveBeenCalledTimes(2);
    expect(applyCCs.map((cc) => cc.fynApp.name)).toEqual(["mw-user-one", "mw-user-two"]);
    // apply saw the same per-app facade the unit executed with
    expect(applyCCs[1].runtime.bus).toBe(execRuntimes[0].bus);
    // and each apply's emit was delivered, stamped with its consuming app as source
    expect(appliedSpy).toHaveBeenCalledTimes(2);
    expect(appliedSpy).toHaveBeenNthCalledWith(
      1,
      { app: "mw-user-one" },
      { topic: "mw-applied", source: "mw-user-one", channel: "" },
    );
    expect(appliedSpy).toHaveBeenNthCalledWith(
      2,
      { app: "mw-user-two" },
      { topic: "mw-applied", source: "mw-user-two", channel: "" },
    );
  });

  it("deferred mw: bus subscriptions from setup survive, execute runs with the same bus after resume", async () => {
    let deferredCC: FynAppMiddlewareCallContext | undefined;
    const earlySpy = vi.fn();
    const resumedSpy = vi.fn();
    const applyBuses: any[] = [];

    const setup = vi
      .fn()
      .mockImplementationOnce(async (cc: FynAppMiddlewareCallContext) => {
        deferredCC = cc;
        cc.runtime.bus!.on("early-news", earlySpy);
        return { status: "defer" };
      })
      .mockImplementation(async () => ({ status: "ready" }));
    const apply = vi
      .fn()
      .mockImplementation((cc: FynAppMiddlewareCallContext) => void applyBuses.push(cc.runtime.bus));
    kernel.registerMiddleware(makeMwReg("mw-host", "deferred-probe", { setup, apply }));
    kernel.bus.on("resumed-hello", resumedSpy);

    const initialize = vi.fn().mockReturnValue({ status: "ready" });
    const execRuntimes: FynUnitRuntime[] = [];
    const execute = vi.fn().mockImplementation((rt: FynUnitRuntime) => {
      execRuntimes.push(rt);
      rt.bus!.emit("resumed-hello", "made-it");
    });
    const unit = useMiddleware(
      { info: { name: "deferred-probe", provider: "mw-host", version: "^1.0.0" }, config: {} },
      { initialize, execute },
    );

    await bootApp(kernel, "deferred-app", unit);

    // Middleware deferred -> execute has not run yet
    expect(execute).not.toHaveBeenCalled();
    expect(deferredCC).toBeDefined();

    // Middleware later signals readiness through the kernel's programmatic API
    await kernel.signalMiddlewareReady(deferredCC!, { share: { token: "abc" } });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

    // Resumed flow ran apply + execute against the SAME runtime/bus as setup
    expect(applyBuses).toEqual([deferredCC!.runtime.bus]);
    expect(execRuntimes[0].bus).toBe(deferredCC!.runtime.bus);
    expect(execRuntimes[0].share).toEqual({ token: "abc" });
    // FYM-144: initialize is a one-time declaration — it ran on the deferred
    // pass and is NOT re-run on resume (same runtime object)
    expect(initialize).toHaveBeenCalledTimes(1);

    // The emit from inside the resumed execute reached the kernel-side subscriber
    expect(resumedSpy).toHaveBeenCalledWith(
      "made-it",
      { topic: "resumed-hello", source: "deferred-app", channel: "" },
    );

    // The subscription made during the deferred setup pass is still live
    kernel.bus.emit("early-news", 1);
    expect(earlySpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Concrete kernels
// ---------------------------------------------------------------------------
describe("FynBus on concrete kernels", () => {
  it("NodeKernel: kernel.bus and per-app runtime buses work with correct source stamping", async () => {
    // NodeKernel.loadFynApp uses a real dynamic import(), so we drive the same
    // internal flow it performs after import: loadFynAppBasics + bootstrapFynApp.
    const kernel = createNodeKernel();
    const kernelSideSpy = vi.fn();
    const appSideSpy = vi.fn();

    kernel.bus.on("from-app", kernelSideSpy);
    await bootApp(kernel, "node-app", {
      execute(rt) {
        rt.bus!.on("from-kernel", appSideSpy);
        rt.bus!.emit("from-app", "hello-node");
      },
    });

    // app -> kernel-side subscriber, stamped with the app name
    expect(kernelSideSpy).toHaveBeenCalledWith(
      "hello-node",
      { topic: "from-app", source: "node-app", channel: "" },
    );

    // kernel -> app subscriber, stamped with the kernel source
    kernel.bus.emit("from-kernel", 42);
    expect(appSideSpy).toHaveBeenCalledWith(
      42,
      { topic: "from-kernel", source: KERNEL_BUS_SOURCE, channel: "" },
    );
  });

  describe("BrowserKernel through the full Federation loadFynApp path", () => {
    const mockFederation = { import: vi.fn() };

    beforeEach(() => {
      (globalThis as any).Federation = mockFederation;
    });

    afterEach(() => {
      delete (globalThis as any).Federation;
    });

    it("two apps loaded via loadFynApp can message each other", async () => {
      const kernel = createBrowserKernel();
      const received: any[] = [];

      mockFederation.import.mockResolvedValueOnce(
        makeEntry("browser-one", "1.0.0", {
          execute(rt) {
            rt.bus!.on("greet", (payload, meta) => received.push({ payload, meta }));
          },
        }),
      );
      const appOne = await kernel.loadFynApp("http://cdn.test/browser-one");

      mockFederation.import.mockResolvedValueOnce(
        makeEntry("browser-two", "2.0.0", {
          execute(rt) {
            rt.bus!.emit("greet", "hi-from-two");
          },
        }),
      );
      const appTwo = await kernel.loadFynApp("http://cdn.test/browser-two");

      expect(appOne?.name).toBe("browser-one");
      expect(appTwo?.version).toBe("2.0.0");
      expect(mockFederation.import).toHaveBeenCalledWith(
        "http://cdn.test/browser-one/fynapp-entry.js",
      );
      expect(received).toEqual([
        { payload: "hi-from-two", meta: { topic: "greet", source: "browser-two", channel: "" } },
      ]);
    });

    it("loading the same app twice returns the existing instance without duplicating bus subscriptions", async () => {
      const kernel = createBrowserKernel();
      const dupSpy = vi.fn();
      const execute = vi.fn().mockImplementation((rt: FynUnitRuntime) => {
        rt.bus!.on("dup-topic", dupSpy);
      });
      const entry = makeEntry("browser-dup", "1.0.0", { execute });
      mockFederation.import.mockResolvedValue(entry);

      const first = await kernel.loadFynApp("http://cdn.test/browser-dup");
      const second = await kernel.loadFynApp("http://cdn.test/browser-dup");

      expect(first).not.toBeNull();
      expect(second).toBe(first);
      expect(execute).toHaveBeenCalledTimes(1);

      kernel.bus.emit("dup-topic", "once");
      expect(dupSpy).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Lifecycle events and the bus stay independent
// ---------------------------------------------------------------------------
describe("FynBus vs kernel lifecycle events", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("FYNAPP_BOOTSTRAPPED fires on kernel.events, never on the bus", async () => {
    const busSpy = vi.fn();
    const eventsSpy = vi.fn();

    await bootApp(kernel, "listener-app", {
      execute(rt) {
        rt.bus!.on("FYNAPP_BOOTSTRAPPED", busSpy);
      },
    });
    // self:true so even kernel-sourced bus traffic on this topic would be seen
    kernel.bus.on("FYNAPP_BOOTSTRAPPED", busSpy, { self: true });
    kernel.events.on("FYNAPP_BOOTSTRAPPED", eventsSpy);

    await bootApp(kernel, "second-app", { execute: vi.fn() });

    expect(eventsSpy).toHaveBeenCalledTimes(1);
    expect((eventsSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      name: "second-app",
      version: "1.0.0",
    });
    expect(busSpy).not.toHaveBeenCalled();
  });

  it("shutdownFynApp: unit.shutdown gets a working bus, then emits stop and FYNAPP_SHUTDOWN fires", async () => {
    const newsSpy = vi.fn();
    const farewellSpy = vi.fn();
    const shutdownEventSpy = vi.fn();
    let execBus: any;
    let shutdownBus: any;

    kernel.bus.on("farewell", farewellSpy);
    kernel.events.on("FYNAPP_SHUTDOWN", shutdownEventSpy);

    const unit: FynUnit = {
      execute(rt) {
        execBus = rt.bus;
        rt.bus!.on("news", newsSpy);
      },
      shutdown(rt) {
        shutdownBus = rt.bus;
        // The bus must still be usable inside shutdown (disposal happens after)
        rt.bus!.emit("farewell", "bye");
      },
    };
    await bootApp(kernel, "closing-app", unit);

    kernel.bus.emit("news", 1);
    expect(newsSpy).toHaveBeenCalledTimes(1);

    await expect(kernel.shutdownFynApp("closing-app")).resolves.toBe(true);

    // shutdown() ran against the same cached facade and could still emit
    expect(shutdownBus).toBe(execBus);
    expect(farewellSpy).toHaveBeenCalledWith(
      "bye",
      { topic: "farewell", source: "closing-app", channel: "" },
    );

    // Lifecycle event fired on kernel.events
    expect(shutdownEventSpy).toHaveBeenCalledTimes(1);
    expect((shutdownEventSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      name: "closing-app",
      version: "1.0.0",
    });

    // Subsequent emits are no longer delivered and the facade is dead
    kernel.bus.emit("news", 2);
    expect(newsSpy).toHaveBeenCalledTimes(1);
    expect(() => execBus.emit("x", 1)).toThrowError(
      expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
    );
  });

  it("shutting down one app leaves another bootstrapped app's subscriptions live", async () => {
    const survivorSpy = vi.fn();

    await bootApp(kernel, "doomed-app", {
      execute(rt) {
        rt.bus!.on("broadcast", vi.fn());
      },
    });
    await bootApp(kernel, "survivor-app", {
      execute(rt) {
        rt.bus!.on("broadcast", survivorSpy);
      },
    });

    await expect(kernel.shutdownFynApp("doomed-app")).resolves.toBe(true);

    kernel.bus.emit("broadcast", "still-on");
    expect(survivorSpy).toHaveBeenCalledTimes(1);
    expect(survivorSpy).toHaveBeenCalledWith(
      "still-on",
      { topic: "broadcast", source: KERNEL_BUS_SOURCE, channel: "" },
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Error resilience in real flows
// ---------------------------------------------------------------------------
describe("FynBus error resilience through bootstrap", () => {
  let kernel: FlowTestKernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  it("a FynUnit that throws after subscribing does not make bootstrapFynApp throw", async () => {
    const failSpy = vi.fn();
    const okSpy = vi.fn();
    kernel.events.on("FYNAPP_BOOTSTRAP_FAILED", failSpy);
    kernel.events.on("FYNAPP_BOOTSTRAPPED", okSpy);

    await expect(
      bootApp(kernel, "crashy-app", {
        execute(rt) {
          rt.bus!.on("crash-topic", vi.fn());
          throw new Error("execute boom");
        },
      }),
    ).resolves.toBeDefined();

    expect(failSpy).toHaveBeenCalledTimes(1);
    expect((failSpy.mock.calls[0][0] as CustomEvent).detail.name).toBe("crashy-app");
    expect(okSpy).not.toHaveBeenCalled();
  });

  it("a failed bootstrap deafens the app: its subscriptions are disposed (FYM-140)", async () => {
    const crashSub = vi.fn();

    await bootApp(kernel, "crashy-app", {
      execute(rt) {
        rt.bus!.on("crash-topic", crashSub);
        throw new Error("execute boom");
      },
    });

    // FYM-140: bootstrapFynApp's catch disposes the app's bus facade, so
    // subscriptions made before the throw receive nothing afterwards
    kernel.bus.emit("crash-topic", "leaked?");
    expect(crashSub).not.toHaveBeenCalled();

    // loadFynAppBasics registered the app, so shutdown still finds it and
    // the (already-disposed) bus cleanup is a safe no-op
    await expect(kernel.shutdownFynApp("crashy-app")).resolves.toBe(true);
    kernel.bus.emit("crash-topic", "after-shutdown");
    expect(crashSub).not.toHaveBeenCalled();
  });

  it("a failing bootstrap releases the lock so a concurrently deferred app still bootstraps and its bus works", async () => {
    const okSpy = vi.fn();

    const failApp = await kernel.loadFynAppBasics(
      makeEntry("fail-app", "1.0.0", {
        execute() {
          throw new Error("first app boom");
        },
      }),
    );
    const okUnit = {
      execute: vi.fn().mockImplementation((rt: FynUnitRuntime) => {
        rt.bus!.on("resumed", okSpy);
      }),
    };
    const okApp = await kernel.loadFynAppBasics(makeEntry("ok-app", "1.0.0", okUnit));

    // Start both: ok-app defers behind fail-app's bootstrap lock, then resumes
    // when FYNAPP_BOOTSTRAP_FAILED advances the deferred queue.
    await Promise.all([kernel.bootstrapFynApp(failApp), kernel.bootstrapFynApp(okApp)]);

    expect(okUnit.execute).toHaveBeenCalledTimes(1);
    kernel.bus.emit("resumed", "party-goes-on");
    expect(okSpy).toHaveBeenCalledWith(
      "party-goes-on",
      { topic: "resumed", source: KERNEL_BUS_SOURCE, channel: "" },
    );
  });
});
