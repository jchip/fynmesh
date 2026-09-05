/**
 * The middleware registry, read from the provider's side (FYM-329).
 *
 * The FynApps view asks "what did this app ask for, and what did it get"; the
 * Middleware view asks "who publishes this, and who is actually on it". Both
 * read one collection, so these tests assert the two sides agree: a consumer
 * counted here is the same declaration `usesMiddleware` carries there, pinned
 * to the version the kernel's own resolution order lands it on.
 *
 * The recurring defect this file guards against is a gap rendering as an
 * answer. "No middleware registered", "the registry could not be read", "this
 * middleware has no consumers" and "the app list could not be read so consumers
 * are unknown" are four different states, and each one is asserted separately.
 */

import { describe, expect, it } from "vitest";
import { collect } from "../src/core/collect.js";
import { collectFynMesh } from "../src/core/collectors/fynmesh.js";
import { emptyCapability } from "../src/core/model.js";
import type {
  Capability,
  ContainerNode,
  DeclaredConsumerNode,
  MiddlewareConsumerNode,
  MiddlewareNode,
  MiddlewareVersionNode,
} from "../src/core/model.js";
import { filterMiddleware } from "../src/ui/views/middleware.js";
import { consumerTone } from "../src/ui/middleware-resolution.js";
import { twoContainerPage } from "./fixture.js";
import {
  autoAppliedShellPage,
  devKernel,
  fakeFynApp,
  fakeUnit,
  minifiedKernel,
} from "./kernel-fixture.js";
import type { FakeKernelOptions } from "./kernel-fixture.js";

function run(kernel: unknown, containers: ContainerNode[] = []) {
  const cap: Capability = emptyCapability();
  const result = collectFynMesh(kernel, containers, cap);
  return { cap, ...result };
}

function mwNamed(nodes: MiddlewareNode[], regKey: string): MiddlewareNode {
  const found = nodes.find((m) => m.regKey === regKey);
  if (!found) {
    throw new Error(`no middleware ${regKey} in [${nodes.map((m) => m.regKey).join(", ")}]`);
  }
  return found;
}

/**
 * Narrow to the declared route (FYM-347).
 *
 * `via`, `range` and `pinnedProvider` exist only on a declaration -- an
 * undeclared consumer never asked for anything, so there is nothing there to
 * assert on. The type says so, and these assertions say which route they are
 * about rather than reaching past it.
 */
function declaredOf(consumers: MiddlewareConsumerNode[]): DeclaredConsumerNode[] {
  return consumers.filter((c): c is DeclaredConsumerNode => c.route === "declared");
}

