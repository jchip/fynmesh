/**
 * FynBus stress / invariant tests (FYM-141)
 *
 * Complements the unit suites (fyn-bus.test.ts, fyn-bus-pubsub-edge.test.ts,
 * fyn-bus-rpc-edge.test.ts, fyn-bus-lifecycle.test.ts) with scale,
 * leak-resistance, and randomized-invariant coverage:
 *  - churn/leak invariants over the facade's internal subscription tracking
 *    (state.subs) and the root's per-channel maps
 *  - scale: many channels, many apps, topic x subscriber matrices
 *  - a seeded randomized op sequence checked against a JS-side model
 *  - deep reentrant emit chains and mass parked-request flushing
 *  - a throughput smoke test as a pathological-slowdown tripwire
 *
 * Accepted quirk (documented, NOT a bug report): fired once() subscriptions
 * and AbortSignal-aborted subscriptions leave stale entries in the facade's
 * state.subs until dispose. Leak assertions below account for that.
 *
 * Determinism: all randomness goes through mulberry32 with FIXED literal
 * seeds so any failure reproduces exactly.
 */
import { describe, it, expect } from "vitest";
import { FynBusRoot } from "../src/fyn-bus.js";
import type { FynBus, Unsubscribe } from "../src/fyn-bus.js";

/** Facade internals: subscription tracking set (test-only access) */
function subsOf(facade: FynBus): Set<Unsubscribe> {
  return (facade as any).state.subs;
}

/** Root internals: per-channel state maps (test-only access) */
function channelsOf(root: FynBusRoot): Map<
  string,
  { handlers: Map<string, unknown>; waiters: Map<string, Set<unknown>> }
> {
  return (root as any).channels;
}

/** Root internals: per-app facade cache (test-only access) */
function facadesOf(root: FynBusRoot): Map<string, unknown> {
  return (root as any).facades;
}

/** Tiny deterministic PRNG — fixed seeds make failures reproducible */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[randInt(rand, arr.length)];
}

