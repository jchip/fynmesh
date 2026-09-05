/**
 * The resolution branch, on the tab where the consumer reads it (FYM-356).
 *
 * The Middleware view has drawn the branch since FYM-329 and toned it since
 * FYM-354. The FynApps view -- the one somebody debugging *their* app opens
 * first -- drew delivery and nothing else, so a FynApp running a version it
 * explicitly did not ask for showed a green `registered` chip, a green
 * `delivered` chip and a tick, and the only place saying otherwise was a tab
 * they had no reason to visit.
 *
 * These tests hold the two tabs to the same answer. The vocabulary lives in one
 * module, and the last test here is the one that matters: for every declaration
 * on a page, the severity the FynApps row shows and the severity the Middleware
 * chip shows are computed from the same fact and must come out equal. Two views
 * disagreeing about how bad something is is its own bug (FYM-353), separate
 * from either of them being wrong.
 */

import { describe, expect, it } from "vitest";
import { collectFynMesh } from "../src/core/collectors/fynmesh.js";
import { emptyCapability } from "../src/core/model.js";
import type {
  Capability,
  ContainerNode,
  DeclaredConsumerNode,
  FynAppNode,
  MiddlewareConsumerNode,
  MiddlewareUseNode,
} from "../src/core/model.js";
import {
  consumerTone,
  resolutionTone,
  useResolution,
  useTone,
} from "../src/ui/middleware-resolution.js";
import { misresolvedTitle, undeclaredDeliveries } from "../src/ui/views/fynapps.js";
import { autoAppliedShellPage, devKernel, fakeFynApp, fakeUnit } from "./kernel-fixture.js";
import type { FakeKernelOptions } from "./kernel-fixture.js";

function run(kernel: unknown, containers: ContainerNode[] = []) {
  const cap: Capability = emptyCapability();
  return { cap, ...collectFynMesh(kernel, containers, cap) };
}

/** A consumer FynApp declaring one middleware in the `useMiddleware` form. */
function consumer(
  name: string,
  info: { name: string; provider?: string; version?: string },
  delivered: string[] = []
) {
  return fakeFynApp({
    name,
    version: "1.0.0",
    exposes: { "./main": fakeUnit(["execute"], [{ info, config: {} }]) },
    delivered,
  });
}

/**
 * One middleware at two versions, with a consumer on each of the four branches
 * the kernel can take. 1.0.0 registers first, so it owns the `default` slot for
 * the life of the page (FYM-332) even though 2.0.0 is higher.
 */
function twoVersions(extra: FakeKernelOptions = {}) {
  return devKernel({
    apps: [
      consumer("fynapp-asks-range", { name: "shell-layout", provider: "fynapp-shell-mw", version: "^2.0.0" }, ["shell-layout"]),
      consumer("fynapp-asks-nothing", { name: "shell-layout", provider: "fynapp-shell-mw" }, ["shell-layout"]),
      consumer("fynapp-asks-exact", { name: "shell-layout", provider: "fynapp-shell-mw", version: "2.0.0" }, ["shell-layout"]),
      consumer("fynapp-asks-missing", { name: "shell-layout", provider: "fynapp-shell-mw", version: "^9.0.0" }, ["shell-layout"]),
    ],
    middlewares: [
      { provider: "fynapp-shell-mw", name: "shell-layout", hostVersion: "1.0.0" },
      { provider: "fynapp-shell-mw", name: "shell-layout", hostVersion: "2.0.0" },
    ],
    ...extra,
  });
}

function appNamed(apps: FynAppNode[], name: string): FynAppNode {
  const found = apps.find((a) => a.name === name);
  if (!found) {
    throw new Error(`no FynApp ${name} in [${apps.map((a) => a.name).join(", ")}]`);
  }
  return found;
}

/** The single declaration on one of the `consumer()` fixtures above. */
function onlyUse(apps: FynAppNode[], name: string): MiddlewareUseNode {
  const uses = appNamed(apps, name).usesMiddleware;
  expect(uses).toHaveLength(1);
  return uses[0];
}

