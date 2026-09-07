/**
 * The bootstrap queue panel's collection (FYM-331).
 *
 * Every test here exists to keep four claims apart, because they are the four
 * things a support question can be answered with and three of them are wrong
 * three quarters of the time:
 *
 * - **absent** -- `kernel.bootstrapCoordinator` could not be read at all. The
 *   production build mangles it, so this is the ordinary case on a live page.
 * - **unreadable** -- the coordinator is there but one of its four surfaces is
 *   not, and the surface is named.
 * - **empty** -- nobody holds the lock and nothing is deferred. A real state,
 *   and the healthy one.
 * - **readable** -- a holder, a queue, and a reason per queued app.
 *
 * The first and the third are the pair that matters: an unreadable queue and an
 * idle queue look identical if either is allowed to render as "no rows", and
 * they mean opposite things.
 */

import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { collectFynMesh } from "../src/core/collectors/fynmesh.js";
import { emptyCapability } from "../src/core/model.js";
import type { BootstrapQueueNode, Capability, ContainerNode } from "../src/core/model.js";
import { twoContainerPage } from "./fixture.js";
import { devKernel, fakeFynApp, fakeUnit, minifiedKernel } from "./kernel-fixture.js";

function run(kernel: unknown, containers: ContainerNode[] = []) {
  const cap: Capability = emptyCapability();
  const result = collectFynMesh(kernel, containers, cap);
  return { cap, ...result };
}

function queueOf(kernel: unknown): BootstrapQueueNode {
  const { fynmesh } = run(kernel);
  if (!fynmesh?.bootstrapQueue) {
    throw new Error("no bootstrap queue was collected");
  }
  return fynmesh.bootstrapQueue;
}

/**
 * The demo's own shape: a design-tokens provider, and two consumers of it that
 * cannot start until it has finished.
 */
function providerAndConsumers() {
  return devKernel({
    apps: [
      fakeFynApp({ name: "fynapp-design-tokens", version: "1.0.0" }),
      fakeFynApp({ name: "fynapp-1", version: "1.0.0" }),
      fakeFynApp({ name: "fynapp-2", version: "1.0.0" }),
    ],
    bootstrap: {
      holder: "fynapp-design-tokens",
      deferred: [
        { name: "fynapp-1", version: "1.0.0" },
        { name: "fynapp-2", version: "1.0.0" },
      ],
      providerModes: {
        "fynapp-design-tokens": { "design-tokens": "provider" },
        "fynapp-1": { "design-tokens": "consumer" },
        "fynapp-2": { "design-tokens": "consumer", "shell-layout": "consumer" },
      },
    },
  });
}

describe("a queue with a holder and deferrals", () => {
  it("names who holds the lock and who is behind them, in order", () => {
    const queue = queueOf(providerAndConsumers());
    expect(queue.holder).toBe("fynapp-design-tokens");
    expect(queue.deferred.map((d) => d.key)).toEqual(["fynapp-1@1.0.0", "fynapp-2@1.0.0"]);
    expect(queue.unreadable).toEqual([]);
    expect(queue.unreadableDeferred).toBe(0);
  });

  /*
   * The deferred entry's key is the FynApps view's key, so the panel and the
   * row below it are talking about the same object. The coordinator itself
   * keys by bare name -- `bootstrappingApp`, `fynAppBootstrapStatus` and
   * `fynAppProviderModes` are all name-only -- which is why the version has to
   * come off the queued `fynApp` and not off any of those.
   */
  it("keys a deferred app the way the FynApps view keys it", () => {
    const { fynmesh } = run(providerAndConsumers());
    const keys = fynmesh!.apps.map((a) => a.key);
    for (const d of fynmesh!.bootstrapQueue!.deferred) {
      expect(keys).toContain(d.key);
      expect(d.key).toBe(d.name + "@" + d.version);
    }
  });

  it("says what each deferred app is waiting for, not merely that it waits", () => {
    const queue = queueOf(providerAndConsumers());
    expect(queue.deferred[0].waitingOn).toEqual([
      { middleware: "design-tokens", provider: "fynapp-design-tokens" },
    ]);
  });

  /*
   * `areBootstrapDependenciesSatisfied` returns at the first unsatisfied
   * dependency because a boolean is all the kernel needs. A reader asking why
   * an app is parked wants all of them -- being told about one provider,
   * chasing it, and then being told about a second is the slow version of this
   * panel's whole job.
   */
  it("collects every blocker, where the kernel stops at the first", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          holder: "fynapp-a",
          deferred: [{ name: "fynapp-c", version: "1.0.0" }],
          providerModes: {
            "fynapp-a": { alpha: "provider" },
            "fynapp-b": { beta: "provider" },
            "fynapp-c": { alpha: "consumer", beta: "consumer" },
          },
        },
      })
    );
    expect(queue.deferred[0].waitingOn.map((b) => b.provider)).toEqual([
      "fynapp-a",
      "fynapp-b",
    ]);
  });

  it("counts a queue entry whose FynApp cannot be read rather than dropping it", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          holder: "fynapp-1",
          deferred: [{ name: "fynapp-2", version: "1.0.0" }],
          unreadableDeferred: 2,
        },
      })
    );
    // the queue is three deep and only one of them can be described; reporting
    // it as one would understate how much of the page is parked
    expect(queue.deferred).toHaveLength(1);
    expect(queue.unreadableDeferred).toBe(2);
  });
});