function versionOf(mw: MiddlewareNode, version: string): MiddlewareVersionNode {
  const found = mw.versions.find((v) => v.version === version);
  if (!found) {
    throw new Error(`no version ${version} in [${mw.versions.map((v) => v.version).join(", ")}]`);
  }
  return found;
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
 * One middleware published at two versions, with a consumer on each of the
 * kernel's four resolution branches.
 *
 * 1.0.0 registers first, so it owns the `default` slot for the life of the page
 * (FYM-332) even though 2.0.0 is higher.
 */
function twoVersions(extra: FakeKernelOptions = {}) {
  return devKernel({
    apps: [
      consumer("fynapp-asks-range", { name: "shell-layout", provider: "fynapp-shell-mw", version: "^2.0.0" }, ["shell-layout"]),
      consumer("fynapp-asks-nothing", { name: "shell-layout", provider: "fynapp-shell-mw" }, ["shell-layout"]),
      consumer("fynapp-asks-exact", { name: "shell-layout", provider: "fynapp-shell-mw", version: "2.0.0" }, ["shell-layout"]),
      consumer("fynapp-asks-missing", { name: "shell-layout", provider: "fynapp-shell-mw", version: "^9.0.0" }),
    ],
    middlewares: [
      { provider: "fynapp-shell-mw", name: "shell-layout", hostVersion: "1.0.0" },
      { provider: "fynapp-shell-mw", name: "shell-layout", hostVersion: "2.0.0" },
    ],
    ...extra,
  });
}

describe("a provider with two versions", () => {
  it("marks the first-registered version as the default, not the highest", () => {
    const { fynmesh } = run(twoVersions());
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout");

    expect(mw.name).toBe("shell-layout");
    expect(mw.provider).toBe("fynapp-shell-mw");
    expect(mw.versions.map((v) => v.version)).toEqual(["1.0.0", "2.0.0"]);
    expect(mw.defaultVersion).toBe("1.0.0");
    expect(versionOf(mw, "1.0.0").isDefault).toBe(true);
    expect(versionOf(mw, "2.0.0").isDefault).toBe(false);
  });

  /*
   * The four branches of `MiddlewareManager.resolveFromVersionMap`, in one
   * page. `fallback` is the one that has to stay distinct from `default`: both
   * land on 1.0.0, but one asked for nothing and the other asked for something
   * it did not get.
   */
  it("files each consumer under the version the kernel would resolve it to", () => {
    const { fynmesh } = run(twoVersions());
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout");

    const one = declaredOf(versionOf(mw, "1.0.0").consumers);
    const two = declaredOf(versionOf(mw, "2.0.0").consumers);

    // in the FynApps view's own order, which is by name
    expect(one.map((c) => [c.app, c.via])).toEqual([
      ["fynapp-asks-missing@1.0.0", "fallback"],
      ["fynapp-asks-nothing@1.0.0", "default"],
    ]);
    expect(two.map((c) => [c.app, c.via])).toEqual([
      ["fynapp-asks-exact@1.0.0", "exact"],
      ["fynapp-asks-range@1.0.0", "range"],
    ]);
    expect(mw.unpinnedConsumers).toEqual([]);
    // the node-level list stays the flat one the FynApps view joins against
    expect(mw.consumers.length).toBe(4);
  });

  it("carries the same resolution back onto the consumer's own declaration", () => {
    const { fynmesh } = run(twoVersions());
    const app = fynmesh!.apps.find((a) => a.name === "fynapp-asks-range")!;
    const use = app.usesMiddleware[0];

    expect(use.resolvedRegKey).toBe("fynapp-shell-mw::shell-layout");
    expect(use.resolvedVersion).toBe("2.0.0");
    expect(use.resolvedVia).toBe("range");
    expect(use.resolvedFullKey).toBe("fynapp-shell-mw@2.0.0::shell-layout");
  });

  /*
   * A range nothing satisfies still runs -- the kernel falls back to `default`
   * and warns, and that warning is compiled out of the production build. This
   * row is the only place a production page shows it.
   */
  it("records a range that nothing satisfies as a fallback, not as a match", () => {
    const { fynmesh } = run(twoVersions());
    const app = fynmesh!.apps.find((a) => a.name === "fynapp-asks-missing")!;
    expect(app.usesMiddleware[0].resolvedVersion).toBe("1.0.0");
    expect(app.usesMiddleware[0].resolvedVia).toBe("fallback");
  });
});

describe("consumers", () => {
  it("separates declared-but-undelivered from delivered", () => {
    const { fynmesh } = run(twoVersions());
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout");
    const byApp = new Map(
      declaredOf(mw.versions.flatMap((v) => v.consumers)).map((c) => [c.app, c])
    );

    expect(byApp.get("fynapp-asks-range@1.0.0")!.delivered).toBe(true);
    expect(byApp.get("fynapp-asks-missing@1.0.0")!.delivered).toBe(false);
    // undelivered is not unregistered: this one resolved to a real version
    expect(byApp.get("fynapp-asks-missing@1.0.0")!.via).toBe("fallback");
  });

  it("reports a middleware nobody consumes as empty, with no consumers invented", () => {
    const { fynmesh, cap } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-lonely-mw", version: "1.0.0" })],
        middlewares: [
          { provider: "fynapp-lonely-mw", name: "lonely", hostVersion: "1.0.0" },
        ],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-lonely-mw::lonely");

    expect(mw.consumers).toEqual([]);
    expect(versionOf(mw, "1.0.0").consumers).toEqual([]);
    expect(mw.unpinnedConsumers).toEqual([]);
    // and the app list WAS readable, which is what makes "nobody" a real answer
    expect(cap.kernelRunTime).toBe(true);
  });

  /*
   * "Nobody consumes this" is only sayable when the app list could be read. A
   * kernel whose `runTime.apps` is unreadable has the registry but nothing to
   * read declarations from, and the view keys off `capability.kernelRunTime` to
   * say "unknown" instead of "0" -- so the collector must not fabricate either.
   */
  it("leaves consumers empty and kernelRunTime false when the app list is unreadable", () => {
    const { fynmesh, cap } = run({
      listFynAppStates: () => [],
      runTime: {
        middlewares: {
          "p::solo": {
            "1.0.0": {
              regKey: "p::solo",
              fullKey: "p@1.0.0::solo",
              hostFynApp: { name: "p", version: "1.0.0" },
              exposeName: "./middleware/solo",
              exportName: "__middleware__Solo",
              mw: { name: "solo", apply: () => undefined },
            },
          },
        },
      },
    });

    expect(cap.kernelRunTime).toBe(false);
    expect(cap.kernelMiddleware).toBe(true);
    expect(mwNamed(fynmesh!.middlewares, "p::solo").consumers).toEqual([]);
    expect(cap.notes.join(" ")).toContain("kernel.runTime.apps");
  });
});

/*
 * FYM-347. The Middleware view was built on the claim that filing consumers off
 * the same `usesMiddleware` array the FynApps view renders makes the two tabs
 * incapable of disagreeing. It was false wherever delivery happens without a
 * declaration -- which is not a corner case, it is what `autoApplyScope` is for.
 *
 * The assertion that matters is the last one in this block: the set of apps the
 * Middleware view names as consumers and the set of apps whose
 * `middlewareDelivered` carries the name are computed independently here and
 * compared. That is the contradiction the browser verification photographed,
 * and it is checked rather than reasoned about.
 */
describe("a middleware delivered to FynApps that never declared it", () => {
  const shellPage = () => run(devKernel(autoAppliedShellPage()));

  it("counts an auto-applied FynApp as a consumer, tagged with the route it came by", () => {
    const { fynmesh } = shellPage();
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout");

    // three, and the third is the middleware's own host: autoApplyScope
    // includes "middleware", so it applies to middleware providers too
    expect(mw.consumers).toEqual([
      "fynapp-shell-mw@1.0.0",
      "fynapp-sidebar@1.0.0",
      "fynapp-x1@1.0.0",
    ]);
    // filed under the version that auto-applies, not left dangling
    expect(versionOf(mw, "1.0.0").consumers.map((c) => [c.app, c.route, c.delivered])).toEqual([
      ["fynapp-shell-mw@1.0.0", "undeclared", true],
      ["fynapp-sidebar@1.0.0", "undeclared", true],
      ["fynapp-x1@1.0.0", "undeclared", true],
    ]);
    expect(mw.unpinnedConsumers).toEqual([]);
  });

  it("leaves a declared consumer exactly as it was, resolution and all", () => {
    const { fynmesh } = shellPage();
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-design-tokens::design-tokens");

    expect(mw.consumers).toEqual(["fynapp-x1@1.0.0", "fynapp-x1@2.0.0"]);
    expect(versionOf(mw, "1.0.0").consumers).toEqual([
      {
        route: "declared",
        app: "fynapp-x1@1.0.0",
        range: "^1.0.0",
        pinnedProvider: true,
        delivered: true,
        via: "range",
      },
      {
        route: "declared",
        app: "fynapp-x1@2.0.0",
        range: "^1.0.0",
        pinnedProvider: true,
        delivered: true,
        via: "range",
      },
    ]);
  });

  /*
   * One FynApp, both routes, on one page: `fynapp-x1@1.0.0` declares
   * design-tokens and was handed shell-layout without asking. "Who runs on
   * this" and "who asked for it" are different questions and both stay
   * answerable -- which is the whole point of carrying the route rather than
   * renaming the field to say it counts declarations only.
   */
  it("keeps the two routes apart on the same FynApp", () => {
    const { fynmesh } = shellPage();
    const shell = versionOf(
      mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout"),
      "1.0.0"
    ).consumers.find((c) => c.app === "fynapp-x1@1.0.0")!;
    const tokens = versionOf(
      mwNamed(fynmesh!.middlewares, "fynapp-design-tokens::design-tokens"),
      "1.0.0"
    ).consumers.find((c) => c.app === "fynapp-x1@1.0.0")!;

    expect(shell.route).toBe("undeclared");
    expect(tokens.route).toBe("declared");
    // the undeclared node carries nothing it cannot know: no range, no
    // provider pinning, no resolution branch
    expect(shell).toEqual({ route: "undeclared", app: "fynapp-x1@1.0.0", delivered: true });

    // and the FynApp's own declaration list is untouched by any of it
    const app = fynmesh!.apps.find((a) => a.key === "fynapp-x1@1.0.0")!;
    expect(app.usesMiddleware.map((u) => u.name)).toEqual(["design-tokens"]);
    expect(app.middlewareDelivered).toEqual(["shell-layout", "design-tokens"]);
  });

  it("still reports a middleware nobody declares and nobody receives as having none", () => {
    const { fynmesh, cap } = shellPage();
    const mw = mwNamed(fynmesh!.middlewares, "fynapp-react-middleware::react-context");

    expect(mw.consumers).toEqual([]);
    expect(versionOf(mw, "1.0.0").consumers).toEqual([]);
    expect(mw.unpinnedConsumers).toEqual([]);
    // "nobody" is only a real answer because the app list was readable
    expect(cap.kernelRunTime).toBe(true);
  });

  /*
   * The contradiction itself, checked both ways round on the collector's own
   * output. Before FYM-347 the left side of this was empty for shell-layout and
   * the right side had three entries in it.
   */
  it("agrees with the FynApps view about every middleware on the page", () => {
    const { fynmesh } = shellPage();

    for (const mw of fynmesh!.middlewares) {
      const named = [...mw.versions.flatMap((v) => v.consumers), ...mw.unpinnedConsumers]
        .filter((c) => c.delivered)
        .map((c) => c.app)
        .sort();
      const deliveredTo = fynmesh!.apps
        .filter((a) => a.middlewareDelivered.includes(mw.name))
        .map((a) => a.key)
        .sort();
      expect(named, mw.regKey).toEqual(deliveredTo);
    }

    // and specifically the row the browser verification photographed
    const shell = mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout");
    expect(shell.consumers).toHaveLength(3);
  });

  it("reads the same consumers off the minified kernel", () => {
    const opts = autoAppliedShellPage();
    expect(run(minifiedKernel(opts)).fynmesh!.middlewares).toEqual(
      run(devKernel(opts)).fynmesh!.middlewares
    );
  });

  /*
   * Which version delivered is inferable only when there is one candidate. With
   * two versions auto-applying, an undeclared consumer could have come from
   * either, and `unpinnedConsumers` is where a consumer of the middleware but of
   * no nameable version already belongs -- guessing would put a FynApp on a
   * version it may not be running.
   */
  it("parks an undeclared consumer of two auto-applying versions as unpinned", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [
          fakeFynApp({ name: "fynapp-quiet", version: "1.0.0", delivered: ["shell-layout"] }),
        ],
        middlewares: [
          { provider: "mw-host", name: "shell-layout", hostVersion: "1.0.0", autoApplyScope: ["fynapp"] },
          { provider: "mw-host", name: "shell-layout", hostVersion: "2.0.0", autoApplyScope: ["fynapp"] },
        ],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "mw-host::shell-layout");

    expect(mw.consumers).toEqual(["fynapp-quiet@1.0.0"]);
    expect(versionOf(mw, "1.0.0").consumers).toEqual([]);
    expect(versionOf(mw, "2.0.0").consumers).toEqual([]);
    expect(mw.unpinnedConsumers).toEqual([
      { route: "undeclared", app: "fynapp-quiet@1.0.0", delivered: true },
    ]);
  });

  /*
   * A `middlewareContext` key is a name the middleware chose, not a registry
   * key. Two providers of one name (FYM-333) make it unattributable, and filing
   * the app under either would say it consumes a provider it may never have
   * touched. The `name shared` chip is what explains the short row.
   */
  it("does not attribute a delivered name that two providers register", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-quiet", version: "1.0.0", delivered: ["logger", "ghost"] })],
        middlewares: [
          { provider: "mw-a", name: "logger", hostVersion: "1.0.0", autoApplyScope: ["fynapp"] },
          { provider: "mw-b", name: "logger", hostVersion: "1.0.0", autoApplyScope: ["fynapp"] },
        ],
      })
    );

    expect(mwNamed(fynmesh!.middlewares, "mw-a::logger").consumers).toEqual([]);
    expect(mwNamed(fynmesh!.middlewares, "mw-b::logger").consumers).toEqual([]);
    // "ghost" matches no registration at all and is likewise not invented into one
    expect(fynmesh!.middlewares.map((m) => m.regKey)).toEqual(["mw-a::logger", "mw-b::logger"]);
  });

  /*
   * A declaration and a delivery for the same middleware are one consumer, not
   * two: the declared node already carries `delivered`.
   */
  it("does not double-file a FynApp that both declared it and received it", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-asks", { name: "logger", provider: "mw-a" }, ["logger"])],
        middlewares: [{ provider: "mw-a", name: "logger", hostVersion: "1.0.0" }],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "mw-a::logger");

    expect(mw.consumers).toEqual(["fynapp-asks@1.0.0"]);
    expect(versionOf(mw, "1.0.0").consumers.map((c) => c.route)).toEqual(["declared"]);
  });
});