describe("which branch a FynApps row reports", () => {
  it("names each of the kernel's four branches from the consumer's own row", () => {
    const { fynmesh } = run(twoVersions());
    const apps = fynmesh!.apps;

    expect(useResolution(onlyUse(apps, "fynapp-asks-exact"))).toBe("exact");
    expect(useResolution(onlyUse(apps, "fynapp-asks-range"))).toBe("range");
    expect(useResolution(onlyUse(apps, "fynapp-asks-nothing"))).toBe("default");
    expect(useResolution(onlyUse(apps, "fynapp-asks-missing"))).toBe("fallback");
  });

  /*
   * `default` and `exact` land on different registrations here and would be
   * indistinguishable if the row only said "resolved". The version the row
   * prints beside the branch comes from the collector, so the two chips read
   * `default 1.0.0` and `exact 2.0.0`.
   */
  it("keeps default and exact apart, since they are different claims", () => {
    const { fynmesh } = run(twoVersions());
    const apps = fynmesh!.apps;

    const asksNothing = onlyUse(apps, "fynapp-asks-nothing");
    const asksExact = onlyUse(apps, "fynapp-asks-exact");

    expect([useResolution(asksNothing), asksNothing.resolvedVersion]).toEqual(["default", "1.0.0"]);
    expect([useResolution(asksExact), asksExact.resolvedVersion]).toEqual(["exact", "2.0.0"]);
  });

  /*
   * Three states, not two. "Registered, and which version is unknowable" and
   * "no middleware answers to that name at all" have different fixes, and
   * printing `unresolved` for both would send a reader looking for a version
   * problem where there is no middleware.
   */
  it("reports no branch at all when nothing is registered under the name", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-lonely", { name: "nowhere", provider: "mw-a" })],
        middlewares: [{ provider: "mw-a", name: "logger", hostVersion: "1.0.0" }],
      })
    );
    const use = onlyUse(fynmesh!.apps, "fynapp-lonely");

    expect(use.registered).toBe(false);
    expect(useResolution(use)).toBeUndefined();
  });

  it("reports unresolved when the middleware is registered and its version is not readable", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-hopeful", { name: "ghost", provider: "mw-host" }, ["ghost"])],
        middlewares: [
          { provider: "mw-host", name: "ghost", hostVersion: "1.0.0", unreadable: true },
        ],
      })
    );
    const use = onlyUse(fynmesh!.apps, "fynapp-hopeful");

    expect(use.registered).toBe(true);
    expect(use.resolvedVia).toBeUndefined();
    expect(useResolution(use)).toBe("unresolved");
  });
});

describe("what colour a FynApps middleware row is", () => {
  it("warns on the two branches that got something other than what was asked for", () => {
    expect(resolutionTone("fallback")).toBe("warn");
    expect(resolutionTone("unresolved")).toBe("warn");
  });

  it("leaves the three branches that answered the question alone", () => {
    expect(resolutionTone("exact")).toBe("ok");
    expect(resolutionTone("range")).toBe("ok");
    expect(resolutionTone("default")).toBe("ok");
  });

  it("is an error, not a warning, when nothing is registered under the name", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-lonely", { name: "nowhere", provider: "mw-a" })],
        middlewares: [{ provider: "mw-a", name: "logger", hostVersion: "1.0.0" }],
      })
    );
    expect(useTone(onlyUse(fynmesh!.apps, "fynapp-lonely"))).toBe("err");
  });

  it("warns on a fallback that was delivered, where every chip used to be green", () => {
    const { fynmesh } = run(twoVersions());
    const use = onlyUse(fynmesh!.apps, "fynapp-asks-missing");

    expect(use.delivered).toBe(true);
    expect(useTone(use)).toBe("warn");
  });

  it("names the offending declaration and its branch in the row's summary chip", () => {
    const { fynmesh } = run(twoVersions());
    const title = misresolvedTitle([onlyUse(fynmesh!.apps, "fynapp-asks-missing")]);

    expect(title).toContain("shell-layout");
    expect(title).toContain("fallback");
    expect(title).toContain("running a version it did not ask for");
  });
});

