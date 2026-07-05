/**
 * FynBus feature-composition tests (FYM-141)
 *
 * Complements the unit suites (tests/fyn-bus.test.ts, fyn-bus-pubsub-edge,
 * fyn-bus-rpc-edge, fyn-bus-lifecycle), which cover each feature in isolation.
 * This file pins CROSS-feature semantics: pub/sub, RPC (request/handle), and
 * channels interacting in one flow — emits from inside RPC handlers, requests
 * from inside subscribers, multi-hop RPC cascades, shared topic strings across
 * the two namespaces, channel-spanning compositions, multi-party patterns from
 * the design doc's demo scenario (FYM-18), once+RPC interplay, and the exact
 * source stamped on emits that originate inside an RPC handler.
 *
 * Where ordering matters, tests log into arrays and assert afterward, because
 * the bus swallows subscriber errors (a failing expect() inside a subscriber
 * would otherwise pass silently).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FynBusRoot } from "../src/fyn-bus.js";
import type { FynBus, FynBusMeta } from "../src/fyn-bus.js";
import { KernelErrorCode } from "../src/errors.js";

describe("FynBus feature composition", () => {
  let root: FynBusRoot;
  let appA: FynBus;
  let appB: FynBus;
  let appC: FynBus;
  let appD: FynBus;

  beforeEach(() => {
    root = new FynBusRoot();
    appA = root.forApp("app-a", "1.0.0");
    appB = root.forApp("app-b", "1.0.0");
    appC = root.forApp("app-c", "1.0.0");
    appD = root.forApp("app-d", "1.0.0");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Emit inside an RPC handler
  // -------------------------------------------------------------------------
  describe("emit inside an RPC handler", () => {
    it("delivers the handler's notification BEFORE the requester's promise resolves", async () => {
      // request() invokes an existing handler synchronously; emit() dispatches
      // synchronously. So the notification lands during the request() call
      // itself — before request() even returns to the caller — while the
      // promise resolves a microtask later.
      const order: string[] = [];

      appB.handle("checkout", (n: any) => {
        order.push(`handler:${n}`);
        appB.emit("checkout.done", n);
        return "ok";
      });
      // The REQUESTER subscribes: it hears the side-effect notification of its
      // own request (source is the handler app, not itself).
      appA.on("checkout.done", (n: any) => order.push(`notified:${n}`));

      const pending = appA.request("checkout", 7);
      order.push("request-returned");
      await pending.then((v) => order.push(`resolved:${v}`));

      expect(order).toEqual([
        "handler:7",
        "notified:7",
        "request-returned",
        "resolved:ok",
      ]);
    });

    it("does not recurse when the handler emits on the very topic it handles", async () => {
      // Pub/sub topics and RPC topics are independent namespaces: an emit on
      // "ping" never invokes the RPC handler for "ping".
      const handlerSpy = vi.fn((n: any) => {
        appB.emit("ping", n); // same topic string the handler serves
        return n + 1;
      });
      appB.handle("ping", handlerSpy);
      const subscriber = vi.fn();
      appA.on("ping", subscriber);

      await expect(appA.request("ping", 1)).resolves.toBe(2);

      expect(handlerSpy).toHaveBeenCalledTimes(1); // no loop
      expect(subscriber).toHaveBeenCalledTimes(1); // the emit still fanned out
      expect(subscriber).toHaveBeenCalledWith(1, {
        topic: "ping",
        source: "app-b",
        channel: "",
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. Request inside a subscriber
  // -------------------------------------------------------------------------
  describe("request inside a subscriber", () => {
    it("resolves a request issued during pub/sub delivery", async () => {
      appC.handle("lookup", (key: any) => `value:${key}`);
      let inFlight: Promise<unknown> | undefined;

      appB.on("need-data", (key: any) => {
        inFlight = appB.request("lookup", key);
      });
      appA.emit("need-data", "k1");

      expect(inFlight).toBeDefined();
      await expect(inFlight!).resolves.toBe("value:k1");
    });

    it("chains subscriber -> await request -> follow-up emit across four apps", async () => {
      // app-a emits an order; app-b's subscriber asks app-c to reserve stock,
      // awaits, then emits the confirmation which app-d observes.
      appC.handle("inventory.reserve", async (sku: any) => ({ sku, reserved: true }));
      const confirmed: Array<{ payload: unknown; source: string }> = [];
      appD.on("order.confirmed", (payload, meta) =>
        confirmed.push({ payload, source: meta.source }),
      );

      const chainDone = new Promise<void>((resolve) => {
        appB.on("order.placed", (sku: any) => {
          void appB.request("inventory.reserve", sku).then((result) => {
            appB.emit("order.confirmed", result);
            resolve();
          });
        });
      });

      appA.emit("order.placed", "sku-1");
      await chainDone;

      expect(confirmed).toEqual([
        { payload: { sku: "sku-1", reserved: true }, source: "app-b" },
      ]);
    });

    it("parks a request issued inside a subscriber until the handler registers later", async () => {
      let pending: Promise<unknown> | undefined;
      appB.on("boot", () => {
        pending = appB.request("config.get");
      });

      appA.emit("boot"); // no handler for config.get yet: the request parks
      appC.handle("config.get", () => ({ theme: "dark" }));

      await expect(pending!).resolves.toEqual({ theme: "dark" });
    });
  });

  // -------------------------------------------------------------------------
  // 3. RPC cascades
  // -------------------------------------------------------------------------
  describe("RPC cascades", () => {
    it("threads values end-to-end through a two-hop cascade", async () => {
      appC.handle("step2", (n: any) => n * 10);
      appB.handle("step1", async (n: any) => {
        const inner = await appB.request<number>("step2", n + 1);
        return inner + 5;
      });

      await expect(appA.request("step1", 2)).resolves.toBe(35); // (2+1)*10+5
    });

    it("stamps each hop with the IMMEDIATE requester as source, not the origin", async () => {
      const sources: Record<string, string> = {};
      appC.handle("step2", (n: any, meta) => {
        sources.step2 = meta.source;
        return n;
      });
      appB.handle("step1", (n: any, meta) => {
        sources.step1 = meta.source;
        return appB.request("step2", n);
      });

      await appA.request("step1", 1);

      expect(sources).toEqual({ step1: "app-a", step2: "app-b" });
    });

    it("propagates the innermost handler's error through an uncatching middle hop", async () => {
      appC.handle("step2", () => {
        throw new Error("inner boom");
      });
      appB.handle("step1", (n: any) => appB.request("step2", n)); // no catch

      await expect(appA.request("step1", 1)).rejects.toThrow("inner boom");
    });

    it("lets the middle hop catch the inner error and resolve the outer request", async () => {
      appC.handle("step2", async () => {
        throw new Error("inner boom");
      });
      appB.handle("step1", async (n: any) => {
        try {
          return await appB.request("step2", n);
        } catch {
          return "fallback";
        }
      });

      await expect(appA.request("step1", 1)).resolves.toBe("fallback");
    });

    it("rejects the outer request with the INNER request's timeout error", async () => {
      vi.useFakeTimers();
      // step1 has a handler so the outer request never parks (no outer timer);
      // step2 has none, so the inner request parks and times out.
      appB.handle("step1", (n: any) => appB.request("step2", n, { timeout: 100 }));

      const outer = appA.request("step1", 1);
      const assertion = expect(outer).rejects.toMatchObject({
        code: KernelErrorCode.BUS_REQUEST_TIMEOUT,
        context: expect.objectContaining({
          topic: "step2", // the inner topic, not "step1"
          source: "app-b", // the middle hop was the inner requester
          timeout: 100,
        }),
      });

      await vi.advanceTimersByTimeAsync(100);
      await assertion;
    });
  });

  // -------------------------------------------------------------------------
  // 4. Same topic string across features
  // -------------------------------------------------------------------------
  describe("same topic string on pub/sub and RPC", () => {
    it("emit on a topic invokes subscribers only, never the RPC handler", () => {
      const rpcHandler = vi.fn(() => "answer");
      const subscriber = vi.fn();
      appB.handle("x", rpcHandler);
      appC.on("x", subscriber);

      appA.emit("x", "broadcast");

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith("broadcast", expect.anything());
      expect(rpcHandler).not.toHaveBeenCalled();
    });

    it("request on a topic invokes the RPC handler only, never subscribers", async () => {
      const rpcHandler = vi.fn(() => "answer");
      const subscriber = vi.fn();
      appB.handle("x", rpcHandler);
      appC.on("x", subscriber);

      await expect(appA.request("x", "query")).resolves.toBe("answer");

      expect(rpcHandler).toHaveBeenCalledTimes(1);
      expect(rpcHandler).toHaveBeenCalledWith("query", expect.anything());
      expect(subscriber).not.toHaveBeenCalled();
    });

    it("emits on a topic neither satisfy nor disturb a parked request on that topic", async () => {
      const subscriber = vi.fn();
      appC.on("x", subscriber);

      const parked = appA.request("x", "req"); // no handler yet: parks
      appB.emit("x", "e1"); // pub/sub traffic on the same string

      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(subscriber).toHaveBeenCalledWith("e1", expect.anything());

      appB.handle("x", (p: any) => `answered:${p}`);
      await expect(parked).resolves.toBe("answered:req");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Channels + composition
  // -------------------------------------------------------------------------
  describe("channels + composition", () => {
    it("threads an RPC cascade from the root bus through channel 'a' to channel 'b'", async () => {
      appD.channel("b").handle("inner", (n: any) => n + 1);
      appC.channel("a").handle("mid", async (n: any) => {
        const r = await appC.channel("b").request<number>("inner", n * 2);
        return r * 10;
      });
      appB.handle("outer", async (n: any) => {
        const r = await appB.channel("a").request<number>("mid", n + 3);
        return `result:${r}`;
      });

      // ((1+3)*2 + 1) * 10 = 90
      await expect(appA.request("outer", 1)).resolves.toBe("result:90");
    });

    it("lets a subscriber on channel 'a' trigger a request on the root bus", async () => {
      const seenMeta: FynBusMeta[] = [];
      appC.handle("audit.log", (entry: any, meta) => {
        seenMeta.push(meta);
        return `logged:${entry}`;
      });

      let logged: Promise<unknown> | undefined;
      appB.channel("a").on("cart.update", (item: any) => {
        logged = appB.request("audit.log", item); // root request from channel delivery
      });
      appA.channel("a").emit("cart.update", "item-1");

      await expect(logged!).resolves.toBe("logged:item-1");
      // The request went out on the ROOT bus (channel "") stamped with the app
      expect(seenMeta).toEqual([{ topic: "audit.log", source: "app-b", channel: "" }]);
    });

    it("returns independent channel view objects whose subscriptions all work and all die on dispose", () => {
      const view1 = appB.channel("a");
      const view2 = appB.channel("a");
      expect(view1).not.toBe(view2); // a fresh view per channel() call

      const h1 = vi.fn();
      const h2 = vi.fn();
      view1.on("evt", h1);
      view2.on("evt", h2);

      appA.channel("a").emit("evt", 1);
      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(1);

      root.disposeApp("app-b", "1.0.0");
      appA.channel("a").emit("evt", 2);
      expect(h1).toHaveBeenCalledTimes(1); // no further deliveries
      expect(h2).toHaveBeenCalledTimes(1);

      // Both views share the disposed facade state
      for (const view of [view1, view2]) {
        expect(() => view.emit("evt", 3)).toThrowError(
          expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
        );
        expect(() => view.on("evt", () => {})).toThrowError(
          expect.objectContaining({ code: KernelErrorCode.BUS_DISPOSED }),
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Multi-party patterns (design doc demo scenario, FYM-18)
  // -------------------------------------------------------------------------
  describe("multi-party patterns", () => {
    it("fan-in: three apps emit to one collector with order and sources intact", () => {
      const collected: Array<{ payload: unknown; source: string }> = [];
      appD.on("report", (payload, meta) =>
        collected.push({ payload, source: meta.source }),
      );

      appA.emit("report", "a1");
      appB.emit("report", "b1");
      appC.emit("report", "c1");
      appA.emit("report", "a2");

      expect(collected).toEqual([
        { payload: "a1", source: "app-a" },
        { payload: "b1", source: "app-b" },
        { payload: "c1", source: "app-c" },
        { payload: "a2", source: "app-a" },
      ]);
    });

    it("fan-out: one emit reaches five apps exactly once each", () => {
      const spies = Array.from({ length: 5 }, (_, i) => {
        const spy = vi.fn();
        root.forApp(`listener-${i}`, "1.0.0").on("announce", spy);
        return spy;
      });

      appA.emit("announce", "hello");

      for (const spy of spies) {
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith("hello", {
          topic: "announce",
          source: "app-a",
          channel: "",
        });
      }
    });

    it("keeps a broadcast collector consistent with the query it answers", async () => {
      // One app both subscribes to a broadcast topic (accumulating state) and
      // handles a query about that state — the design doc's demo shape.
      const collector = root.forApp("collector", "1.0.0");
      const store: string[] = [];
      collector.on("item.added", (item: any) => store.push(item));
      collector.handle("items.query", () => [...store]);

      appA.emit("item.added", "apple");
      appB.emit("item.added", "banana");
      await expect(appC.request("items.query")).resolves.toEqual(["apple", "banana"]);

      // Composition subtlety: the collector's OWN emit is self-filtered by its
      // default self:false subscription, so it never enters the store and the
      // query answer stays consistent with what the subscriber collected.
      collector.emit("item.added", "ghost");
      appC.emit("item.added", "cherry");
      await expect(appA.request("items.query")).resolves.toEqual([
        "apple",
        "banana",
        "cherry",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 7. once + RPC
  // -------------------------------------------------------------------------
  describe("once + RPC", () => {
    it("fires exactly one request from a once() subscriber across repeated emits", async () => {
      const rpcSpy = vi.fn((n: any) => n * 2);
      appC.handle("compute", rpcSpy);

      let result: Promise<unknown> | undefined;
      appB.once("go", (n: any) => {
        result = appB.request("compute", n);
      });

      appA.emit("go", 21);
      appA.emit("go", 99); // once consumed: no second request

      await expect(result!).resolves.toBe(42);
      expect(rpcSpy).toHaveBeenCalledTimes(1);
      expect(rpcSpy).toHaveBeenCalledWith(21, expect.anything());
    });

    it("flushes requests parked BEFORE the emit when a once() callback registers the handler", async () => {
      const parked1 = appD.request("svc", 1);
      const parked2 = appD.request("svc", 2);

      appB.once("activate", () => {
        appB.handle("svc", (n: any) => n * 100);
      });

      appA.emit("activate");
      await expect(parked1).resolves.toBe(100);
      await expect(parked2).resolves.toBe(200);

      // once already consumed: a second emit cannot re-register the handler,
      // so no BUS_HANDLER_EXISTS can escape the (error-isolated) subscriber
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => appA.emit("activate")).not.toThrow();
      expect(consoleSpy).not.toHaveBeenCalled(); // the once handler never re-ran
      consoleSpy.mockRestore();

      // The registered handler stays live for fresh requests
      await expect(appD.request("svc", 3)).resolves.toBe(300);
    });

    it("invokes the parked handler synchronously inside handle(), inside the emit", async () => {
      const order: string[] = [];
      const parked = appD.request("svc", 5);

      appB.once("activate", () => {
        order.push("once");
        appB.handle("svc", (n: any) => {
          order.push("handler");
          return n;
        });
        order.push("after-handle");
      });

      appA.emit("activate");
      order.push("emit-returned");
      await parked.then((v) => order.push(`resolved:${v}`));

      // registerHandler flushes waiters synchronously, so the parked handler
      // runs inside handle() — but its RESULT still arrives as a microtask.
      expect(order).toEqual([
        "once",
        "handler",
        "after-handle",
        "emit-returned",
        "resolved:5",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Self-echo + composition
  // -------------------------------------------------------------------------
  describe("self-echo of emits from inside an RPC handler", () => {
    it("stamps the HANDLER app as source: its own self:false subscriber is silent, everyone else hears", async () => {
      // provider handles "job" and emits "job.done" from inside the handler
      // via its own facade — so the emit's source is "app-b" (the handler app),
      // NOT the requester.
      const providerHeard = vi.fn();
      const requesterHeard = vi.fn();
      const watcherHeard = vi.fn();

      appB.on("job.done", providerHeard); // default self:false — filtered
      appA.on("job.done", requesterHeard); // the requester still hears it
      appC.on("job.done", watcherHeard);

      appB.handle("job", (n: any) => {
        appB.emit("job.done", n);
        return "ok";
      });

      await expect(appA.request("job", 1)).resolves.toBe("ok");

      expect(providerHeard).not.toHaveBeenCalled();
      const expectedMeta = { topic: "job.done", source: "app-b", channel: "" };
      // The requester is NOT treated as the emit's source even though its
      // request caused the emit — source identity follows the emitting facade.
      expect(requesterHeard).toHaveBeenCalledTimes(1);
      expect(requesterHeard).toHaveBeenCalledWith(1, expectedMeta);
      expect(watcherHeard).toHaveBeenCalledTimes(1);
      expect(watcherHeard).toHaveBeenCalledWith(1, expectedMeta);
    });

    it("self-request: the app requesting its own handler still never hears its handler's emit without self:true", async () => {
      const selfFiltered = vi.fn();
      const selfAware = vi.fn();
      const watcherHeard = vi.fn();

      appB.on("job.done", selfFiltered); // self:false (default)
      appB.on("job.done", selfAware, { self: true });
      appC.on("job.done", watcherHeard);

      appB.handle("job", (n: any) => {
        appB.emit("job.done", n);
        return n + 1;
      });

      // RPC has no self-filtering: an app may request its own handler
      await expect(appB.request("job", 2)).resolves.toBe(3);

      expect(selfFiltered).not.toHaveBeenCalled();
      expect(selfAware).toHaveBeenCalledTimes(1);
      expect(selfAware).toHaveBeenCalledWith(2, {
        topic: "job.done",
        source: "app-b",
        channel: "",
      });
      expect(watcherHeard).toHaveBeenCalledTimes(1);
    });
  });
});