describe("a name registered by more than one provider", () => {
  /*
   * FYM-333: legal, and silent in production. A consumer that names no provider
   * gets whichever provider the kernel scanned first plus a console.error that
   * terser strips from the min build, so this row is the only surviving trace.
   */
  it("cross-links the colliding regKeys and marks who is exposed to the pick", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [
          consumer("fynapp-vague", { name: "logger" }, ["logger"]),
          consumer("fynapp-precise", { name: "logger", provider: "mw-b" }, ["logger"]),
        ],
        middlewares: [
          { provider: "mw-a", name: "logger", hostVersion: "1.0.0" },
          { provider: "mw-b", name: "logger", hostVersion: "1.0.0" },
        ],
      })
    );

    const a = mwNamed(fynmesh!.middlewares, "mw-a::logger");
    const b = mwNamed(fynmesh!.middlewares, "mw-b::logger");
    expect(a.nameCollisions).toEqual(["mw-b::logger"]);
    expect(b.nameCollisions).toEqual(["mw-a::logger"]);

    // the vague one resolved by name alone; the precise one took the exact key
    const vague = declaredOf(versionOf(a, "1.0.0").consumers).find(
      (c) => c.app === "fynapp-vague@1.0.0"
    )!;
    expect(vague.pinnedProvider).toBe(false);
    const precise = declaredOf(versionOf(b, "1.0.0").consumers).find(
      (c) => c.app === "fynapp-precise@1.0.0"
    )!;
    expect(precise.pinnedProvider).toBe(true);
  });

  it("leaves nameCollisions empty when a name has one provider", () => {
    const { fynmesh } = run(twoVersions());
    expect(mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout").nameCollisions).toEqual(
      []
    );
  });
});