describe("provider modes", () => {
  it("mirrors findProviderForMiddleware: the first other app registered as provider", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          deferred: [{ name: "fynapp-2", version: "1.0.0" }],
          providerModes: {
            "fynapp-1": { "design-tokens": "provider" },
            "fynapp-2": { "design-tokens": "consumer" },
            "fynapp-3": { "design-tokens": "provider" },
          },
        },
      })
    );
    expect(queue.deferred[0].waitingOn).toEqual([
      { middleware: "design-tokens", provider: "fynapp-1" },
    ]);
  });

  /*
   * The provider having finished is the whole point of the status map: the app
   * is queued behind the lock, not behind a dependency, and the two get fixed
   * in completely different places.
   */
  it("is not a blocker once the provider has bootstrapped", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          holder: "fynapp-9",
          deferred: [{ name: "fynapp-2", version: "1.0.0" }],
          bootstrapped: ["fynapp-1"],
          providerModes: {
            "fynapp-1": { "design-tokens": "provider" },
            "fynapp-2": { "design-tokens": "consumer" },
          },
        },
      })
    );
    expect(queue.deferred[0].waitingOn).toEqual([]);
    expect(queue.bootstrapped).toEqual(["fynapp-1"]);
  });

  it("does not make an app wait on itself, and ignores its provider roles", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          deferred: [{ name: "fynapp-both", version: "1.0.0" }],
          providerModes: {
            "fynapp-both": { "design-tokens": "provider", "shell-layout": "consumer" },
          },
        },
      })
    );
    // it provides design-tokens itself, and nobody else provides shell-layout
    expect(queue.deferred[0].waitingOn).toEqual([]);
  });

  it("flattens the nested maps, sorted, so the snapshot is stable", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          providerModes: {
            "fynapp-2": { zeta: "consumer", alpha: "provider" },
            "fynapp-1": { "design-tokens": "provider" },
          },
        },
      })
    );
    expect(queue.modes).toEqual([
      { app: "fynapp-1", roles: [{ middleware: "design-tokens", mode: "provider" }] },
      {
        app: "fynapp-2",
        roles: [
          { middleware: "alpha", mode: "provider" },
          { middleware: "zeta", mode: "consumer" },
        ],
      },
    ]);
  });
});

describe("an idle queue", () => {
  /*
   * The healthy state, and it has to be *sayable*. `null` is the coordinator's
   * own value for a free lock, so it becomes an absent `holder` on a node that
   * is present -- which is the only way the panel can tell "everything has
   * finished" from "there is nothing here to read".
   */
  it("is readable, present, and empty -- not absent", () => {
    const queue = queueOf(devKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })] }));
    expect(queue.holder).toBeUndefined();
    expect(queue.deferred).toEqual([]);
    expect(queue.unreadableDeferred).toBe(0);
    expect(queue.unreadable).toEqual([]);
    expect(queue.bootstrapped).toEqual([]);
    expect(queue.modes).toEqual([]);
  });

  it("reports the capability as available, which is what separates it from a min build", () => {
    const { cap, fynmesh } = run(devKernel());
    expect(cap.kernelBootstrap).toBe(true);
    expect(fynmesh!.bootstrapQueue).toBeDefined();
    expect(cap.notes.join(" ")).not.toContain("bootstrapCoordinator");
  });
});

