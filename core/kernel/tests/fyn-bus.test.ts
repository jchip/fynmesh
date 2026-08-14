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
    capErr: (name: string, data: any, error: unknown) =>
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
    const tel = createFakeTelemetry();
    const busRoot = new FynBusRoot(tel);
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
    expect(tel.errors).toHaveLength(1);
    expect(tel.errors[0].name).toBe("handler");

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

  it("captures tel for emits", () => {
    const tel = createFakeTelemetry();
    const busRoot = new FynBusRoot(tel);

    busRoot.forApp("app-a", "1.0.0").channel("cart").emit("update", { n: 1 });

    expect(tel.captured).toContainEqual({
      type: "event",
      name: "emit",
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

describe("FynBus request/response", () => {
  let root: FynBusRoot;

  beforeEach(() => {
    root = new FynBusRoot();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with a sync handler's return value", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.handle("sum", (payload: any) => payload.a + payload.b);

    await expect(consumer.request("sum", { a: 2, b: 3 })).resolves.toBe(5);
  });

  it("resolves with an async handler's value", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.handle("fetch", async () => "data");

    await expect(consumer.request("fetch")).resolves.toBe("data");
  });

  it("passes the requester's meta to the handler", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");
    const seen: any[] = [];

    provider.handle("who", (_payload, meta) => {
      seen.push(meta);
      return "ok";
    });
    await consumer.request("who", null);

    expect(seen).toEqual([{ topic: "who", source: "consumer", channel: "" }]);
  });

  it("rejects when the handler throws synchronously", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.handle("boom", () => {
      throw new Error("handler failed");
    });

    await expect(consumer.request("boom")).rejects.toThrow("handler failed");
  });

  it("rejects when the handler returns a rejected promise", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.handle("boom", async () => {
      throw new Error("async fail");
    });

    await expect(consumer.request("boom")).rejects.toThrow("async fail");
  });

  it("throws BUS_HANDLER_EXISTS on duplicate handle for the same topic", () => {
    const provider = root.forApp("provider", "1.0.0");
    provider.handle("dup", () => 1);

    expect(() => root.forApp("other", "1.0.0").handle("dup", () => 2)).toThrowError(
      expect.objectContaining({ code: KernelErrorCode.BUS_HANDLER_EXISTS }),
    );
  });

  it("frees the topic when the handler unsubscribes", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    const unsub = provider.handle("job", () => "v1");
    unsub();
    provider.handle("job", () => "v2");

    await expect(consumer.request("job")).resolves.toBe("v2");
  });

  it("parks a request until a late handler registers", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    const pending = consumer.request("late", 21);
    provider.handle("late", (n: any) => n * 2);

    await expect(pending).resolves.toBe(42);
  });

  it("releases all parked requests when the handler appears", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    const p1 = consumer.request("late", 1);
    const p2 = consumer.request("late", 2);
    provider.handle("late", (n: any) => n * 10);

    await expect(Promise.all([p1, p2])).resolves.toEqual([10, 20]);
  });

  it("rejects with BUS_REQUEST_TIMEOUT when no handler appears", async () => {
    vi.useFakeTimers();
    const consumer = root.forApp("consumer", "1.0.0");

    const pending = consumer.request("nobody", null);
    const assertion = expect(pending).rejects.toMatchObject({
      code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("honors a custom timeout", async () => {
    vi.useFakeTimers();
    const consumer = root.forApp("consumer", "1.0.0");
    const onRejected = vi.fn();

    consumer.request("nobody", null, { timeout: 50 }).catch(onRejected);
    await vi.advanceTimersByTimeAsync(49);
    expect(onRejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it("scopes handlers per channel", async () => {
    vi.useFakeTimers();
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.channel("cart").handle("total", () => 99);

    await expect(consumer.channel("cart").request("total")).resolves.toBe(99);

    const rootRequest = consumer.request("total", null, { timeout: 10 });
    const assertion = expect(rootRequest).rejects.toMatchObject({
      code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
    });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("unregisters an app's handlers on dispose", async () => {
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");

    provider.handle("job", () => "old");
    root.disposeApp("provider", "1.0.0");

    // Topic is free again for another provider
    root.forApp("provider2", "1.0.0").handle("job", () => "new");
    await expect(consumer.request("job")).resolves.toBe("new");
  });

  it("throws BUS_DISPOSED for request/handle on a disposed facade", () => {
    const app = root.forApp("app-a", "1.0.0");
    root.disposeApp("app-a", "1.0.0");

    expect(() => app.request("x")).toThrow(FynBusError);
    expect(() => app.handle("x", () => 1)).toThrow(FynBusError);
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
    kernel.initRunTime({ apps: {}, middlewares: {} });
  });

  it("exposes kernel.bus stamped with the kernel source", () => {
    const appBus = kernel.loader.mkRuntime(
      createTestFynApp("app-a", "1.0.0"),
    ).bus!;
    const received: string[] = [];

    appBus.on("sys", (_payload, meta) => received.push(meta.source));
    kernel.bus.emit("sys", 1);

    expect(received).toEqual([KERNEL_BUS_SOURCE]);
  });

  it("provides runtime.bus stamped with the FynApp as source", () => {
    const runtimeA = kernel.loader.mkRuntime(
      createTestFynApp("app-a", "1.0.0"),
    );
    const runtimeB = kernel.loader.mkRuntime(
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
    const r1 = kernel.loader.mkRuntime(fynApp);
    const r2 = kernel.loader.mkRuntime(fynApp);
    expect(r1.bus).toBe(r2.bus);
  });

  it("disposes an app's subscriptions on shutdownFynApp", async () => {
    const fynApp = createTestFynApp("app-a", "1.0.0");
    const rt = (kernel as any).runTime;
    rt.apps["app-a"] = fynApp;
    rt.apps["app-a@1.0.0"] = fynApp;

    const runtime = kernel.loader.mkRuntime(fynApp);
    const handler = vi.fn();
    runtime.bus!.on("data", handler);

    const ok = await kernel.shutdownFynApp("app-a");
    expect(ok).toBe(true);

    kernel.bus.emit("data", 1);
    expect(handler).not.toHaveBeenCalled();
    expect(() => runtime.bus!.emit("x", 1)).toThrow(FynBusError);
  });
});