describe("the hooks a registration exposes", () => {
  it("names which override hook it has, rather than only that it has one", () => {
    const { fynmesh } = run(
      devKernel({
        middlewares: [
          {
            provider: "mw-host",
            name: "takeover",
            hostVersion: "1.0.0",
            hasShouldApply: true,
            overrideHooks: ["canOverrideExecution"],
            autoApplyScope: ["fynapp"],
          },
        ],
      })
    );
    const v = versionOf(mwNamed(fynmesh!.middlewares, "mw-host::takeover"), "1.0.0");

    expect(v.hasSetup).toBe(true);
    expect(v.hasApply).toBe(true);
    expect(v.hasShouldApply).toBe(true);
    expect(v.overridesExecution).toBe(true);
    expect(v.overrideHooks).toEqual(["canOverrideExecution"]);
    expect(v.autoApplyScope).toEqual(["fynapp"]);
  });

  it("reports no override hooks as an empty list, not as a missing one", () => {
    const { fynmesh } = run(
      devKernel({
        middlewares: [{ provider: "mw-host", name: "plain", hostVersion: "1.0.0" }],
      })
    );
    const v = versionOf(mwNamed(fynmesh!.middlewares, "mw-host::plain"), "1.0.0");
    expect(v.overridesExecution).toBe(false);
    expect(v.overrideHooks).toEqual([]);
  });
});