/*
 * The point of the ticket. A reader clicks a consumer chip on the Middleware
 * tab and lands on the FynApps row for the same declaration; the two must not
 * tell them different things about how bad it is.
 */
describe("the two tabs agree about severity for one declaration", () => {
  const declaredConsumers = (fynmesh: { middlewares: { versions: { consumers: MiddlewareConsumerNode[] }[]; unpinnedConsumers: MiddlewareConsumerNode[] }[] }) =>
    fynmesh.middlewares
      .flatMap((m) => [...m.versions.flatMap((v) => v.consumers), ...m.unpinnedConsumers])
      .filter((c): c is DeclaredConsumerNode => c.route === "declared");

  const check = (kernel: unknown) => {
    const { fynmesh } = run(kernel);
    const consumers = declaredConsumers(fynmesh!);
    expect(consumers.length).toBeGreaterThan(0);

    for (const c of consumers) {
      const app = fynmesh!.apps.find((a) => a.key === c.app)!;
      // one declaration per fixture app, and it is the one filed as this consumer
      const use = app.usesMiddleware.find((u) => u.resolvedVia === c.via)!;
      expect([c.app, consumerTone(c)]).toEqual([c.app, useTone(use)]);
    }
  };

  it("across all four resolution branches", () => {
    check(twoVersions());
  });

  it("when a middleware was never delivered", () => {
    check(
      devKernel({
        apps: [consumer("fynapp-quiet", { name: "logger", provider: "mw-a" })],
        middlewares: [{ provider: "mw-a", name: "logger", hostVersion: "1.0.0" }],
      })
    );
  });

  it("on the auto-applying shell page, where most consumers never declared anything", () => {
    check(devKernel(autoAppliedShellPage()));
  });
});

/*
 * The other half of the decision: an auto-applied middleware did not resolve,
 * so the FynApps view must not draw it a branch. It says what is observable --
 * this arrived and nothing here asked for it -- in the same words the
 * Middleware view's `undeclared` chip uses.
 */
describe("deliveries this app never declared", () => {
  it("names the auto-applied middleware and leaves the declared one alone", () => {
    const { fynmesh } = run(devKernel(autoAppliedShellPage()));
    const x1 = fynmesh!.apps.find((a) => a.key === "fynapp-x1@1.0.0")!;

    expect(x1.middlewareDelivered).toEqual(["shell-layout", "design-tokens"]);
    expect(undeclaredDeliveries(x1)).toEqual(["shell-layout"]);
  });

  it("says nothing where every delivery has a row of its own", () => {
    const { fynmesh } = run(twoVersions());
    expect(undeclaredDeliveries(appNamed(fynmesh!.apps, "fynapp-asks-exact"))).toEqual([]);
  });

  /*
   * The FynApps view reads this app's own two fields, so it can name an
   * undeclared delivery the Middleware view has to drop: over there the same
   * consumer needs attributing to a registration, and two providers of one name
   * (FYM-333) make that unknowable. A difference in reach, never in tone.
   */
  it("still names one the Middleware view cannot attribute", () => {
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-hosted",
          version: "1.0.0",
          exposes: { "./main": fakeUnit(["execute"]) },
          delivered: ["shell-layout"],
        }),
      ],
      middlewares: [
        { provider: "mw-a", name: "shell-layout", hostVersion: "1.0.0" },
        { provider: "mw-b", name: "shell-layout", hostVersion: "1.0.0" },
      ],
    });
    const { fynmesh } = run(kernel);
    const hosted = appNamed(fynmesh!.apps, "fynapp-hosted");

    expect(undeclaredDeliveries(hosted)).toEqual(["shell-layout"]);
    // and neither registration claims it, because neither can be shown to own it
    for (const mw of fynmesh!.middlewares) {
      expect([...mw.versions.flatMap((v) => v.consumers), ...mw.unpinnedConsumers]).toEqual([]);
    }
  });
});
