/**
 * FynBus pub/sub edge cases (FYM-139)
 *
 * Complements tests/fyn-bus.test.ts (happy paths + request/response). This
 * file pins the pub/sub contract at its edges: payload shapes, dispatch-time
 * listener mutation (native EventTarget semantics), once/unsubscribe corner
 * cases, self-filtering subtleties, topic-name isolation, volume, and error
 * isolation. Where behavior is a consequence of the implementation rather
 * than the design doc, the test documents the ACTUAL behavior with a comment.
 */
import { describe, it, expect, vi } from "vitest";
import { FynBusRoot, KERNEL_BUS_SOURCE } from "../src/fyn-bus.js";
import type { FynBus, FynBusMeta } from "../src/fyn-bus.js";
import { FynMeshKernelCore } from "../src/kernel-core.js";
import type { FynApp } from "../src/types.js";

/** Standard two-party setup: appA emits, appB (and friends) subscribe */
function createParties() {
  const root = new FynBusRoot();
  return {
    root,
    appA: root.forApp("app-a", "1.0.0"),
    appB: root.forApp("app-b", "1.0.0"),
    appC: root.forApp("app-c", "1.0.0"),
    appD: root.forApp("app-d", "1.0.0"),
  };
}

describe("FynBus pub/sub edge cases", () => {
  describe("payload shapes", () => {
    it("delivers undefined when emit is called with no payload", () => {
      const { appA, appB } = createParties();
      const received: any[] = [];

      appB.on("bare", (payload, meta) => received.push({ payload, meta }));
      appA.emit("bare");

      expect(received).toHaveLength(1);
      expect(received[0].payload).toBeUndefined();
      // meta is still fully stamped even without a payload
      expect(received[0].meta).toEqual({ topic: "bare", source: "app-a", channel: "" });
    });

    it("delivers null as null (not coerced to undefined)", () => {
      const { appA, appB } = createParties();
      const received: any[] = [];

      appB.on("nil", (payload) => received.push(payload));
      appA.emit("nil", null);

      expect(received).toHaveLength(1);
      expect(received[0]).toBeNull();
    });

    it("delivers falsy primitives 0, empty string, and false unchanged", () => {
      const { appA, appB } = createParties();
      const received: any[] = [];

      appB.on("falsy", (payload) => received.push(payload));
      appA.emit("falsy", 0);
      appA.emit("falsy", "");
      appA.emit("falsy", false);

      expect(received).toEqual([0, "", false]);
      expect(received[0]).toBe(0);
      expect(received[1]).toBe("");
      expect(received[2]).toBe(false);
    });

    it("delivers nested objects and arrays structurally intact", () => {
      const { appA, appB } = createParties();
      const received: any[] = [];
      const payload = {
        list: [1, [2, 3], { deep: true }],
        nested: { a: { b: { c: "leaf" } } },
      };

      appB.on("deep", (p) => received.push(p));
      appA.emit("deep", payload);

      expect(received[0]).toEqual({
        list: [1, [2, 3], { deep: true }],
        nested: { a: { b: { c: "leaf" } } },
      });
    });

    it("delivers Map and Set instances usable as-is (no serialization)", () => {
      const { appA, appB } = createParties();
      const received: any[] = [];
      const map = new Map([["k", 42]]);
      const set = new Set(["x", "y"]);

      appB.on("collections", (p) => received.push(p));
      appA.emit("collections", { map, set });

      expect(received[0].map).toBeInstanceOf(Map);
      expect(received[0].map.get("k")).toBe(42);
      expect(received[0].set).toBeInstanceOf(Set);
      expect(received[0].set.has("y")).toBe(true);
    });

    it("preserves object identity: subscribers get the same reference, not a clone", () => {
      const { appA, appB, appC } = createParties();
      const seen: any[] = [];
      const payload = { marker: Symbol("id"), arr: [1, 2, 3] };

      appB.on("ref", (p) => seen.push(p));
      appC.on("ref", (p) => seen.push(p));
      appA.emit("ref", payload);

      expect(seen).toHaveLength(2);
      expect(seen[0]).toBe(payload); // same reference
      expect(seen[1]).toBe(payload); // every subscriber shares it
      expect(seen[0].arr).toBe(payload.arr);
    });
  });

  describe("multiple subscribers", () => {
    it("delivers in subscription order, even interleaved across apps", () => {
      const { appA, appB, appC } = createParties();
      const order: string[] = [];

      appB.on("seq", () => order.push("b1"));
      appC.on("seq", () => order.push("c1"));
      appB.on("seq", () => order.push("b2"));
      appC.on("seq", () => order.push("c2"));
      appA.emit("seq", 1);

      expect(order).toEqual(["b1", "c1", "b2", "c2"]);
    });

    it("invokes the same handler function twice when subscribed via two on() calls", () => {
      // Documented actual behavior: each on() wraps the handler in a fresh
      // internal listener, so the native EventTarget same-callback dedupe
      // does NOT apply — the handler runs once per subscription.
      const { appA, appB } = createParties();
      const handler = vi.fn();

      appB.on("dup", handler);
      appB.on("dup", handler);
      appA.emit("dup", 1);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("removes duplicate-handler subscriptions independently", () => {
      const { appA, appB } = createParties();
      const handler = vi.fn();

      const unsub1 = appB.on("dup", handler);
      appB.on("dup", handler);
      unsub1();
      appA.emit("dup", 1);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("delivers one emit to 50 subscribers", () => {
      const { appA, appB } = createParties();
      const handlers = Array.from({ length: 50 }, () => vi.fn());

      for (const h of handlers) {
        appB.on("fanout", h);
      }
      appA.emit("fanout", "boom");

      for (const h of handlers) {
        expect(h).toHaveBeenCalledTimes(1);
        expect(h).toHaveBeenCalledWith("boom", expect.anything());
      }
    });

    it("unsubscribing one subscriber leaves the others intact and in order", () => {
      const { appA, appB, appC, appD } = createParties();
      const order: string[] = [];

      appB.on("keep", () => order.push("b"));
      const unsubC = appC.on("keep", () => order.push("c"));
      appD.on("keep", () => order.push("d"));

      unsubC();
      appA.emit("keep", 1);

      expect(order).toEqual(["b", "d"]);
    });

    it("shares one meta object per emit: a mutating subscriber is visible to later ones", () => {
      // Documented actual behavior (same-realm, by-reference messaging): the
      // meta object is created once per emit and handed to every subscriber.
      // A subscriber that mutates it leaks the mutation downstream.
      const { appA, appB, appC } = createParties();
      const metas: FynBusMeta[] = [];

      appB.on("meta-share", (_p, meta) => {
        (meta as any).tampered = true;
        metas.push(meta);
      });
      appC.on("meta-share", (_p, meta) => metas.push(meta));
      appA.emit("meta-share", 1);

      expect(metas[0]).toBe(metas[1]);
      expect((metas[1] as any).tampered).toBe(true);
    });
  });

  describe("dispatch-time listener mutation", () => {
    it("lets a subscriber unsubscribe itself during delivery; it gets the in-flight emit only", () => {
      const { appA, appB, appC } = createParties();
      const selfRemover = vi.fn(() => unsub());
      const bystander = vi.fn();

      const unsub = appB.on("shrink", selfRemover);
      appC.on("shrink", bystander);

      appA.emit("shrink", 1);
      appA.emit("shrink", 2);

      expect(selfRemover).toHaveBeenCalledTimes(1);
      expect(bystander).toHaveBeenCalledTimes(2);
    });

    it("skips a later subscriber removed during delivery (EventTarget semantics)", () => {
      // Per the DOM dispatch algorithm, a listener removed while the event is
      // being dispatched is NOT invoked for that event if it hasn't run yet.
      const { appA, appB, appC } = createParties();
      const victim = vi.fn();

      appB.on("cull", () => unsubVictim());
      const unsubVictim = appC.on("cull", victim);

      appA.emit("cull", 1);

      expect(victim).not.toHaveBeenCalled();
    });

    it("does not deliver the in-flight emit to a subscriber added during delivery", () => {
      const { appA, appB, appC } = createParties();
      const lateHandler = vi.fn();
      let added = false;

      appB.on("grow", () => {
        if (!added) {
          added = true;
          appC.on("grow", lateHandler);
        }
      });

      appA.emit("grow", "first"); // lateHandler registered mid-dispatch: skipped
      expect(lateHandler).not.toHaveBeenCalled();

      appA.emit("grow", "second"); // subsequent emits reach it
      expect(lateHandler).toHaveBeenCalledTimes(1);
      expect(lateHandler).toHaveBeenCalledWith("second", expect.anything());
    });

    it("delivers a reentrant emit to another topic synchronously, depth-first", () => {
      const { appA, appB, appC } = createParties();
      const log: string[] = [];

      appB.on("chain", (n: any) => {
        log.push(`b:${n}`);
        if (n < 1) {
          appB.emit("chain", n + 1); // reentrant emit of the SAME topic
        }
      });
      appC.on("chain", (n: any) => log.push(`c:${n}`));

      appA.emit("chain", 0);

      // Nested dispatch completes before the outer dispatch resumes:
      // b receives 0, re-emits 1 (b's own handler is self-filtered, c gets 1),
      // then the outer dispatch delivers 0 to c.
      expect(log).toEqual(["b:0", "c:1", "c:0"]);
    });

    it("supports guarded self-reentrant emits on the same topic without infinite looping", () => {
      const { root, appA } = createParties();
      const appB = root.forApp("app-b", "1.0.0");
      const calls: number[] = [];

      appB.on(
        "loop",
        (n: any) => {
          calls.push(n);
          if (n < 3) {
            appB.emit("loop", n + 1); // guard: stop at 3
          }
        },
        { self: true },
      );

      appA.emit("loop", 0);

      expect(calls).toEqual([0, 1, 2, 3]);
    });
  });

  describe("once edges", () => {
    it("never fires a once whose unsubscribe was called before any delivery", () => {
      const { appA, appB } = createParties();
      const handler = vi.fn();

      const unsub = appB.once("never", handler);
      unsub();
      appA.emit("never", 1);

      expect(handler).not.toHaveBeenCalled();
    });

    it("never fires a once aborted via AbortSignal before delivery; abort after fire is harmless", () => {
      const { appA, appB } = createParties();
      const aborted = vi.fn();
      const fired = vi.fn();
      const ac1 = new AbortController();
      const ac2 = new AbortController();

      appB.once("sig", aborted, { signal: ac1.signal });
      ac1.abort();
      appB.once("sig", fired, { signal: ac2.signal });

      appA.emit("sig", 1);
      expect(aborted).not.toHaveBeenCalled();
      expect(fired).toHaveBeenCalledTimes(1);

      expect(() => ac2.abort()).not.toThrow(); // once already consumed
      appA.emit("sig", 2);
      expect(fired).toHaveBeenCalledTimes(1);
    });

    it("fires two once() subscriptions for the same topic on one emit", () => {
      const { appA, appB, appC } = createParties();
      const h1 = vi.fn();
      const h2 = vi.fn();

      appB.once("both", h1);
      appC.once("both", h2);
      appA.emit("both", "x");
      appA.emit("both", "y");

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h1).toHaveBeenCalledWith("x", expect.anything());
      expect(h2).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledWith("x", expect.anything());
    });

    it("still consumes a once whose handler throws (next emit not delivered, emit does not throw)", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appA, appB } = createParties();
      const handler = vi.fn(() => {
        throw new Error("once boom");
      });

      appB.once("explode", handler);

      expect(() => appA.emit("explode", 1)).not.toThrow();
      appA.emit("explode", 2);

      expect(handler).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });

    it("treats unsubscribe called after the once already fired as a no-op", () => {
      const { appA, appB } = createParties();
      const handler = vi.fn();
      const other = vi.fn();

      const unsub = appB.once("done", handler);
      appB.on("done", other);
      appA.emit("done", 1);

      expect(() => unsub()).not.toThrow();
      expect(() => unsub()).not.toThrow();

      appA.emit("done", 2);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(2); // untouched by the stale unsub
    });
  });

  describe("unsubscribe edges", () => {
    it("tolerates calling unsubscribe twice", () => {
      const { appA, appB, appC } = createParties();
      const handler = vi.fn();
      const survivor = vi.fn();

      const unsub = appB.on("twice", handler);
      appC.on("twice", survivor);

      unsub();
      expect(() => unsub()).not.toThrow();

      appA.emit("twice", 1);
      expect(handler).not.toHaveBeenCalled();
      expect(survivor).toHaveBeenCalledTimes(1);
    });

    it("tolerates unsubscribe + signal abort in either order", () => {
      const { appA, appB } = createParties();
      const h1 = vi.fn();
      const h2 = vi.fn();
      const ac1 = new AbortController();
      const ac2 = new AbortController();

      // abort first, then call the returned unsubscribe
      const unsub1 = appB.on("both-ways", h1, { signal: ac1.signal });
      ac1.abort();
      expect(() => unsub1()).not.toThrow();

      // unsubscribe first, then abort
      const unsub2 = appB.on("both-ways", h2, { signal: ac2.signal });
      unsub2();
      expect(() => ac2.abort()).not.toThrow();

      appA.emit("both-ways", 1);
      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });

    it("never subscribes when given a pre-aborted AbortSignal", () => {
      const { appA, appB } = createParties();
      const handler = vi.fn();
      const ac = new AbortController();
      ac.abort();

      const unsub = appB.on("stillborn", handler, { signal: ac.signal });
      appA.emit("stillborn", 1);

      expect(handler).not.toHaveBeenCalled();
      expect(() => unsub()).not.toThrow(); // returned unsubscribe stays harmless
    });
  });

  describe("self-filtering edges", () => {
    it("filters the kernel facade's own emits by default; {self:true} delivers with source kernel", () => {
      const root = new FynBusRoot();
      const kernelBus = root.forKernel();
      const filtered = vi.fn();
      const selfAware = vi.fn();

      kernelBus.on("sys", filtered);
      kernelBus.on("sys", selfAware, { self: true });
      kernelBus.emit("sys", 1);

      expect(filtered).not.toHaveBeenCalled();
      expect(selfAware).toHaveBeenCalledTimes(1);
      expect(selfAware).toHaveBeenCalledWith(1, {
        topic: "sys",
        source: KERNEL_BUS_SOURCE,
        channel: "",
      });
    });

    it("filters between two separate forKernel() facades (filtering is by source name, not instance)", () => {
      // Documented actual behavior: forKernel() returns a NEW facade per call,
      // but every kernel facade stamps source "kernel", and self-filtering
      // compares source names. So two distinct kernel-side facades cannot hear
      // each other without { self: true } — e.g. host page and middleware both
      // using their own forKernel() handle.
      const root = new FynBusRoot();
      const kb1 = root.forKernel();
      const kb2 = root.forKernel();
      expect(kb1).not.toBe(kb2);

      const deaf = vi.fn();
      const withSelf = vi.fn();
      kb1.on("cross", deaf);
      kb1.on("cross", withSelf, { self: true });
      kb2.emit("cross", 1);

      expect(deaf).not.toHaveBeenCalled();
      expect(withSelf).toHaveBeenCalledTimes(1);
    });

    it("self-filters consistently across the cached facade and its channel views", () => {
      const root = new FynBusRoot();
      const a1 = root.forApp("app-a", "1.0.0");
      const a2 = root.forApp("app-a", "1.0.0"); // cached: same facade instance
      const other = root.forApp("app-b", "1.0.0");
      const handler = vi.fn();

      a1.channel("cart").on("update", handler);

      // Emits from any view of the same app@version are self-filtered
      a1.channel("cart").emit("update", 1);
      a2.channel("cart").emit("update", 2);
      expect(handler).not.toHaveBeenCalled();

      // ...while another app's emit on the same channel is delivered
      other.channel("cart").emit("update", 3);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(3, {
        topic: "update",
        source: "app-b",
        channel: "cart",
      });
    });
  });

  describe("topics", () => {
    it("emitting on a topic with no subscribers is a silent no-op", () => {
      const { appA } = createParties();
      expect(() => appA.emit("nobody-home", { any: "thing" })).not.toThrow();
    });

    it("round-trips topic names with special characters", () => {
      const { appA, appB } = createParties();
      const topics = ["a.b:c/d e", "  spaces  ", "emoji-🚀/π", "with\"quotes'"];
      const received: string[] = [];

      for (const topic of topics) {
        appB.on(topic, (_p, meta) => received.push(meta.topic));
      }
      for (const topic of topics) {
        appA.emit(topic, 1);
      }

      expect(received).toEqual(topics);
    });

    it("keeps distinct special-character topics isolated from each other", () => {
      const { appA, appB } = createParties();
      const hit = vi.fn();
      const miss = vi.fn();

      appB.on("a.b:c/d e", hit);
      appB.on("a.b:c/d", miss); // prefix of the above, must not match

      appA.emit("a.b:c/d e", 1);

      expect(hit).toHaveBeenCalledTimes(1);
      expect(miss).not.toHaveBeenCalled();
    });

    it("supports very long topic names", () => {
      const { appA, appB } = createParties();
      const longTopic = "t/".repeat(2500) + "end"; // ~5k chars
      const handler = vi.fn();

      appB.on(longTopic, handler);
      appA.emit(longTopic, "big");

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith("big", expect.objectContaining({ topic: longTopic }));
    });

    it("does not deliver a root-bus emit to a channel subscriber of the same topic", () => {
      // Reverse direction of the existing channel-isolation test: emit on the
      // ROOT, subscribe on a channel.
      const { appA, appB } = createParties();
      const chanHandler = vi.fn();
      const rootHandler = vi.fn();

      appB.channel("cart").on("update", chanHandler);
      appB.on("update", rootHandler);

      appA.emit("update", 1);

      expect(rootHandler).toHaveBeenCalledTimes(1);
      expect(chanHandler).not.toHaveBeenCalled();
    });
  });

  describe("volume", () => {
    it("delivers 1000 emits to a subscriber in order", () => {
      const { appA, appB } = createParties();
      const received: number[] = [];

      appB.on("firehose", (n: any) => received.push(n));
      for (let i = 0; i < 1000; i++) {
        appA.emit("firehose", i);
      }

      expect(received).toHaveLength(1000);
      expect(received[0]).toBe(0);
      expect(received[999]).toBe(999);
      expect(received.every((v, i) => v === i)).toBe(true);
    });
  });

  describe("error isolation edges", () => {
    it("keeps delivering to a subscriber that throws on every delivery (no auto-removal)", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appA, appB, appC } = createParties();
      const broken = vi.fn(() => {
        throw new Error("always broken");
      });
      const healthy = vi.fn();

      appB.on("storm", broken);
      appC.on("storm", healthy);

      for (let i = 0; i < 3; i++) {
        expect(() => appA.emit("storm", i)).not.toThrow();
      }

      expect(broken).toHaveBeenCalledTimes(3); // broken subscriber stays subscribed
      expect(healthy).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it("contains a throwing handler to its channel: other channels deliver normally", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appA, appB, appC } = createParties();
      const healthy = vi.fn();

      appB.channel("bad").on("evt", () => {
        throw new Error("channel bad");
      });
      appC.channel("good").on("evt", healthy);

      expect(() => appA.channel("bad").emit("evt", 1)).not.toThrow();
      appA.channel("good").emit("evt", 2);

      expect(healthy).toHaveBeenCalledTimes(1);
      expect(healthy).toHaveBeenCalledWith(2, {
        topic: "evt",
        source: "app-a",
        channel: "good",
      });
      consoleSpy.mockRestore();
    });

    it("keeps delivering on the SAME channel after a handler throws there", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { appA, appB, appC } = createParties();
      const healthy = vi.fn();

      appB.channel("shared").on("evt", () => {
        throw new Error("still broken");
      });
      appC.channel("shared").on("evt", healthy);

      appA.channel("shared").emit("evt", 1);
      appA.channel("shared").emit("evt", 2);

      expect(healthy).toHaveBeenCalledTimes(2);
      consoleSpy.mockRestore();
    });
  });

  describe("kernel lifecycle event independence", () => {
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

    function createKernelWithApps(): {
      kernel: TestKernel;
      busA: FynBus;
      busB: FynBus;
    } {
      const kernel = new TestKernel();
      kernel.initRunTime({ appsLoaded: {}, middlewares: {} });
      const busA = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-a", "1.0.0"),
      ).bus!;
      const busB = kernel.moduleLoader.createFynUnitRuntime(
        createTestFynApp("app-b", "1.0.0"),
      ).bus!;
      return { kernel, busA, busB };
    }

    it("does not leak a bus emit named after a lifecycle event into kernel.events", () => {
      const { kernel, busA, busB } = createKernelWithApps();
      const lifecycleSpy = vi.fn();
      const busSpy = vi.fn();

      kernel.events.on("FYNAPP_BOOTSTRAPPED", lifecycleSpy);
      busB.on("FYNAPP_BOOTSTRAPPED", busSpy);

      busA.emit("FYNAPP_BOOTSTRAPPED", { name: "fake-app", version: "9.9.9" });

      expect(busSpy).toHaveBeenCalledTimes(1); // bus subscribers do hear it...
      expect(lifecycleSpy).not.toHaveBeenCalled(); // ...the lifecycle bus does not
    });

    it("does not leak a kernel.events lifecycle dispatch into bus subscribers", () => {
      const { kernel, busB } = createKernelWithApps();
      const busSpy = vi.fn();

      busB.on("FYNAPP_BOOTSTRAPPED", busSpy);

      kernel.events.dispatchEvent(
        new CustomEvent("FYNAPP_BOOTSTRAPPED", {
          detail: { name: "phantom-app", version: "0.0.0" },
        }),
      );

      expect(busSpy).not.toHaveBeenCalled();
    });
  });
});