describe("auto-apply", () => {
  it("reads runTime.autoApply when the kernel has it", () => {
    const { fynmesh } = run(
      devKernel({
        middlewares: [
          {
            provider: "mw-host",
            name: "universal",
            hostVersion: "1.0.0",
            autoApplyScope: ["all"],
          },
        ],
      })
    );
    expect(fynmesh!.autoApplyReadable).toBe(true);
    expect(mwNamed(fynmesh!.middlewares, "mw-host::universal").autoApply).toEqual([
      "fynapp",
      "mw",
    ]);
  });

  /*
   * `runTime.autoApply` is created lazily, when the first scoped middleware
   * registers, so its absence is ambiguous on its own. `mwMgr.getAutoApply()`
   * is hand-reserved and settles it.
   */
  it("falls back to mwMgr.getAutoApply() when the field is not there yet", () => {
    const { fynmesh } = run(
      devKernel({
        autoApply: "mwMgr",
        middlewares: [
          {
            provider: "mw-host",
            name: "universal",
            hostVersion: "1.0.0",
            autoApplyScope: ["fynapp"],
          },
        ],
      })
    );
    expect(fynmesh!.autoApplyReadable).toBe(true);
    expect(mwNamed(fynmesh!.middlewares, "mw-host::universal").autoApply).toEqual(["fynapp"]);
  });

  it("says unknown rather than none when neither surface answers", () => {
    const { fynmesh, cap } = run(
      devKernel({
        autoApply: "none",
        middlewares: [
          {
            provider: "mw-host",
            name: "universal",
            hostVersion: "1.0.0",
            autoApplyScope: ["fynapp"],
          },
        ],
      })
    );
    expect(fynmesh!.autoApplyReadable).toBe(false);
    // not "[]" and not "['fynapp']" -- the field is left off entirely
    expect(mwNamed(fynmesh!.middlewares, "mw-host::universal").autoApply).toBeUndefined();
    expect(cap.notes.join(" ")).toContain("getAutoApply");
  });
});