function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe("FynBus stress: churn and leak invariants", () => {
  it("on() + unsubscribe 10_000 times leaves state.subs empty and the bus functional", () => {
    const root = new FynBusRoot();
    const app = root.forApp("churn-app", "1.0.0");
    const other = root.forApp("other", "1.0.0");

    for (let i = 0; i < 10_000; i++) {
      const unsub = app.on(`t-${i % 7}`, () => {});
      unsub();
    }

    expect(subsOf(app).size).toBe(0);

    // The facade still works normally after the churn
    const received: unknown[] = [];
    app.on("post-churn", (p) => received.push(p));
    other.emit("post-churn", 42);
    expect(received).toEqual([42]);
    expect(subsOf(app).size).toBe(1);
  });

  it("once() + unsubscribe-before-fire 10_000 times leaves state.subs empty", () => {
    const root = new FynBusRoot();
    const app = root.forApp("once-churn", "1.0.0");

    for (let i = 0; i < 10_000; i++) {
      const unsub = app.once("never-fired", () => {});
      unsub();
    }

    expect(subsOf(app).size).toBe(0);
  });

  it("handle() + unsubscribe churn leaves the channel handlers maps empty", async () => {
    const root = new FynBusRoot();
    const app = root.forApp("rpc-churn", "1.0.0");

    for (let i = 0; i < 10_000; i++) {
      const unsubRoot = app.handle(`job-${i % 5}`, () => i);
      const unsubChan = app.channel("jobs").handle(`job-${i % 5}`, () => i);
      unsubRoot();
      unsubChan();
    }

    const channels = channelsOf(root);
    expect(channels.get("")!.handlers.size).toBe(0);
    expect(channels.get("jobs")!.handlers.size).toBe(0);
    expect(subsOf(app).size).toBe(0);

    // Topics are genuinely free again
    app.handle("job-0", () => "fresh");
    await expect(root.forApp("consumer", "1.0.0").request("job-0")).resolves.toBe("fresh");
  });

  it("heavy fired-once() traffic: tracking entries are auto-removed on fire (FYM-140); dispose and fresh facade work", () => {
    const N = 2000;
    const root = new FynBusRoot();
    const app = root.forApp("once-heavy", "1.0.0");
    const emitter = root.forApp("emitter", "1.0.0");
    let delivered = 0;

    for (let i = 0; i < N; i++) {
      app.once("burst", () => {
        delivered++;
      });
    }
    emitter.emit("burst", 1);
    expect(delivered).toBe(N);

    // FYM-140: fired once() subscriptions drop their tracking entries too
    expect(subsOf(app).size).toBe(0);

    // No ghost deliveries — the listeners really were consumed
    emitter.emit("burst", 2);
    expect(delivered).toBe(N);

    root.disposeApp("once-heavy", "1.0.0");
    expect(subsOf(app).size).toBe(0);

    // A fresh facade for the same app starts clean and works
    const fresh = root.forApp("once-heavy", "1.0.0");
    expect(fresh).not.toBe(app);
    expect(subsOf(fresh).size).toBe(0);
    const received: unknown[] = [];
    fresh.on("burst", (p) => received.push(p));
    emitter.emit("burst", 3);
    expect(received).toEqual([3]);
  });

  it("mass AbortSignal aborts: no deliveries, tracking entries auto-removed (FYM-140), clean fresh facade", () => {
    const N = 2000;
    const root = new FynBusRoot();
    const app = root.forApp("abort-heavy", "1.0.0");
    const emitter = root.forApp("emitter", "1.0.0");
    let delivered = 0;

    const controllers: AbortController[] = [];
    for (let i = 0; i < N; i++) {
      const ac = new AbortController();
      controllers.push(ac);
      app.on(
        "sig",
        () => {
          delivered++;
        },
        { signal: ac.signal },
      );
    }
    for (const ac of controllers) {
      ac.abort();
    }

    emitter.emit("sig", 1);
    expect(delivered).toBe(0);

    // FYM-140: aborted subscriptions drop their tracking entries
    expect(subsOf(app).size).toBe(0);

    root.disposeApp("abort-heavy", "1.0.0");
    expect(subsOf(app).size).toBe(0);

    const fresh = root.forApp("abort-heavy", "1.0.0");
    expect(subsOf(fresh).size).toBe(0);
    fresh.on("sig", () => {
      delivered++;
    });
    emitter.emit("sig", 2);
    expect(delivered).toBe(1);
  });

  it("dispose/recreate an app 1000 times leaves no ghost listeners and a bounded facade cache", () => {
    const root = new FynBusRoot();
    const emitter = root.forApp("emitter", "1.0.0");
    const log: number[] = [];

    for (let gen = 0; gen < 1000; gen++) {
      const facade = root.forApp("phoenix", "1.0.0");
      facade.on("rise", () => log.push(gen));
      root.disposeApp("phoenix", "1.0.0");
    }

    // Only emitter remains cached; every phoenix generation was evicted
    expect(facadesOf(root).size).toBe(1);

    const final = root.forApp("phoenix", "1.0.0");
    final.on("rise", () => log.push(-1));
    emitter.emit("rise", 1);

    // Exactly one delivery: the live generation. No ghost from 1000 dead gens.
    expect(log).toEqual([-1]);
    expect(facadesOf(root).size).toBe(2);
  });
});

