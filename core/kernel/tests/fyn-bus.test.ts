import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FynBusRoot, KERNEL_BUS_SOURCE } from "../src/fyn-bus.js";
import { FynBusError, KernelErrorCode } from "../src/errors.js";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import type { FynApp } from "../src/types.js";
import type { KernelTelemetry } from "../src/types.js";

function createFakeTelemetry(): KernelTelemetry & {
  captured: any[];
  errors: any[];
} {
  const captured: any[] = [];
  const errors: any[] = [];
  const fake: any = {
    captured,
    errors,
    capture: (entry: any) => captured.push(entry),
    captureError: (name: string, data: any, error: unknown) =>
      errors.push({ name, data, error }),
    scope: () => fake,
    flush: () => {},
  };
  return fake;
}

describe("FynBus pub/sub", () => {
  let root: FynBusRoot;

  beforeEach(() => {
    root = new FynBusRoot();
  });

  it("delivers payload and meta to subscribers from other apps", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const appB = root.forApp("app-b", "1.0.0");
    const received: any[] = [];

    appB.on("greeting", (payload, meta) => received.push({ payload, meta }));
    appA.emit("greeting", { text: "hello" });

    expect(received).toHaveLength(1);
    expect(received[0].payload).toEqual({ text: "hello" });
    expect(received[0].meta).toEqual({
      topic: "greeting",
      source: "app-a",
      channel: "",
    });
  });

  it("filters own emits by default", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const handler = vi.fn();

    appA.on("ping", handler);
    appA.emit("ping", 1);

    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers own emits with { self: true }", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const handler = vi.fn();

    appA.on("ping", handler, { self: true });
    appA.emit("ping", 1);

    expect(handler).toHaveBeenCalledWith(1, {
      topic: "ping",
      source: "app-a",
      channel: "",
    });
  });

  it("once delivers exactly one message", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const appB = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();

    appB.once("tick", handler);
    appA.emit("tick", 1);
    appA.emit("tick", 2);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1, expect.anything());
  });

  it("once is not consumed by a self-filtered emit", () => {
    const appB = root.forApp("app-b", "1.0.0");
    const appA = root.forApp("app-a", "1.0.0");
    const handler = vi.fn();

    appB.once("tick", handler);
    appB.emit("tick", "self"); // filtered, must not consume the once
    appA.emit("tick", "other");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("other", expect.anything());
  });

  it("on returns an unsubscribe function", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const appB = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();

    const unsub = appB.on("data", handler);
    appA.emit("data", 1);
    unsub();
    appA.emit("data", 2);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes via AbortSignal", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const appB = root.forApp("app-b", "1.0.0");
    const handler = vi.fn();
    const ac = new AbortController();

    appB.on("data", handler, { signal: ac.signal });
    appA.emit("data", 1);
    ac.abort();
    appA.emit("data", 2);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("isolates handler errors: emit does not throw and other handlers still run", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const telemetry = createFakeTelemetry();
    const busRoot = new FynBusRoot(telemetry);
    const appA = busRoot.forApp("app-a", "1.0.0");
    const appB = busRoot.forApp("app-b", "1.0.0");
    const appC = busRoot.forApp("app-c", "1.0.0");
    const good = vi.fn();

    appB.on("boom", () => {
      throw new Error("bad handler");
    });
    appC.on("boom", good);

    expect(() => appA.emit("boom", 1)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(telemetry.errors).toHaveLength(1);
    expect(telemetry.errors[0].name).toBe("bus.handler");

    consoleSpy.mockRestore();
  });

  it("isolates channels from the root bus and from each other", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const appB = root.forApp("app-b", "1.0.0");
    const rootHandler = vi.fn();
    const cartHandler = vi.fn();
    const otherHandler = vi.fn();

    appB.on("update", rootHandler);
    appB.channel("cart").on("update", cartHandler);
    appB.channel("other").on("update", otherHandler);

    appA.channel("cart").emit("update", 1);

    expect(cartHandler).toHaveBeenCalledTimes(1);
    expect(cartHandler).toHaveBeenCalledWith(1, {
      topic: "update",
      source: "app-a",
      channel: "cart",
    });
    expect(rootHandler).not.toHaveBeenCalled();
    expect(otherHandler).not.toHaveBeenCalled();
  });

  it("rejects an empty channel name", () => {
    const appA = root.forApp("app-a", "1.0.0");
    expect(() => appA.channel("")).toThrow(FynBusError);
  });

  it("caches facades by name@version", () => {
    expect(root.forApp("app-a", "1.0.0")).toBe(root.forApp("app-a", "1.0.0"));
    expect(root.forApp("app-a", "1.0.0")).not.toBe(root.forApp("app-a", "2.0.0"));
  });

  it("filters messages between two versions of the same app (same source name)", () => {
    const v1 = root.forApp("app-a", "1.0.0");
    const v2 = root.forApp("app-a", "2.0.0");
    const handler = vi.fn();

    v2.on("ping", handler);
    v1.emit("ping", 1);

    expect(handler).not.toHaveBeenCalled();
  });

  it("stamps kernel facade emits with the kernel source", () => {
    const appA = root.forApp("app-a", "1.0.0");
    const kernelBus = root.forKernel();
    const received: any[] = [];

    appA.on("sys", (payload, meta) => received.push(meta.source));
    kernelBus.emit("sys", 1);

    expect(received).toEqual([KERNEL_BUS_SOURCE]);
  });

  it("captures telemetry for emits", () => {
    const telemetry = createFakeTelemetry();
    const busRoot = new FynBusRoot(telemetry);

    busRoot.forApp("app-a", "1.0.0").channel("cart").emit("update", { n: 1 });

    expect(telemetry.captured).toContainEqual({
      type: "event",
      name: "bus.emit",
      data: { topic: "update", channel: "cart", source: "app-a" },
    });
  });

  describe("dispose", () => {
    it("removes all subscriptions including channel views", () => {
      const appA = root.forApp("app-a", "1.0.0");
      const appB = root.forApp("app-b", "1.0.0");
      const rootHandler = vi.fn();
      const chanHandler = vi.fn();

      appB.on("data", rootHandler);
      appB.channel("cart").on("data", chanHandler);

      root.disposeApp("app-b", "1.0.0");
      appA.emit("data", 1);
      appA.channel("cart").emit("data", 1);

      expect(rootHandler).not.toHaveBeenCalled();
      expect(chanHandler).not.toHaveBeenCalled();
    });

    it("makes further use of the facade throw BUS_DISPOSED", () => {
      const appB = root.forApp("app-b", "1.0.0");
      const cart = appB.channel("cart");

      root.disposeApp("app-b", "1.0.0");

      for (const bus of [appB, cart]) {
        expect(() => bus.emit("x", 1)).toThrowError(
          expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
        );
        expect(() => bus.on("x", () => {})).toThrow(FynBusError);
      }
    });

    it("only disposes the matching version of an app", () => {
      const v1 = root.forApp("app-a", "1.0.0");
      const v2 = root.forApp("app-a", "2.0.0");
      const other = root.forApp("app-b", "1.0.0");
      const v2Handler = vi.fn();

      v2.on("data", v2Handler);
      root.disposeApp("app-a", "1.0.0");

      other.emit("data", 1);
      expect(v2Handler).toHaveBeenCalledTimes(1);
      expect(() => v1.emit("x", 1)).toThrow(FynBusError);
    });
  });
});