describe("absent, empty and unreadable", () => {
  it("distinguishes an empty registry from one that could not be read", () => {
    const empty = run(devKernel());
    expect(empty.cap.kernelMiddleware).toBe(true);
    expect(empty.fynmesh!.middlewares).toEqual([]);
    expect(empty.cap.notes.join(" ")).not.toContain("kernel.runTime.middlewares");

    const unreadable = run(devKernel({ noMiddlewares: true }));
    expect(unreadable.cap.kernelMiddleware).toBe(false);
    expect(unreadable.fynmesh!.middlewares).toEqual([]);
    expect(unreadable.cap.notes.join(" ")).toContain("kernel.runTime.middlewares");
  });

  /*
   * A version key holding something that is not a registration is counted, not
   * skipped. Dropping it would render a two-version middleware as a
   * one-version one and quietly change what `default` appears to mean.
   */
  it("counts a version key whose registration could not be read", () => {
    const { fynmesh } = run(
      devKernel({
        middlewares: [
          { provider: "mw-host", name: "half", hostVersion: "1.0.0" },
          { provider: "mw-host", name: "half", hostVersion: "2.0.0", unreadable: true },
        ],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "mw-host::half");
    expect(mw.versions.map((v) => v.version)).toEqual(["1.0.0"]);
    expect(mw.unreadableVersions).toEqual(["2.0.0"]);
    expect(mw.defaultVersion).toBe("1.0.0");
  });

  it("keeps a consumer that resolves to no readable version out of the version blocks", () => {
    // a registry entry whose only version key is unreadable: the `default`
    // slot never got set, so nothing here resolves to a version
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-hopeful", { name: "ghost", provider: "mw-host" })],
        middlewares: [
          { provider: "mw-host", name: "ghost", hostVersion: "1.0.0", unreadable: true },
        ],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "mw-host::ghost");
    expect(mw.versions).toEqual([]);
    expect(mw.defaultVersion).toBeUndefined();
    expect(declaredOf(mw.unpinnedConsumers).map((c) => [c.app, c.via])).toEqual([
      ["fynapp-hopeful@1.0.0", "unresolved"],
    ]);
    // still counted as a consumer of the middleware, just not of a version
    expect(mw.consumers).toEqual(["fynapp-hopeful@1.0.0"]);
  });
});

describe("the minified kernel", () => {
  /*
   * Every surface this view reads -- `runTime.middlewares`, `runTime.autoApply`,
   * `mwMgr.getAutoApply`, and every field on `FynAppMiddlewareReg` -- is in the
   * kernel's derived reserved-names list, so the production build must produce
   * a byte-identical registry. If this ever fails, the view has started reading
   * something that gets mangled.
   */
  it("reads the same middleware registry as the dev build", () => {
    const opts: FakeKernelOptions = {
      apps: [
        consumer("fynapp-1", { name: "shell-layout", provider: "fynapp-shell-mw", version: "^2.0.0" }, ["shell-layout"]),
      ],
      middlewares: [
        { provider: "fynapp-shell-mw", name: "shell-layout", hostVersion: "1.0.0" },
        {
          provider: "fynapp-shell-mw",
          name: "shell-layout",
          hostVersion: "2.0.0",
          autoApplyScope: ["fynapp"],
          overrideHooks: ["overrideExecute"],
        },
      ],
    };
    const dev = run(devKernel(opts)).fynmesh!;
    const min = run(minifiedKernel(opts)).fynmesh!;

    expect(min.middlewares).toEqual(dev.middlewares);
    expect(min.autoApplyReadable).toBe(true);
    expect(min.build).toBe("minified");
    expect(versionOf(mwNamed(min.middlewares, "fynapp-shell-mw::shell-layout"), "2.0.0").consumers)
      .toHaveLength(1);
  });
});

describe("the snapshot contract", () => {
  /*
   * `adapters/remote.ts` sends this across a postMessage bridge, so one live
   * registration object anywhere in the middleware tree takes the panel down in
   * a devtools realm. The registry holds `hostFynApp` (a whole FynApp, with a
   * Map on it) and `mw` (functions), and neither may leak into the node.
   */
  it("survives a real structuredClone", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({ loader, federation, kernel: twoVersions() });

    const clone = structuredClone(snap);
    expect(clone.fynmesh!.middlewares).toEqual(snap.fynmesh!.middlewares);
    expect(JSON.stringify(snap.fynmesh!.middlewares)).toContain("shell-layout");
  });
});