describe("FynBus stress: scale", () => {
  it("routes emits across 500 channels with no cross-channel bleed", () => {
    const root = new FynBusRoot();
    const emitter = root.forApp("emitter", "1.0.0");
    const subscriber = root.forApp("subscriber", "1.0.0");
    const CHANNELS = 500;
    const byChannel = new Map<string, Array<{ payload: unknown; channel: string }>>();

    for (let i = 0; i < CHANNELS; i++) {
      const name = `ch-${i}`;
      byChannel.set(name, []);
      subscriber.channel(name).on("evt", (payload, meta) => {
        byChannel.get(name)!.push({ payload, channel: meta.channel });
      });
    }

    for (let i = 0; i < CHANNELS; i++) {
      emitter.channel(`ch-${i}`).emit("evt", i);
    }

    // Total delivery count: exactly one per channel
    let total = 0;
    for (const [name, records] of byChannel) {
      total += records.length;
      expect(records).toHaveLength(1);
      expect(records[0].channel).toBe(name);
    }
    expect(total).toBe(CHANNELS);

    // Sample-check payload routing at the edges and middle
    for (const i of [0, 1, 249, 250, 498, 499]) {
      expect(byChannel.get(`ch-${i}`)![0].payload).toBe(i);
    }
  });

  it("delivers one emit to 199 of 200 apps on a shared topic (self filtered)", () => {
    const root = new FynBusRoot();
    const APPS = 200;
    const counts = new Map<string, number>();
    const facades: FynBus[] = [];

    for (let i = 0; i < APPS; i++) {
      const name = `app-${i}`;
      counts.set(name, 0);
      const facade = root.forApp(name, "1.0.0");
      facades.push(facade);
      facade.on("broadcast", () => counts.set(name, counts.get(name)! + 1));
    }

    facades[0].emit("broadcast", "hello");

    let total = 0;
    for (const n of counts.values()) {
      total += n;
    }
    expect(total).toBe(APPS - 1);
    expect(counts.get("app-0")).toBe(0); // sender never hears itself
    for (const i of [1, 50, 100, 199]) {
      expect(counts.get(`app-${i}`)).toBe(1);
    }
  });

  it("hits exactly one column of a 100-topic x 10-subscriber matrix per targeted emit", () => {
    const root = new FynBusRoot();
    const emitter = root.forApp("emitter", "1.0.0");
    const TOPICS = 100;
    const SUBS = 10;
    let log: Array<{ app: string; topic: string }> = [];

    for (let s = 0; s < SUBS; s++) {
      const app = root.forApp(`sub-${s}`, "1.0.0");
      for (let t = 0; t < TOPICS; t++) {
        app.on(`topic-${t}`, (_p, meta) => log.push({ app: `sub-${s}`, topic: meta.topic }));
      }
    }

    // Phase 1: one targeted emit hits exactly its column
    emitter.emit("topic-42", "targeted");
    expect(log).toHaveLength(SUBS);
    expect(log.every((d) => d.topic === "topic-42")).toBe(true);
    expect(new Set(log.map((d) => d.app)).size).toBe(SUBS); // one delivery per subscriber

    // Phase 2: full sweep — every topic delivers to exactly its 10 subscribers
    log = [];
    for (let t = 0; t < TOPICS; t++) {
      emitter.emit(`topic-${t}`, t);
    }
    expect(log).toHaveLength(TOPICS * SUBS);
    const perTopic = new Map<string, number>();
    for (const d of log) {
      perTopic.set(d.topic, (perTopic.get(d.topic) ?? 0) + 1);
    }
    expect(perTopic.size).toBe(TOPICS);
    for (const count of perTopic.values()) {
      expect(count).toBe(SUBS);
    }
  });
});