describe("an unreadable coordinator", () => {
  /*
   * The trap this whole ticket turns on. esbuild's `__publicField` plus
   * terser's `keep_quoted` leaves `bootstrapCoordinator` as an own enumerable
   * property holding `undefined`, so `"bootstrapCoordinator" in kernel` is TRUE
   * on a production page. A probe written that way would build a queue node out
   * of nothing and draw an empty -- i.e. idle -- panel on every prod page.
   */
  it("collects no queue at all on a minified kernel", () => {
    const min = minifiedKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })] });
    expect("bootstrapCoordinator" in min).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(min, "bootstrapCoordinator")).toBe(true);

    const { cap, fynmesh } = run(min);
    expect(fynmesh!.build).toBe("minified");
    expect(fynmesh!.bootstrapQueue).toBeUndefined();
    expect(cap.kernelBootstrap).toBe(false);
    expect(cap.notes.some((n) => n.includes("bootstrapCoordinator"))).toBe(true);
  });

  /**
   * The hatch the min build ships *for* this: `bootstrapCoordinator` stays
   * manglable, so the kernel hands out a copy of the queue through `__I()`
   * instead. "Absent" therefore has to stop meaning "production", or the
   * fourth claim above is unreachable on the only pages that matter.
   */
  it("builds the queue from kernel.__I() when the coordinator is mangled", () => {
    const min = minifiedKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })] });
    min.__I = () => ({
      v: 1,
      bootstrap: {
        holder: "fynapp-design-tokens",
        deferred: [{ name: "fynapp-2", version: "1.0.0" }],
        bootstrapped: ["fynapp-1"],
        modes: [
          { app: "fynapp-design-tokens", roles: [{ middleware: "design-tokens", mode: "provider" }] },
          { app: "fynapp-2", roles: [{ middleware: "design-tokens", mode: "consumer" }] },
        ],
      },
    });

    const { cap, fynmesh } = run(min);
    expect(fynmesh!.build).toBe("minified");
    expect(cap.kernelBootstrap).toBe(true);

    const queue = fynmesh!.bootstrapQueue!;
    expect(queue.holder).toBe("fynapp-design-tokens");
    expect(queue.bootstrapped).toEqual(["fynapp-1"]);
    expect(queue.unreadable).toEqual([]);
    expect(queue.unreadableDeferred).toBe(0);
    // recomputed here, not sent: fynapp-2 consumes design-tokens, and its
    // provider has not bootstrapped
    expect(queue.deferred).toEqual([
      {
        name: "fynapp-2",
        version: "1.0.0",
        key: "fynapp-2@1.0.0",
        waitingOn: [{ middleware: "design-tokens", provider: "fynapp-design-tokens" }],
      },
    ]);

    // Reading through the hatch is a supported result, not a degraded one, so
    // it raises no capability note -- the banner those land in reads "limited",
    // which made the panel the hatch fixed look broken (FYM-399). The
    // genuinely-unreadable case still reports, as the next test asserts.
    const notes = cap.notes.join(" ");
    expect(notes).not.toContain("kernel.__I()");
    expect(notes).not.toContain("says unavailable rather than idle");
  });

  it("says unavailable when __I() returns an envelope it does not understand", () => {
    const min = minifiedKernel();
    // a future kernel that changed the shape: guessing at it would be worse
    // than saying nothing, because a wrong queue reads as an authoritative one
    min.__I = () => ({ v: 2, bootstrap: { holder: "fynapp-1" } });

    const { cap, fynmesh } = run(min);
    expect(fynmesh!.bootstrapQueue).toBeUndefined();
    expect(cap.kernelBootstrap).toBe(false);
    expect(cap.notes.some((n) => n.includes("bootstrapCoordinator"))).toBe(true);
  });

  it("prefers the live coordinator over the snapshot on a dev build", () => {
    const kernel = devKernel({ bootstrap: { holder: "from-coordinator" } }) as any;
    // present, and deliberately disagreeing: the live object is the real
    // thing and the snapshot is a copy, so a dev page must not read the copy
    kernel.__I = () => ({ v: 1, bootstrap: { holder: "from-snapshot" } });

    const { cap, fynmesh } = run(kernel);
    expect(fynmesh!.bootstrapQueue!.holder).toBe("from-coordinator");
    expect(cap.notes.join(" ")).not.toContain("kernel.__I()");
  });

  it("collects no queue on a kernel of some third shape", () => {
    const { cap, fynmesh } = run({ runTime: { apps: {} }, listFynAppStates: () => [] });
    expect(fynmesh!.build).toBe("unknown");
    expect(fynmesh!.bootstrapQueue).toBeUndefined();
    expect(cap.kernelBootstrap).toBe(false);
  });

  it("names the surface it could not read instead of reporting an empty one", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          deferred: [{ name: "fynapp-2", version: "1.0.0" }],
          unreadable: ["fynAppProviderModes"],
        },
      })
    );
    expect(queue.unreadable).toEqual(["fynAppProviderModes"]);
    // the queue itself was readable, so it is still reported -- with no claim
    // about why the app is parked, because that is what was unreadable
    expect(queue.deferred).toHaveLength(1);
    expect(queue.deferred[0].waitingOn).toEqual([]);
    expect(queue.modes).toEqual([]);
  });

  it("reports a throwing bootstrappingApp getter as a gap, not as a free lock", () => {
    const queue = queueOf(devKernel({ bootstrap: { unreadable: ["bootstrappingApp"] } }));
    expect(queue.holder).toBeUndefined();
    expect(queue.unreadable).toContain("bootstrappingApp");
  });

  it("reports a bootstrappingApp holding something that is not a name", () => {
    const queue = queueOf({
      runTime: { apps: {} },
      bootstrapCoordinator: {
        canBootstrap: () => true,
        bootstrappingApp: 42,
        deferredBootstraps: [],
        fynAppBootstrapStatus: new Map(),
        fynAppProviderModes: new Map(),
      },
    });
    expect(queue.holder).toBeUndefined();
    expect(queue.unreadable).toEqual(["bootstrappingApp"]);
  });

  it("names every unreadable surface at once", () => {
    const queue = queueOf(
      devKernel({
        bootstrap: {
          unreadable: [
            "bootstrappingApp",
            "deferredBootstraps",
            "fynAppBootstrapStatus",
            "fynAppProviderModes",
          ],
        },
      })
    );
    expect(queue.unreadable.sort()).toEqual([
      "bootstrappingApp",
      "deferredBootstraps",
      "fynAppBootstrapStatus",
      "fynAppProviderModes",
    ]);
    expect(queue.deferred).toEqual([]);
  });

  /*
   * An `Array` has an `entries()` of its own, yielding `[index, value]`. Taken
   * for a Map it would produce zero string keys -- a readable, empty status
   * map -- which is the same false "everything is fine" this file exists to
   * prevent, arriving through a different door.
   */
  it("does not mistake an array for a Map", () => {
    const queue = queueOf({
      runTime: { apps: {} },
      bootstrapCoordinator: {
        canBootstrap: () => true,
        bootstrappingApp: null,
        deferredBootstraps: [],
        fynAppBootstrapStatus: ["fynapp-1"],
        fynAppProviderModes: new Map(),
      },
    });
    expect(queue.unreadable).toEqual(["fynAppBootstrapStatus"]);
    expect(queue.bootstrapped).toEqual([]);
  });
});