/*
 * FYM-354. The chip's tick means "something arrived". Its colour used to mean
 * the same thing, which left the one state the inspector is the last witness to
 * -- a consumer running a version it did not ask for -- drawn in the colour
 * that says everything is fine. The kernel's own warning for it is stripped by
 * `drop_console: true`, so there is nothing else left to notice it by.
 */
describe("what colour a consumer chip is drawn in", () => {
  const chipsOn = (mw: MiddlewareNode) =>
    new Map(
      [...mw.versions.flatMap((v) => v.consumers), ...mw.unpinnedConsumers].map((c) => [
        c.app,
        consumerTone(c),
      ])
    );

  it("warns on a fallback resolution even though it was delivered", () => {
    const { fynmesh } = run(twoVersions());
    const tones = chipsOn(mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout"));

    // asked for ^9.0.0, got 1.0.0 through the default slot, and the middleware
    // did write into it -- the tick stays, the colour must not
    const app = fynmesh!.apps.find((a) => a.name === "fynapp-asks-missing")!;
    expect(app.usesMiddleware[0].resolvedVia).toBe("fallback");
    expect(tones.get("fynapp-asks-missing@1.0.0")).toBe("warn");
  });

  it("leaves the branches that got what they asked for alone", () => {
    const { fynmesh } = run(twoVersions());
    const tones = chipsOn(mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout"));

    expect(tones.get("fynapp-asks-exact@1.0.0")).toBe("ok");
    expect(tones.get("fynapp-asks-range@1.0.0")).toBe("ok");
    expect(tones.get("fynapp-asks-nothing@1.0.0")).toBe("ok");
  });

  it("warns on an unresolved consumer, which is the other branch with no answer", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-hopeful", { name: "ghost", provider: "mw-host" }, ["ghost"])],
        middlewares: [
          { provider: "mw-host", name: "ghost", hostVersion: "1.0.0", unreadable: true },
        ],
      })
    );
    const mw = mwNamed(fynmesh!.middlewares, "mw-host::ghost");

    expect(declaredOf(mw.unpinnedConsumers)[0].via).toBe("unresolved");
    expect(chipsOn(mw).get("fynapp-hopeful@1.0.0")).toBe("warn");
  });

  it("still warns when nothing was delivered at all", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [consumer("fynapp-quiet", { name: "logger", provider: "mw-a" })],
        middlewares: [{ provider: "mw-a", name: "logger", hostVersion: "1.0.0" }],
      })
    );
    expect(chipsOn(mwNamed(fynmesh!.middlewares, "mw-a::logger")).get("fynapp-quiet@1.0.0")).toBe(
      "warn"
    );
  });

  it("draws an undeclared consumer as ok: it asked for nothing, so nothing went wrong", () => {
    const { fynmesh } = run(devKernel(autoAppliedShellPage()));
    const tones = chipsOn(mwNamed(fynmesh!.middlewares, "fynapp-shell-mw::shell-layout"));

    expect([...tones.values()]).toEqual(["ok", "ok", "ok"]);
  });
});