describe("FynBus stress: seeded randomized invariants", () => {
  type Delivery = {
    sub: number;
    topic: string;
    channel: string;
    payload: number;
    source: string;
  };

  type ModelSub = {
    id: number;
    app: string;
    channel: string;
    topic: string;
    active: boolean;
    unsub: Unsubscribe;
  };

  /**
   * Drives ~opCount random ops (subscribe / unsubscribe / root emit / channel
   * emit / dispose-app / recreate-app) over 10 apps and 5 scopes (root + 4
   * channels), maintaining a JS-side model of expected deliveries. The model
   * is authoritative: self-filtering, channel isolation, dispose removing
   * subscriptions, and recreated apps getting fresh facades are all modeled.
   * After the run a probe emit on every (channel, topic) pair verifies the
   * END STATE of subscriptions, not just the history.
   */
  function runRandomizedScenario(seed: number, opCount: number) {
    const rand = mulberry32(seed);
    const root = new FynBusRoot();
    const APPS = Array.from({ length: 10 }, (_, i) => `app-${i}`);
    const CHANNELS = ["", "alpha", "beta", "gamma", "delta"]; // "" = root bus
    const TOPICS = Array.from({ length: 8 }, (_, i) => `topic-${i}`);

    const actual: Delivery[] = [];
    const expected: Delivery[] = [];
    const subs: ModelSub[] = [];
    const live = new Map<string, FynBus>();
    const disposed = new Set<string>();
    for (const name of APPS) {
      live.set(name, root.forApp(name, "1.0.0"));
    }

    let nextSubId = 0;
    let nextPayload = 0;
    const stats = {
      subscribe: 0,
      unsubscribe: 0,
      rootEmit: 0,
      channelEmit: 0,
      dispose: 0,
      recreate: 0,
      skipped: 0,
    };

    const getBus = (app: string, channel: string): FynBus => {
      const facade = live.get(app)!;
      return channel === "" ? facade : facade.channel(channel);
    };

    const doEmit = (channel: string): boolean => {
      const liveApps = [...live.keys()];
      if (liveApps.length === 0) {
        return false;
      }
      const app = pick(rand, liveApps);
      const topic = pick(rand, TOPICS);
      const payload = nextPayload++;
      // Model: active subs matching (channel, topic), excluding the sender's
      // source name, in subscription order (== EventTarget listener order).
      for (const s of subs) {
        if (s.active && s.channel === channel && s.topic === topic && s.app !== app) {
          expected.push({ sub: s.id, topic, channel, payload, source: app });
        }
      }
      getBus(app, channel).emit(topic, payload);
      return true;
    };

    for (let i = 0; i < opCount; i++) {
      const roll = rand();
      if (roll < 0.26) {
        // subscribe
        const liveApps = [...live.keys()];
        if (liveApps.length === 0) {
          stats.skipped++;
          continue;
        }
        const app = pick(rand, liveApps);
        const channel = pick(rand, CHANNELS);
        const topic = pick(rand, TOPICS);
        const id = nextSubId++;
        const unsub = getBus(app, channel).on(topic, (payload, meta) => {
          actual.push({
            sub: id,
            topic: meta.topic,
            channel: meta.channel,
            payload: payload as number,
            source: meta.source,
          });
        });
        subs.push({ id, app, channel, topic, active: true, unsub });
        stats.subscribe++;
      } else if (roll < 0.38) {
        // unsubscribe a random active subscription
        const active = subs.filter((s) => s.active);
        if (active.length === 0) {
          stats.skipped++;
          continue;
        }
        const s = pick(rand, active);
        s.unsub();
        s.active = false;
        stats.unsubscribe++;
      } else if (roll < 0.64) {
        // root emit
        if (doEmit("")) {
          stats.rootEmit++;
        } else {
          stats.skipped++;
        }
      } else if (roll < 0.88) {
        // channel emit
        if (doEmit(pick(rand, CHANNELS.slice(1)))) {
          stats.channelEmit++;
        } else {
          stats.skipped++;
        }
      } else if (roll < 0.93) {
        // dispose an app: all its subscriptions die with it
        const liveApps = [...live.keys()];
        if (liveApps.length === 0) {
          stats.skipped++;
          continue;
        }
        const app = pick(rand, liveApps);
        root.disposeApp(app, "1.0.0");
        live.delete(app);
        disposed.add(app);
        for (const s of subs) {
          if (s.active && s.app === app) {
            s.active = false;
          }
        }
        stats.dispose++;
      } else {
        // recreate a disposed app: fresh facade, no inherited subscriptions
        if (disposed.size === 0) {
          stats.skipped++;
          continue;
        }
        const app = pick(rand, [...disposed]);
        disposed.delete(app);
        live.set(app, root.forApp(app, "1.0.0"));
        stats.recreate++;
      }
    }

    // Probe phase: verify the end state of every (channel, topic) pair
    const prober = root.forApp("prober", "1.0.0");
    const proberBus = (channel: string): FynBus =>
      channel === "" ? prober : prober.channel(channel);
    for (const channel of CHANNELS) {
      for (const topic of TOPICS) {
        const payload = nextPayload++;
        for (const s of subs) {
          if (s.active && s.channel === channel && s.topic === topic) {
            expected.push({ sub: s.id, topic, channel, payload, source: "prober" });
          }
        }
        proberBus(channel).emit(topic, payload);
      }
    }

    // Internal-state invariant: disposed apps' facades are evicted
    for (const app of disposed) {
      expect(facadesOf(root).has(`${app}@1.0.0`)).toBe(false);
    }

    return { actual, expected, stats };
  }

  it("matches the model exactly over 2000 seeded random ops (seed 0xC0FFEE)", () => {
    const { actual, expected, stats } = runRandomizedScenario(0xc0ffee, 2000);

    // The scenario must actually exercise every op type and real traffic
    expect(stats.subscribe).toBeGreaterThan(100);
    expect(stats.unsubscribe).toBeGreaterThan(50);
    expect(stats.rootEmit).toBeGreaterThan(100);
    expect(stats.channelEmit).toBeGreaterThan(100);
    expect(stats.dispose).toBeGreaterThan(10);
    expect(stats.recreate).toBeGreaterThan(10);
    expect(expected.length).toBeGreaterThan(500);

    expect(actual.length).toBe(expected.length);
    expect(actual).toEqual(expected);
  });

  it("matches the model exactly over 2000 seeded random ops (seed 0x5EED42)", () => {
    const { actual, expected, stats } = runRandomizedScenario(0x5eed42, 2000);

    expect(stats.dispose).toBeGreaterThan(10);
    expect(stats.recreate).toBeGreaterThan(10);
    // This seed deterministically disposes more aggressively, so traffic is
    // lower than seed 0xC0FFEE — still hundreds of modeled deliveries.
    expect(expected.length).toBeGreaterThan(300);

    expect(actual.length).toBe(expected.length);
    expect(actual).toEqual(expected);
  });
});

