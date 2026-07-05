/**
 * FynBus lifecycle + kernel integration tests (FYM-139)
 *
 * Complements tests/fyn-bus.test.ts (pub/sub, request/response, basic kernel
 * integration). This file focuses on:
 *  - facade dispose edge cases and key-matching behavior
 *  - subscription bookkeeping across root + channel views
 *  - kernel wiring (construction timing, cross-kernel isolation, shutdown
 *    failure path)
 *  - telemetry entry names through the real KernelTelemetryImpl scope chain
 *    (regression coverage for the FYM-138 double-prefix bug)
 *  - runtime.bus integration via ModuleLoader
 *  - public exports from the package index
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  FynBusRoot,
  FynBusFacade,
  KERNEL_BUS_SOURCE,
  DEFAULT_REQUEST_TIMEOUT,
} from "../src/fyn-bus.js";
import { FynBusError, KernelErrorCode } from "../src/errors.js";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import { ModuleLoader } from "../src/modules/module-loader.js";
import * as kernelIndex from "../src/index.js";
import type { FynApp, TelemetryEntry, TelemetryTransport } from "../src/types.js";

class TestKernel extends FynMeshKernelCore {
  async loadFynApp(): Promise<FynApp | null> {
    return null;
  }
}

function createTestFynApp(name: string, version: string): FynApp {
  return {
    name,
    version,
    packageName: name,
    entry: { container: { name, version, $E: {} } } as any,
    exposes: {},
    middlewareContext: new Map(),
  } as any;
}

function createMockTransport() {
  const batches: TelemetryEntry[][] = [];
  const transport: TelemetryTransport = {
    async send(batch) {
      batches.push(batch);
    },
  };
  return { transport, batches };
}

// ---------------------------------------------------------------------------
// 1. Facade / dispose edge cases
// ---------------------------------------------------------------------------
describe("FynBus facade dispose edge cases", () => {
  let root: FynBusRoot;

  beforeEach(() => {
    root = new FynBusRoot();
  });

  it("dispose() called twice on the same facade is safe", () => {
    const app = root.forApp("app-a", "1.0.0") as FynBusFacade;
    const other = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();

    app.on("data", handler);
    app.dispose();
    expect(() => app.dispose()).not.toThrow();

    other.emit("data", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("disposeApp called twice for the same app is safe", () => {
    const app = root.forApp("app-a", "1.0.0");
    app.on("data", () => {});

    root.disposeApp("app-a", "1.0.0");
    expect(() => root.disposeApp("app-a", "1.0.0")).not.toThrow();
  });

  it("disposeApp for an app never seen is a no-op", () => {
    expect(() => root.disposeApp("never-registered", "1.0.0")).not.toThrow();
    expect(() => root.disposeApp("never-registered")).not.toThrow();
  });

  it("disposeApp with a version does NOT dispose a facade registered without a version", () => {
    // NOTE: possible bug — facade keys are exact-match ("name" vs "name@version"),
    // so a versioned disposeApp silently misses a version-less registration and
    // the app's subscriptions leak past its shutdown.
    const solo = root.forApp("solo-app");
    const other = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();
    solo.on("data", handler);

    root.disposeApp("solo-app", "1.0.0");

    // Facade is still fully alive: subscriptions deliver, emit does not throw
    other.emit("data", 1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(() => solo.emit("x", 1)).not.toThrow();
  });

  it("disposeApp without a version does NOT dispose a facade registered with a version", () => {
    // NOTE: possible bug — the reverse mismatch: version-less disposeApp("name")
    // cannot dispose "name@version" facades. Only exact key matches are disposed.
    const versioned = root.forApp("ver-app", "1.0.0");
    const other = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();
    versioned.on("data", handler);

    root.disposeApp("ver-app");

    other.emit("data", 1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(() => versioned.emit("x", 1)).not.toThrow();
  });

  it("forApp after disposeApp returns a fresh working facade", () => {
    const stale = root.forApp("app-a", "1.0.0");
    stale.on("data", () => {});
    root.disposeApp("app-a", "1.0.0");

    const fresh = root.forApp("app-a", "1.0.0");
    expect(fresh).not.toBe(stale);

    // New subscriptions on the fresh facade work
    const handler = vi.fn();
    fresh.on("data", handler);
    root.forApp("app-b", "1.0.0").emit("data", 42);
    expect(handler).toHaveBeenCalledWith(42, {
      topic: "data",
      source: "app-b",
      channel: "",
    });

    // The stale facade stays dead
    expect(() => stale.emit("x", 1)).toThrowError(
      expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
    );
  });

  it("all channel views created before dispose throw after dispose", () => {
    const app = root.forApp("app-a", "1.0.0");
    const cart = app.channel("cart");
    const orders = app.channel("orders");
    const cartAgain = app.channel("cart");

    root.disposeApp("app-a", "1.0.0");

    for (const view of [cart, orders, cartAgain]) {
      expect(() => view.emit("x", 1)).toThrowError(
        expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
      );
    }
  });

  it("a channel view kept from a disposed facade rejects every operation", () => {
    const app = root.forApp("app-a", "1.0.0");
    const view = app.channel("cart");

    root.disposeApp("app-a", "1.0.0");

    expect(() => view.emit("x", 1)).toThrow(FynBusError);
    expect(() => view.on("x", () => {})).toThrow(FynBusError);
    expect(() => view.once("x", () => {})).toThrow(FynBusError);
    expect(() => view.request("x")).toThrow(FynBusError);
    expect(() => view.handle("x", () => 1)).toThrow(FynBusError);
    // Creating further channel views from a disposed facade is also rejected
    expect(() => (view as FynBusFacade).channel("nested")).toThrow(FynBusError);
  });
});

// ---------------------------------------------------------------------------
// 2. Subscription bookkeeping
// ---------------------------------------------------------------------------
describe("FynBus subscription bookkeeping", () => {
  let root: FynBusRoot;

  beforeEach(() => {
    root = new FynBusRoot();
  });

  it("manual unsubscribe then dispose does not double-remove or throw", () => {
    const app = root.forApp("app-a", "1.0.0");
    const other = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();

    const unsub = app.on("data", handler);
    unsub();
    // Calling the returned unsubscribe again must also be safe
    expect(() => unsub()).not.toThrow();
    expect(() => root.disposeApp("app-a", "1.0.0")).not.toThrow();

    other.emit("data", 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a once() that already fired then dispose does not throw", () => {
    const app = root.forApp("app-a", "1.0.0");
    const other = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();

    const unsub = app.once("tick", handler);
    other.emit("tick", 1);
    expect(handler).toHaveBeenCalledTimes(1);

    // Calling the tracked unsubscribe after the once fired is safe
    expect(() => unsub()).not.toThrow();
    expect(() => root.disposeApp("app-a", "1.0.0")).not.toThrow();

    other.emit("tick", 2);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("dispose removes on/once subscriptions across root and several channels", () => {
    const app = root.forApp("app-a", "1.0.0");
    const other = root.forApp("app-b", "1.0.0");
    const rootOn = vi.fn();
    const rootOnce = vi.fn();
    const cartOn = vi.fn();
    const ordersOnce = vi.fn();

    app.on("data", rootOn);
    app.once("data", rootOnce);
    app.channel("cart").on("data", cartOn);
    app.channel("orders").once("data", ordersOnce);

    root.disposeApp("app-a", "1.0.0");

    other.emit("data", 1);
    other.channel("cart").emit("data", 1);
    other.channel("orders").emit("data", 1);

    expect(rootOn).not.toHaveBeenCalled();
    expect(rootOnce).not.toHaveBeenCalled();
    expect(cartOn).not.toHaveBeenCalled();
    expect(ordersOnce).not.toHaveBeenCalled();
  });

  it("dispose frees handled topics on root and channels for re-registration", async () => {
    const app = root.forApp("app-a", "1.0.0");
    app.handle("root-job", () => "old-root");
    app.channel("cart").handle("cart-job", () => "old-cart");
    app.channel("orders").handle("orders-job", () => "old-orders");

    root.disposeApp("app-a", "1.0.0");

    const successor = root.forApp("app-b", "1.0.0");
    expect(() => successor.handle("root-job", () => "new-root")).not.toThrow();
    expect(() =>
      successor.channel("cart").handle("cart-job", () => "new-cart"),
    ).not.toThrow();
    expect(() =>
      successor.channel("orders").handle("orders-job", () => "new-orders"),
    ).not.toThrow();

    const consumer = root.forApp("consumer", "1.0.0");
    await expect(consumer.request("root-job")).resolves.toBe("new-root");
    await expect(consumer.channel("cart").request("cart-job")).resolves.toBe("new-cart");
  });

  it("mixed on/once/handle across root + channels are ALL gone after dispose", async () => {
    const app = root.forApp("app-a", "1.0.0");
    const other = root.forApp("app-b", "1.0.0");
    const onHandler = vi.fn();
    const onceHandler = vi.fn();
    const chanHandler = vi.fn();

    app.on("evt", onHandler);
    app.once("evt", onceHandler);
    app.channel("cart").on("evt", chanHandler);
    app.handle("rpc", () => "app-a");
    app.channel("cart").handle("rpc", () => "app-a-cart");

    root.disposeApp("app-a", "1.0.0");

    // Emits deliver nothing
    other.emit("evt", 1);
    other.channel("cart").emit("evt", 1);
    expect(onHandler).not.toHaveBeenCalled();
    expect(onceHandler).not.toHaveBeenCalled();
    expect(chanHandler).not.toHaveBeenCalled();

    // Handled topics are free again and served by the new owner
    other.handle("rpc", () => "app-b");
    other.channel("cart").handle("rpc", () => "app-b-cart");
    const consumer = root.forApp("consumer", "1.0.0");
    await expect(consumer.request("rpc")).resolves.toBe("app-b");
    await expect(consumer.channel("cart").request("rpc")).resolves.toBe("app-b-cart");
  });
});

// ---------------------------------------------------------------------------
// 3. Kernel wiring
// ---------------------------------------------------------------------------
describe("FynBus kernel wiring", () => {
  it("kernel.bus works immediately after construction, before initRunTime", () => {
    const kernel = new TestKernel(); // no initRunTime on purpose
    expect(kernel.bus).toBeDefined();

    const runtime = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("early-app", "1.0.0"),
    );
    const received: string[] = [];
    runtime.bus!.on("boot", (_p, meta) => received.push(meta.source));

    kernel.bus.emit("boot", 1);
    expect(received).toEqual([KERNEL_BUS_SOURCE]);
  });

  it("two kernel instances have fully independent buses", () => {
    const kernelA = new TestKernel();
    const kernelB = new TestKernel();
    const handlerA = vi.fn();

    const runtimeA = kernelA.moduleLoader.createFynUnitRuntime(
      createTestFynApp("app-x", "1.0.0"),
    );
    runtimeA.bus!.on("shared-topic", handlerA);

    // Emits on kernel B never reach kernel A subscribers
    kernelB.bus.emit("shared-topic", "from-b");
    kernelB.moduleLoader
      .createFynUnitRuntime(createTestFynApp("app-y", "1.0.0"))
      .bus!.emit("shared-topic", "from-b-app");
    expect(handlerA).not.toHaveBeenCalled();

    // Same-kernel delivery still works
    kernelA.bus.emit("shared-topic", "from-a");
    expect(handlerA).toHaveBeenCalledTimes(1);
  });

  it("the same RPC topic can be handled independently on two kernels", async () => {
    const kernelA = new TestKernel();
    const kernelB = new TestKernel();

    const providerA = kernelA.moduleLoader.createFynUnitRuntime(
      createTestFynApp("provider", "1.0.0"),
    );
    const providerB = kernelB.moduleLoader.createFynUnitRuntime(
      createTestFynApp("provider", "1.0.0"),
    );

    providerA.bus!.handle("job", () => "kernel-a");
    // No BUS_HANDLER_EXISTS across kernels
    expect(() => providerB.bus!.handle("job", () => "kernel-b")).not.toThrow();

    await expect(kernelA.bus.request("job")).resolves.toBe("kernel-a");
    await expect(kernelB.bus.request("job")).resolves.toBe("kernel-b");
  });

  it("disposeApp cannot dispose the kernel facade", () => {
    // forKernel() facades are never stored in the per-app facade cache, so
    // disposeApp("kernel") is a no-op and kernel.bus stays alive.
    const kernel = new TestKernel();
    const busRoot = (kernel as any).busRoot as FynBusRoot;

    expect(() => busRoot.disposeApp(KERNEL_BUS_SOURCE)).not.toThrow();
    expect(() => kernel.bus.emit("still-alive", 1)).not.toThrow();
  });

  it("two forKernel() facades filter each other (same 'kernel' source)", () => {
    // NOTE: possible bug — every forKernel() call returns a new facade but all
    // of them share the "kernel" source, so kernel-side subscribers never hear
    // emits from other kernel-side facades unless they pass { self: true }.
    const kernel = new TestKernel();
    const busRoot = (kernel as any).busRoot as FynBusRoot;
    const otherKernelFacade = busRoot.forKernel();
    const handler = vi.fn();

    kernel.bus.on("sys", handler);
    otherKernelFacade.emit("sys", 1);
    expect(handler).not.toHaveBeenCalled();

    const selfAware = vi.fn();
    kernel.bus.on("sys", selfAware, { self: true });
    otherKernelFacade.emit("sys", 2);
    expect(selfAware).toHaveBeenCalledTimes(1);
  });

  describe("shutdownFynApp failure path", () => {
    let kernel: TestKernel;
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      kernel = new TestKernel();
      kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
      consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("disposes the app's bus even when a FynUnit shutdown() throws", async () => {
      const fynApp = createTestFynApp("crash-app", "1.0.0");
      fynApp.exposes = {
        "./main": {
          main: {
            shutdown() {
              throw new Error("shutdown boom");
            },
          },
        },
      } as any;
      const rt = (kernel as any).runTime;
      rt.appsLoaded["crash-app"] = fynApp;
      rt.appsLoaded["crash-app@1.0.0"] = fynApp;

      const runtime = kernel.moduleLoader.createFynUnitRuntime(fynApp);
      const subHandler = vi.fn();
      runtime.bus!.on("data", subHandler);
      runtime.bus!.channel("cart").on("data", subHandler);
      runtime.bus!.handle("crash-job", () => "old");

      const ok = await kernel.shutdownFynApp("crash-app");
      expect(ok).toBe(false);

      // Subscriptions are gone
      kernel.bus.emit("data", 1);
      kernel.bus.channel("cart").emit("data", 1);
      expect(subHandler).not.toHaveBeenCalled();

      // Handled topic is free again
      const successor = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("successor", "1.0.0"),
      );
      expect(() => successor.bus!.handle("crash-job", () => "new")).not.toThrow();
      await expect(kernel.bus.request("crash-job")).resolves.toBe("new");

      // The dead app's facade is disposed
      expect(() => runtime.bus!.emit("x", 1)).toThrowError(
        expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
      );
    });

    it("failed async shutdown() also disposes the bus and returns false", async () => {
      const fynApp = createTestFynApp("async-crash", "2.0.0");
      fynApp.exposes = {
        "./main": {
          main: {
            shutdown: vi.fn().mockRejectedValue(new Error("async shutdown boom")),
          },
        },
      } as any;
      const rt = (kernel as any).runTime;
      rt.appsLoaded["async-crash"] = fynApp;
      rt.appsLoaded["async-crash@2.0.0"] = fynApp;

      const runtime = kernel.moduleLoader.createFynUnitRuntime(fynApp);
      const handler = vi.fn();
      runtime.bus!.on("data", handler);

      await expect(kernel.shutdownFynApp("async-crash@2.0.0")).resolves.toBe(false);

      kernel.bus.emit("data", 1);
      expect(handler).not.toHaveBeenCalled();
      expect(() => runtime.bus!.on("x", () => {})).toThrow(FynBusError);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Telemetry through the kernel (KernelTelemetryImpl + scope("bus"))
// ---------------------------------------------------------------------------
describe("FynBus telemetry through the kernel", () => {
  let kernel: TestKernel;
  let batches: TelemetryEntry[][];

  beforeEach(() => {
    const mock = createMockTransport();
    batches = mock.batches;
    kernel = new TestKernel({ transport: mock.transport });
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
  });

  function flushEntries(): TelemetryEntry[] {
    kernel.telemetry.flush();
    return batches.flat();
  }

  it("emit via runtime.bus captures an entry named exactly 'bus.emit'", () => {
    const runtime = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("app-a", "1.0.0"),
    );
    runtime.bus!.emit("greeting", { hi: true });

    const entries = flushEntries();
    const emits = entries.filter((e) => e.name === "bus.emit");
    expect(emits).toHaveLength(1);
    expect(emits[0].type).toBe("event");
    expect(emits[0].data).toEqual({ topic: "greeting", channel: "", source: "app-a" });
  });

  it("request via kernel.bus captures an entry named exactly 'bus.request'", async () => {
    const provider = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("provider", "1.0.0"),
    );
    provider.bus!.handle("sum", (p: any) => p.a + p.b);

    await expect(kernel.bus.request("sum", { a: 1, b: 2 })).resolves.toBe(3);

    const entries = flushEntries();
    const requests = entries.filter((e) => e.name === "bus.request");
    expect(requests).toHaveLength(1);
    expect(requests[0].type).toBe("event");
    expect(requests[0].data).toEqual({
      topic: "sum",
      channel: "",
      source: KERNEL_BUS_SOURCE,
    });
  });

  it("handle registration captures an entry named exactly 'bus.handle'", () => {
    const runtime = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("provider", "1.0.0"),
    );
    runtime.bus!.channel("cart").handle("total", () => 99);

    const entries = flushEntries();
    const handles = entries.filter((e) => e.name === "bus.handle");
    expect(handles).toHaveLength(1);
    expect(handles[0].type).toBe("event");
    expect(handles[0].data).toEqual({ topic: "total", channel: "cart" });
  });

  it("never produces double-prefixed 'bus.bus.*' entries (FYM-138 regression)", async () => {
    const provider = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("provider", "1.0.0"),
    );
    const consumer = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("consumer", "1.0.0"),
    );

    provider.bus!.handle("job", () => "ok");
    await consumer.bus!.request("job");
    consumer.bus!.emit("evt", 1);
    kernel.bus.channel("cart").emit("evt", 2);

    const entries = flushEntries();
    const busEntries = entries.filter((e) => e.name.startsWith("bus."));
    expect(busEntries.length).toBeGreaterThanOrEqual(4);
    expect(busEntries.every((e) => !e.name.startsWith("bus.bus."))).toBe(true);
    // The three capture points come through with the single "bus." prefix
    const names = new Set(busEntries.map((e) => e.name));
    expect(names).toEqual(new Set(["bus.emit", "bus.request", "bus.handle"]));
  });

  it("handler errors surface as 'bus.handler' error entries with subscriber/topic data", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const subscriber = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("bad-sub", "1.0.0"),
    );
    subscriber.bus!.on("boom", () => {
      throw new Error("handler exploded");
    });

    expect(() => kernel.bus.emit("boom", 1)).not.toThrow();

    const entries = flushEntries();
    const errors = entries.filter((e) => e.name === "bus.handler");
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("error");
    expect(errors[0].data).toEqual({ topic: "boom", channel: "", subscriber: "bad-sub" });
    expect(errors[0].error!.message).toBe("handler exploded");

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. Runtime integration (ModuleLoader)
// ---------------------------------------------------------------------------
describe("FynBus runtime integration", () => {
  it("runtime.bus is undefined when ModuleLoader has no busProvider (backward compat)", () => {
    const bareLoader = new ModuleLoader();
    const runtime = bareLoader.createFynUnitRuntime(createTestFynApp("app-a", "1.0.0"));
    expect(runtime.bus).toBeUndefined();
  });

  describe("side-by-side versions of the same app", () => {
    let kernel: TestKernel;

    beforeEach(() => {
      kernel = new TestKernel();
      kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
    });

    it("gives two versions of the same app name different facade instances", () => {
      const v1 = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-a", "1.0.0"),
      );
      const v2 = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-a", "2.0.0"),
      );
      expect(v1.bus).toBeDefined();
      expect(v2.bus).toBeDefined();
      expect(v1.bus).not.toBe(v2.bus);
    });

    it("self-filters messages between two versions (same source name)", () => {
      const v1 = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-a", "1.0.0"),
      );
      const v2 = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-a", "2.0.0"),
      );
      const v1Handler = vi.fn();
      const v2Handler = vi.fn();

      v1.bus!.on("ping", v1Handler);
      v2.bus!.on("ping", v2Handler);
      v1.bus!.emit("ping", "from-v1");
      v2.bus!.emit("ping", "from-v2");

      // Both emits carry source "app-a", so both subscribers filter them out
      expect(v1Handler).not.toHaveBeenCalled();
      expect(v2Handler).not.toHaveBeenCalled();

      // A different app's emit reaches both versions
      kernel.moduleLoader
        .createFynUnitRuntime(createTestFynApp("app-b", "1.0.0"))
        .bus!.emit("ping", "from-b");
      expect(v1Handler).toHaveBeenCalledTimes(1);
      expect(v2Handler).toHaveBeenCalledTimes(1);
    });

    it("keeps v2's facade working after shutdownFynApp of v1", async () => {
      const fynAppV1 = createTestFynApp("app-a", "1.0.0");
      const fynAppV2 = createTestFynApp("app-a", "2.0.0");
      const rt = (kernel as any).runTime;
      rt.appsLoaded["app-a@1.0.0"] = fynAppV1;
      rt.appsLoaded["app-a@2.0.0"] = fynAppV2;

      const v1 = kernel.moduleLoader.createFynUnitRuntime(fynAppV1);
      const v2 = kernel.moduleLoader.createFynUnitRuntime(fynAppV2);
      const v2Handler = vi.fn();
      v2.bus!.on("data", v2Handler);
      v2.bus!.handle("v2-job", () => "v2-alive");
      v1.bus!.on("data", vi.fn());

      await expect(kernel.shutdownFynApp("app-a@1.0.0")).resolves.toBe(true);

      // v1 facade disposed, v2 untouched
      expect(() => v1.bus!.emit("x", 1)).toThrow(FynBusError);
      expect(() => v2.bus!.emit("still-here", 1)).not.toThrow();

      kernel.bus.emit("data", 1);
      expect(v2Handler).toHaveBeenCalledTimes(1);
      await expect(kernel.bus.request("v2-job")).resolves.toBe("v2-alive");
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Public exports
// ---------------------------------------------------------------------------
describe("FynBus public exports", () => {
  it("exports the bus API from the package index", () => {
    expect(kernelIndex.FynBusRoot).toBe(FynBusRoot);
    expect(kernelIndex.FynBusFacade).toBe(FynBusFacade);
    expect(kernelIndex.KERNEL_BUS_SOURCE).toBe(KERNEL_BUS_SOURCE);
    expect(kernelIndex.KERNEL_BUS_SOURCE).toBe("kernel");
    expect(kernelIndex.DEFAULT_REQUEST_TIMEOUT).toBe(DEFAULT_REQUEST_TIMEOUT);
    expect(kernelIndex.DEFAULT_REQUEST_TIMEOUT).toBe(10_000);
  });

  it("exports FynBusError and the BUS_* error codes from errors via the index", () => {
    expect(kernelIndex.FynBusError).toBe(FynBusError);
    expect(kernelIndex.KernelErrorCode).toBe(KernelErrorCode);
    expect(KernelErrorCode.BUS_DISPOSED).toBe(6001);
    expect(KernelErrorCode.BUS_INVALID_CHANNEL).toBe(6002);
    expect(KernelErrorCode.BUS_HANDLER_EXISTS).toBe(6003);
    expect(KernelErrorCode.BUS_REQUEST_TIMEOUT).toBe(6004);

    const err = new kernelIndex.FynBusError(
      KernelErrorCode.BUS_DISPOSED,
      "test",
      { source: "x" },
    );
    expect(err).toBeInstanceOf(FynBusError);
    expect(err.name).toBe("FynBusError");
    expect(err.code).toBe(KernelErrorCode.BUS_DISPOSED);
  });
});