describe("FynBus kernel integration", () => {
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

  let kernel: TestKernel;

  beforeEach(() => {
    kernel = new TestKernel();
    kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
  });

  it("exposes kernel.bus stamped with the kernel source", () => {
    const appBus = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("app-a", "1.0.0"),
    ).bus!;
    const received: string[] = [];

    appBus.on("sys", (_payload, meta) => received.push(meta.source));
    kernel.bus.emit("sys", 1);

    expect(received).toEqual([KERNEL_BUS_SOURCE]);
  });

  it("provides runtime.bus stamped with the FynApp as source", () => {
    const runtimeA = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("app-a", "1.0.0"),
    );
    const runtimeB = kernel.moduleLoader.createFynUnitRuntime(
      createTestFynApp("app-b", "1.0.0"),
    );
    const received: any[] = [];

    runtimeB.bus!.on("msg", (payload, meta) => received.push({ payload, meta }));
    runtimeA.bus!.emit("msg", "hi");

    expect(received).toEqual([
      { payload: "hi", meta: { topic: "msg", source: "app-a", channel: "" } },
    ]);
  });

  it("reuses the same bus facade across runtime creations for an app", () => {
    const fynApp = createTestFynApp("app-a", "1.0.0");
    const r1 = kernel.moduleLoader.createFynUnitRuntime(fynApp);
    const r2 = kernel.moduleLoader.createFynUnitRuntime(fynApp);
    expect(r1.bus).toBe(r2.bus);
  });

  it("disposes an app's subscriptions on shutdownFynApp", async () => {
    const fynApp = createTestFynApp("app-a", "1.0.0");
    const rt = (kernel as any).runTime;
    rt.appsLoaded["app-a"] = fynApp;
    rt.appsLoaded["app-a@1.0.0"] = fynApp;

    const runtime = kernel.moduleLoader.createFynUnitRuntime(fynApp);
    const handler = vi.fn();
    runtime.bus!.on("data", handler);

    const ok = await kernel.shutdownFynApp("app-a");
    expect(ok).toBe(true);

    kernel.bus.emit("data", 1);
    expect(handler).not.toHaveBeenCalled();
    expect(() => runtime.bus!.emit("x", 1)).toThrow(FynBusError);
  });
});