describe("FynBus stress: deep reentrancy", () => {
  it("survives a 100-level reentrant emit chain with exact delivery order and counts", () => {
    const root = new FynBusRoot();
    const ping = root.forApp("ping", "1.0.0");
    const pong = root.forApp("pong", "1.0.0");
    const DEPTH = 100;
    const deliveries: Array<{ by: string; n: number }> = [];

    // Ping-pong: each app re-emits on the same topic; self-filtering keeps
    // each hop delivering only to the OTHER app, so the chain nests one
    // dispatch per level without looping.
    pong.on("deep", (n) => {
      const v = n as number;
      deliveries.push({ by: "pong", n: v });
      if (v < DEPTH) {
        pong.emit("deep", v + 1);
      }
    });
    ping.on("deep", (n) => {
      const v = n as number;
      deliveries.push({ by: "ping", n: v });
      if (v < DEPTH) {
        ping.emit("deep", v + 1);
      }
    });

    expect(() => ping.emit("deep", 0)).not.toThrow();

    expect(deliveries).toHaveLength(DEPTH + 1);
    deliveries.forEach((d, i) => {
      expect(d.n).toBe(i); // depth-first: strictly ascending, no dupes
      expect(d.by).toBe(i % 2 === 0 ? "pong" : "ping"); // strict alternation
    });
  });

  it("flushes 50 parked requests across 10 topics when handlers register in seeded-random order", async () => {
    const rand = mulberry32(0xf10c4);
    const root = new FynBusRoot();
    const provider = root.forApp("provider", "1.0.0");
    const consumer = root.forApp("consumer", "1.0.0");
    const topics = Array.from({ length: 10 }, (_, t) => `rpc-${t}`);

    const pending: Array<Promise<unknown>> = [];
    const expected: string[] = [];
    for (const topic of topics) {
      for (let k = 0; k < 5; k++) {
        const payload = `${topic}#${k}`;
        pending.push(consumer.request(topic, payload));
        expected.push(`ok:${payload}`);
      }
    }

    const shuffled = shuffle(topics, rand);
    expect(shuffled).not.toEqual(topics); // the seeded shuffle really reorders
    for (const topic of shuffled) {
      provider.handle(topic, (p) => `ok:${p}`);
    }

    // Every waiter set was drained synchronously at registration time
    expect(channelsOf(root).get("")!.waiters.size).toBe(0);

    await expect(Promise.all(pending)).resolves.toEqual(expected);
  });
});

describe("FynBus stress: throughput smoke", () => {
  it("delivers 10_000 emits to 10 subscribers well under a generous bound", () => {
    // NOT a benchmark — a tripwire for pathological slowdowns (e.g. O(n^2)
    // subscription bookkeeping). The bound is deliberately generous.
    const root = new FynBusRoot();
    const emitter = root.forApp("emitter", "1.0.0");
    let delivered = 0;

    for (let i = 0; i < 10; i++) {
      root.forApp(`listener-${i}`, "1.0.0").on("fire", () => {
        delivered++;
      });
    }

    const start = performance.now();
    for (let n = 0; n < 10_000; n++) {
      emitter.emit("fire", n);
    }
    const elapsed = performance.now() - start;

    expect(delivered).toBe(100_000);
    expect(elapsed).toBeLessThan(2000);
  });
});
