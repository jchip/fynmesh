/**
 * FynBus request/response (RPC) edge cases — FYM-139
 *
 * Complements tests/fyn-bus.test.ts (happy paths, basic timeout/park/dispose).
 * These tests pin edge behavior of requestFrom/registerHandler and the facade
 * request/handle: payload identity, self-RPC, concurrency isolation, handler
 * lifecycle races, park/flush details, timeout edges, duplicate-handler edges,
 * dispose-during-pending, and tel capture shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FynBusRoot, type FynBus } from "../src/fyn-bus.js";
import { FynBusError, KernelErrorCode } from "../src/errors.js";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("FynBus RPC edge cases", () => {
  let root: FynBusRoot;
  let provider: FynBus;
  let consumer: FynBus;

  beforeEach(() => {
    root = new FynBusRoot();
    provider = root.forApp("provider", "1.0.0");
    consumer = root.forApp("consumer", "1.0.0");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("payloads and results", () => {
    it("delivers undefined payload when request is called without one", async () => {
      const seen: unknown[] = [];
      provider.handle("void", (payload, meta) => {
        seen.push(payload);
        return meta.topic;
      });

      await expect(consumer.request("void")).resolves.toBe("void");
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBeUndefined();
    });

    it("resolves to undefined when the handler returns undefined", async () => {
      provider.handle("noop", () => undefined);

      await expect(consumer.request("noop", 1)).resolves.toBeUndefined();
    });

    it.each([
      ["null", null],
      ["zero", 0],
      ["empty string", ""],
      ["false", false],
    ] as const)("round-trips %s as both payload and response", async (label, value) => {
      const seen: unknown[] = [];
      provider.handle(`falsy:${label}`, (payload) => {
        seen.push(payload);
        return payload;
      });

      await expect(consumer.request(`falsy:${label}`, value)).resolves.toBe(value);
      expect(seen).toEqual([value]);
    });

    it("passes object payloads and results by reference (no cloning)", async () => {
      const payloadObj = { nested: { n: 1 } };
      const resultObj = { answer: 42 };
      let receivedPayload: unknown;
      provider.handle("ref", (payload) => {
        receivedPayload = payload;
        return resultObj;
      });

      const result = await consumer.request("ref", payloadObj);

      expect(receivedPayload).toBe(payloadObj);
      expect(result).toBe(resultObj);
    });

    it("flattens a handler returning Promise<Promise<T>> to T", async () => {
      provider.handle("nested", () => Promise.resolve(Promise.resolve("deep")));

      await expect(consumer.request("nested")).resolves.toBe("deep");
    });
  });

  describe("self-RPC", () => {
    it("lets an app request a topic it handles itself (no self-filtering for RPC)", async () => {
      // Pub/sub filters self-emits by default; RPC deliberately does not.
      const app = root.forApp("solo", "1.0.0");
      const seenMeta: any[] = [];
      app.handle("me", (n: any, meta) => {
        seenMeta.push(meta);
        return n + 1;
      });

      await expect(app.request("me", 1)).resolves.toBe(2);
      expect(seenMeta).toEqual([{ topic: "me", source: "solo", channel: "" }]);
    });

    it("releases a parked self-request when the same app registers the handler later", async () => {
      const app = root.forApp("solo", "1.0.0");

      const pending = app.request("later", 5);
      app.handle("later", (n: any) => n * 2);

      await expect(pending).resolves.toBe(10);
    });
  });

  describe("concurrency", () => {
    it("serves many concurrent requests through one sync handler, each with its own result", async () => {
      provider.handle("square", (n: any) => n * n);

      const ids = Array.from({ length: 20 }, (_, i) => i);
      const results = await Promise.all(ids.map((i) => consumer.request("square", i)));

      expect(results).toEqual(ids.map((i) => i * i));
    });

    it("routes each concurrent async response to its own request (reverse-order resolution)", async () => {
      const resolvers = new Map<number, (v: string) => void>();
      provider.handle(
        "job",
        (id: any) => new Promise<string>((res) => resolvers.set(id, res)),
      );

      const ids = [0, 1, 2, 3, 4];
      const promises = ids.map((id) => consumer.request<string>("job", id));
      expect(resolvers.size).toBe(5);

      // Resolve in reverse order — responses must not cross between requests
      for (const id of [...ids].reverse()) {
        resolvers.get(id)!(`result-${id}`);
      }

      await expect(Promise.all(promises)).resolves.toEqual(ids.map((id) => `result-${id}`));
    });

    it("keeps interleaved requests across topics and channels independent", async () => {
      provider.handle("alpha", (n: any) => `root-alpha-${n}`);
      provider.handle("beta", async (n: any) => `root-beta-${n}`);
      provider.channel("east").handle("alpha", (n: any) => `east-alpha-${n}`);
      provider.channel("west").handle("alpha", async (n: any) => `west-alpha-${n}`);

      const results = await Promise.all([
        consumer.request("alpha", 1),
        consumer.channel("east").request("alpha", 2),
        consumer.request("beta", 3),
        consumer.channel("west").request("alpha", 4),
        consumer.request("alpha", 5),
      ]);

      expect(results).toEqual([
        "root-alpha-1",
        "east-alpha-2",
        "root-beta-3",
        "west-alpha-4",
        "root-alpha-5",
      ]);
    });
  });

  describe("handler lifecycle races", () => {
    it("resolves an in-flight request after the handler unsubscribes", async () => {
      const d = deferred<string>();
      const unsub = provider.handle("slow", () => d.promise);

      const pending = consumer.request("slow");
      unsub();
      d.resolve("still-delivered");

      await expect(pending).resolves.toBe("still-delivered");
    });

    it("keeps the old handler's response for old in-flight requests after re-handle", async () => {
      const d = deferred<string>();
      const unsub = provider.handle("svc", () => d.promise);
      const oldPending = consumer.request("svc");

      unsub();
      root.forApp("provider2", "1.0.0").handle("svc", () => "new");

      await expect(consumer.request("svc")).resolves.toBe("new");

      d.resolve("old");
      await expect(oldPending).resolves.toBe("old");
    });

    it("does not disturb requests parked on topic B when topic A's handler registers", async () => {
      vi.useFakeTimers();

      const pendingB = consumer.request("topic-b", null, { timeout: 30 });
      const assertionB = expect(pendingB).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
      });

      provider.handle("topic-a", () => "a");
      await expect(consumer.request("topic-a")).resolves.toBe("a");

      await vi.advanceTimersByTimeAsync(30);
      await assertionB;
    });

    it("ignores a stale unsubscribe from a replaced handler (new handler stays registered)", async () => {
      const unsub1 = provider.handle("cfg", () => "v1");
      unsub1();
      root.forApp("provider2", "1.0.0").handle("cfg", () => "v2");

      unsub1(); // stale — must not remove the replacement handler
      unsub1(); // and calling it again is a no-op

      await expect(consumer.request("cfg")).resolves.toBe("v2");
    });
  });

  describe("park and flush", () => {
    it("rejects a parked request when the flushing handler throws synchronously", async () => {
      const pending = consumer.request("flaky");
      const assertion = expect(pending).rejects.toThrow("flush boom");

      // handle() itself must not throw when flushing a throwing handler
      expect(() =>
        provider.handle("flaky", () => {
          throw new Error("flush boom");
        }),
      ).not.toThrow();

      await assertion;
    });

    it("rejects a parked request when the flushing handler rejects asynchronously", async () => {
      const pending = consumer.request("flaky-async");
      const assertion = expect(pending).rejects.toThrow("async flush fail");

      provider.handle("flaky-async", async () => {
        throw new Error("async flush fail");
      });

      await assertion;
    });

    it("releases all parked requests in request order on registration", async () => {
      const handled: number[] = [];
      const promises = [1, 2, 3].map((n) => consumer.request("queue", n));

      provider.handle("queue", (n: any) => {
        handled.push(n);
        return n * 2;
      });

      await expect(Promise.all(promises)).resolves.toEqual([2, 4, 6]);
      expect(handled).toEqual([1, 2, 3]);
    });

    it("only flushes parked requests for the registering handler's channel", async () => {
      vi.useFakeTimers();

      const east = consumer.channel("east").request("stock", "e", { timeout: 30 });
      const west = consumer.channel("west").request("stock", "w", { timeout: 30 });
      const westAssertion = expect(west).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
        context: expect.objectContaining({ channel: "west" }),
      });

      provider.channel("east").handle("stock", (p: any) => `east:${p}`);
      await expect(east).resolves.toBe("east:e");

      await vi.advanceTimersByTimeAsync(30);
      await westAssertion;
    });

    it("parks and times out when the handler registered then unsubscribed before the request", async () => {
      vi.useFakeTimers();
      const unsub = provider.handle("ghost", () => 1);
      unsub();

      const pending = consumer.request("ghost", null, { timeout: 20 });
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
      });

      await vi.advanceTimersByTimeAsync(20);
      await assertion;
    });
  });

  describe("timeout edges", () => {
    it("timeout: 0 parks the request and rejects on the next timer tick, not synchronously", async () => {
      vi.useFakeTimers();
      const onRejected = vi.fn();
      consumer.request("instant", null, { timeout: 0 }).catch(onRejected);

      // Not a synchronous rejection: microtasks alone do not fire the timer
      await Promise.resolve();
      await Promise.resolve();
      expect(onRejected).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(0);
      expect(onRejected).toHaveBeenCalledTimes(1);
      expect(onRejected.mock.calls[0][0]).toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
        context: expect.objectContaining({ timeout: 0 }),
      });
      expect(onRejected.mock.calls[0][0].message).toContain("after 0ms");
    });

    it("a handler registered before timers advance rescues a timeout: 0 request", async () => {
      vi.useFakeTimers();

      const pending = consumer.request("instant", 5, { timeout: 0 });
      provider.handle("instant", (n: any) => n + 1);

      await expect(pending).resolves.toBe(6);
      // The cleared timer must not reject anything later
      await vi.advanceTimersByTimeAsync(10);
    });

    it("shapes the timeout error: FynBusError, code, message, and context fields", async () => {
      vi.useFakeTimers();

      const pending = consumer.channel("pay").request("charge", { amt: 1 }, { timeout: 75 });
      const captured = pending.catch((e) => e);
      await vi.advanceTimersByTimeAsync(75);
      const error = await captured;

      expect(error).toBeInstanceOf(FynBusError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("FynBusError");
      expect(error.code).toBe(KernelErrorCode.BUS_REQUEST_TIMEOUT);
      expect(error.message).toContain('"charge"');
      expect(error.message).toContain('"pay"');
      expect(error.message).toContain("75ms");
      expect(error.context).toEqual({
        topic: "charge",
        channel: "pay",
        source: "consumer",
        timeout: 75,
      });
    });

    it("does not deliver a timed-out request to a handler registered later, and fresh requests work", async () => {
      vi.useFakeTimers();

      const dead = consumer.request("late-reg", "dead-payload", { timeout: 50 });
      const assertion = expect(dead).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
      });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;

      const handler = vi.fn((p: any) => `ok:${p}`);
      provider.handle("late-reg", handler);
      // The dead request's waiter was cleaned up — the handler never sees it
      expect(handler).not.toHaveBeenCalled();

      // Waiters-map hygiene: a new request on the same topic works normally
      await expect(consumer.request("late-reg", "alive")).resolves.toBe("ok:alive");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("alive", expect.anything());
    });

    it("keeps other parked waiters intact when one times out on the same topic", async () => {
      vi.useFakeTimers();

      const short = consumer.request("mix", "short", { timeout: 10 });
      const long = consumer.request("mix", "long", { timeout: 1000 });
      const shortAssertion = expect(short).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
      });

      await vi.advanceTimersByTimeAsync(10);
      await shortAssertion;

      provider.handle("mix", (p: any) => `got:${p}`);
      await expect(long).resolves.toBe("got:long");
    });
  });

  describe("duplicate handler edges", () => {
    it("BUS_HANDLER_EXISTS carries topic and channel context", () => {
      provider.channel("pay").handle("charge", () => 1);

      let error: any;
      try {
        consumer.channel("pay").handle("charge", () => 2);
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(FynBusError);
      expect(error.code).toBe(KernelErrorCode.BUS_HANDLER_EXISTS);
      expect(error.message).toContain('"charge"');
      expect(error.message).toContain('"pay"');
      expect(error.context).toEqual({ topic: "charge", channel: "pay" });
    });

    it("keeps the first handler's unsubscribe working after a failed duplicate handle", async () => {
      const unsub = provider.handle("dup", () => "first");

      expect(() => consumer.handle("dup", () => "second")).toThrowError(
        expect.objectContaining({ code: KernelErrorCode.BUS_HANDLER_EXISTS }),
      );
      await expect(consumer.request("dup")).resolves.toBe("first");

      unsub();
      consumer.handle("dup", () => "second");
      await expect(provider.request("dup")).resolves.toBe("second");
    });

    it("handles the same topic independently on the root bus and on a channel", async () => {
      provider.handle("cfg", () => "root-val");
      expect(() => provider.channel("cart").handle("cfg", () => "cart-val")).not.toThrow();

      await expect(consumer.request("cfg")).resolves.toBe("root-val");
      await expect(consumer.channel("cart").request("cfg")).resolves.toBe("cart-val");
    });

    it("flushes parked requests when a new app registers after an unrelated app was disposed", async () => {
      // The disposed app never handled "svc" — its dispose must not touch the waiters
      const bystander = root.forApp("bystander", "1.0.0");
      bystander.handle("other-topic", () => 0);

      const p1 = consumer.request("svc", 1);
      const p2 = consumer.request("svc", 2);

      root.disposeApp("bystander", "1.0.0");
      root.forApp("newcomer", "1.0.0").handle("svc", (n: any) => n * 10);

      await expect(Promise.all([p1, p2])).resolves.toEqual([10, 20]);
    });
  });

  describe("dispose during pending", () => {
    it("rejects a parked request with BUS_DISPOSED when the requester's facade is disposed (FYM-140)", async () => {
      const pending = consumer.request("late-svc", 3);
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_DISPOSED,
        context: expect.objectContaining({ topic: "late-svc", source: "consumer" }),
      });

      root.disposeApp("consumer", "1.0.0");
      await assertion;

      // The dead waiter is gone: a handler registering later gets NO call
      // for the cancelled request, and fresh requests work normally
      const handler = vi.fn((n: any) => n * 7);
      provider.handle("late-svc", handler);
      expect(handler).not.toHaveBeenCalled();
      await expect(root.forApp("consumer2", "1.0.0").request("late-svc", 2)).resolves.toBe(14);
    });

    it("a parked request whose requester is disposed does not also fire its timeout", async () => {
      vi.useFakeTimers();

      const pending = consumer.request("gone", 1, { timeout: 40 });
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_DISPOSED,
      });

      root.disposeApp("consumer", "1.0.0");
      await assertion;
      // Timer was cleared by the cancellation — advancing is a no-op
      await vi.advanceTimersByTimeAsync(40);
    });

    it("delivers the response when the provider is disposed while its async handler is in flight", async () => {
      const d = deferred<string>();
      provider.handle("work", () => d.promise);

      const pending = consumer.request("work");
      root.disposeApp("provider", "1.0.0");

      // Dispose freed the topic for a new provider...
      expect(() => root.forApp("provider2", "1.0.0").handle("work", () => "new")).not.toThrow();

      // ...but the in-flight invocation still delivers its response
      d.resolve("done");
      await expect(pending).resolves.toBe("done");
    });

    it("rejects an in-flight request with BUS_DISPOSED when the REQUESTER is disposed (FYM-150)", async () => {
      const d = deferred<string>();
      let completed = false;
      provider.handle("work", async () => {
        const v = await d.promise;
        completed = true;
        return v;
      });

      const pending = consumer.request("work");
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_DISPOSED,
        context: expect.objectContaining({ topic: "work", source: "consumer" }),
      });

      root.disposeApp("consumer", "1.0.0");
      await assertion;

      // Dispose stopped the wait but did NOT cancel the handler — it runs
      // to completion and its result is discarded
      expect(completed).toBe(false);
      d.resolve("done");
      await d.promise;
      await new Promise((r) => setTimeout(r, 0));
      expect(completed).toBe(true);
    });

    it("throws BUS_DISPOSED for request/handle on a disposed facade's channel view", () => {
      const app = root.forApp("app-a", "1.0.0");
      const cart = app.channel("cart");
      root.disposeApp("app-a", "1.0.0");

      expect(() => cart.request("x")).toThrowError(
        expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
      );
      expect(() => cart.handle("x", () => 1)).toThrowError(
        expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
      );
    });
  });

  describe("request abort via options.signal (FYM-150)", () => {
    it("rejects a parked request with BUS_REQUEST_ABORTED on abort and frees the waiter", async () => {
      const ac = new AbortController();
      const pending = consumer.request("late-svc", 3, { signal: ac.signal });
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_ABORTED,
        context: expect.objectContaining({ topic: "late-svc", source: "consumer" }),
      });

      ac.abort();
      await assertion;

      // The aborted waiter is gone: a later handler gets NO call for it,
      // and fresh requests work normally
      const handler = vi.fn((n: any) => n * 7);
      provider.handle("late-svc", handler);
      expect(handler).not.toHaveBeenCalled();
      await expect(consumer.request("late-svc", 2)).resolves.toBe(14);
    });

    it("an aborted parked request does not also fire its timeout", async () => {
      vi.useFakeTimers();

      const ac = new AbortController();
      const pending = consumer.request("gone", 1, { timeout: 40, signal: ac.signal });
      const assertion = expect(pending).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_ABORTED,
      });

      ac.abort();
      await assertion;
      // Timer was cleared by the abort — advancing is a no-op
      await vi.advanceTimersByTimeAsync(40);
    });

    it("aborting one parked request leaves other waiters on the same topic parked", async () => {
      const ac = new AbortController();
      const aborted = consumer.request("shared", "a", { signal: ac.signal });
      const kept = consumer.request("shared", "b");

      ac.abort();
      await expect(aborted).rejects.toMatchObject({ code: KernelErrorCode.BUS_REQUEST_ABORTED });

      provider.handle("shared", (v: any) => `ok:${v}`);
      await expect(kept).resolves.toBe("ok:b");
    });

    it("stops waiting on an in-flight handler: rejects, handler still completes, result discarded", async () => {
      const d = deferred<string>();
      let completed = false;
      provider.handle("slow", async () => {
        const v = await d.promise;
        completed = true;
        return v;
      });

      const ac = new AbortController();
      const pending = consumer.request("slow", undefined, { signal: ac.signal });
      ac.abort();
      await expect(pending).rejects.toMatchObject({ code: KernelErrorCode.BUS_REQUEST_ABORTED });

      // Abort did not cancel the handler — it still runs to completion
      expect(completed).toBe(false);
      d.resolve("late");
      await d.promise;
      await new Promise((r) => setTimeout(r, 0));
      expect(completed).toBe(true);
    });

    it("a pre-aborted signal rejects without invoking a registered handler", async () => {
      const handler = vi.fn(() => "never");
      provider.handle("ready", handler);
      const ac = new AbortController();
      ac.abort();

      await expect(consumer.request("ready", 1, { signal: ac.signal })).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_ABORTED,
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("a pre-aborted signal rejects without parking a waiter", async () => {
      const ac = new AbortController();
      ac.abort();

      await expect(consumer.request("nobody", 1, { signal: ac.signal })).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_ABORTED,
      });

      // Nothing was parked: a later handler gets no call for it
      const handler = vi.fn(() => "x");
      provider.handle("nobody", handler);
      expect(handler).not.toHaveBeenCalled();
    });

    it("carries an Error abort reason through as the rejection's cause", async () => {
      const ac = new AbortController();
      const reason = new Error("user navigated away");
      const pending = consumer.request("why", 1, { signal: ac.signal });
      ac.abort(reason);

      const error = await pending.catch((e) => e);
      expect(error).toBeInstanceOf(FynBusError);
      expect(error.code).toBe(KernelErrorCode.BUS_REQUEST_ABORTED);
      expect(error.cause).toBe(reason);
    });

    it("wraps a non-Error abort reason so the cause chain stays Errors", async () => {
      const ac = new AbortController();
      const pending = consumer.request("why-str", 1, { signal: ac.signal });
      ac.abort("just because");

      const error = await pending.catch((e) => e);
      expect(error.code).toBe(KernelErrorCode.BUS_REQUEST_ABORTED);
      expect(error.cause).toBeInstanceOf(Error);
      expect((error.cause as Error).message).toBe("just because");
    });

    it("abort after the request settled is a no-op", async () => {
      provider.handle("fast", (n: any) => n + 1);
      const ac = new AbortController();

      await expect(consumer.request("fast", 1, { signal: ac.signal })).resolves.toBe(2);
      expect(() => ac.abort()).not.toThrow();
    });

    it("removes its abort hook from the signal once the request settles", async () => {
      provider.handle("hooked", () => "ok");
      const ac = new AbortController();
      const addSpy = vi.spyOn(ac.signal, "addEventListener");
      const removeSpy = vi.spyOn(ac.signal, "removeEventListener");

      await expect(consumer.request("hooked", 1, { signal: ac.signal })).resolves.toBe("ok");

      const added = addSpy.mock.calls.filter((c) => c[0] === "abort").map((c) => c[1]);
      const removed = removeSpy.mock.calls.filter((c) => c[0] === "abort").map((c) => c[1]);
      expect(added).toHaveLength(1);
      expect(removed).toContain(added[0]);
    });

    it("composes with AbortSignal.timeout() as a full response deadline", async () => {
      const d = deferred<string>();
      provider.handle("hung", () => d.promise);

      const error = await consumer
        .request("hung", 1, { signal: AbortSignal.timeout(20) })
        .catch((e) => e);

      expect(error.code).toBe(KernelErrorCode.BUS_REQUEST_ABORTED);
      expect((error.cause as Error).name).toBe("TimeoutError");
      d.resolve("too late");
    });
  });

  describe("tel", () => {
    it('captures unprefixed "request" and "handle" events with topic/channel data', async () => {
      const tel = createFakeTelemetry();
      const busRoot = new FynBusRoot(tel);
      const tProvider = busRoot.forApp("provider", "1.0.0");
      const tConsumer = busRoot.forApp("consumer", "1.0.0");

      tProvider.channel("cart").handle("total", () => 99);
      await tConsumer.channel("cart").request("total");

      // FYM-140: "handle" tel records the provider's identity too
      expect(tel.captured).toContainEqual({
        type: "event",
        name: "handle",
        data: { topic: "total", channel: "cart", source: "provider" },
      });
      expect(tel.captured).toContainEqual({
        type: "event",
        name: "request",
        data: { topic: "total", channel: "cart", source: "consumer" },
      });
    });

    it('captures "request" at call time even when the request parks', async () => {
      const tel = createFakeTelemetry();
      const busRoot = new FynBusRoot(tel);
      const tProvider = busRoot.forApp("provider", "1.0.0");
      const tConsumer = busRoot.forApp("consumer", "1.0.0");

      const pending = tConsumer.request("late");
      expect(tel.captured).toContainEqual({
        type: "event",
        name: "request",
        data: { topic: "late", channel: "", source: "consumer" },
      });

      tProvider.handle("late", () => 1);
      await expect(pending).resolves.toBe(1);
    });
  });
});