describe("filterMiddleware", () => {
  const nodes = [
    {
      regKey: "mw-a::logger",
      name: "logger",
      provider: "mw-a",
      versions: [
        {
          version: "1.0.0",
          hostApp: "mw-a@1.0.0",
          consumers: [
            {
              route: "declared",
              app: "fynapp-1@1.0.0",
              pinnedProvider: true,
              delivered: true,
              via: "default",
            },
          ],
        },
      ],
      consumers: ["fynapp-1@1.0.0"],
      unpinnedConsumers: [],
      unreadableVersions: [],
      nameCollisions: [],
    },
    {
      regKey: "mw-b::shell-layout",
      name: "shell-layout",
      provider: "mw-b",
      versions: [{ version: "1.0.0", hostApp: "mw-b@1.0.0", consumers: [] }],
      consumers: [],
      unpinnedConsumers: [],
      unreadableVersions: [],
      nameCollisions: [],
    },
  ] as unknown as MiddlewareNode[];

  it("matches the regKey, the middleware name and either end's FynApp", () => {
    expect(filterMiddleware(nodes, "").length).toBe(2);
    expect(filterMiddleware(nodes, "mw:logger").map((m) => m.regKey)).toEqual(["mw-a::logger"]);
    expect(filterMiddleware(nodes, "shell").map((m) => m.regKey)).toEqual(["mw-b::shell-layout"]);
    // a query carried in from the FynApps tab finds the middleware that app uses
    expect(filterMiddleware(nodes, "app:fynapp-1").map((m) => m.regKey)).toEqual([
      "mw-a::logger",
    ]);
    expect(filterMiddleware(nodes, "-mw:logger").map((m) => m.regKey)).toEqual([
      "mw-b::shell-layout",
    ]);
  });

  it("ignores fields this tab cannot answer", () => {
    expect(filterMiddleware(nodes, "stage:errored mw:logger").map((m) => m.regKey)).toEqual([
      "mw-a::logger",
    ]);
  });
});