describe("the snapshot contract", () => {
  /*
   * A `Deferred` holds the live `FynApp` -- itself holding a `Map` and a tree
   * of exposes -- plus a `resolve` closure and a timer handle. Cloning one into
   * the snapshot would take the whole panel down the moment it crossed the
   * postMessage bridge in `adapters/remote.ts`, so only the identity is copied.
   */
  it("survives a real structuredClone with a live queue on the kernel", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({
      loader,
      federation,
      kernel: devKernel({
        apps: [
          fakeFynApp({
            name: "fynapp-1",
            version: "1.0.0",
            exposes: {
              "./main": fakeUnit(["execute"], [
                { info: { name: "design-tokens", provider: "fynapp-design-tokens" } },
              ]),
            },
          }),
        ],
        bootstrap: {
          holder: "fynapp-design-tokens",
          deferred: [{ name: "fynapp-1", version: "1.0.0" }],
          bootstrapped: ["fynapp-boot"],
          providerModes: {
            "fynapp-design-tokens": { "design-tokens": "provider" },
            "fynapp-1": { "design-tokens": "consumer" },
          },
        },
      }),
    });

    const clone = structuredClone(snap);
    expect(clone.fynmesh!.bootstrapQueue).toEqual(snap.fynmesh!.bootstrapQueue);
    expect(JSON.stringify(snap.fynmesh!.bootstrapQueue)).toContain("fynapp-1");
    // nothing live came across: no exposes, no middlewareContext, no resolve
    expect(JSON.stringify(snap.fynmesh!.bootstrapQueue)).not.toContain("middlewareContext");
  });
});
