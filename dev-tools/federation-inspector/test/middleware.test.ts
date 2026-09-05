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
  MiddlewareNode,
  MiddlewareVersionNode,
} from "../src/core/model.js";
import { filterMiddleware } from "../src/ui/views/middleware.js";
import { twoContainerPage } from "./fixture.js";
import { devKernel, fakeFynApp, fakeUnit, minifiedKernel } from "./kernel-fixture.js";
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

    const one = versionOf(mw, "1.0.0").consumers;
    const two = versionOf(mw, "2.0.0").consumers;

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
      [...mw.versions.flatMap((v) => v.consumers)].map((c) => [c.app, c])
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
    const vague = versionOf(a, "1.0.0").consumers.find((c) => c.app === "fynapp-vague@1.0.0")!;
    expect(vague.pinnedProvider).toBe(false);
    const precise = versionOf(b, "1.0.0").consumers.find(
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
    expect(mw.unpinnedConsumers.map((c) => [c.app, c.via])).toEqual([
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
          consumers: [{ app: "fynapp-1@1.0.0", pinnedProvider: true, delivered: true, via: "default" }],
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
