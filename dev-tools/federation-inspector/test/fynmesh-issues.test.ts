/**
 * The FynMesh diagnostics.
 *
 * Every check gets two tests: one that makes it fire and one that makes it stay
 * quiet. The second is the load-bearing one. A diagnostic that fires on a page
 * that is fine gets the whole view ignored, which is strictly worse than not
 * having written it -- so "does not fire" is asserted against the shape a
 * healthy demo page actually has, not against an empty snapshot.
 *
 * The kernel fakes come from `kernel-fixture.ts` and are built to the kernel's
 * own contracts, so a failure here means the diagnostic disagrees with the
 * kernel rather than that two mocks drifted.
 */

import { describe, expect, it } from "vitest";
import { findIssues } from "../src/analysis/issues.js";
import { buildGraph } from "../src/analysis/graph.js";
import { collectFynMesh } from "../src/core/collectors/fynmesh.js";
import { emptySnapshot } from "../src/core/model.js";
import type {
  ContainerNode,
  FynAppManifest,
  Issue,
  ShareScopeNode,
} from "../src/core/model.js";
import {
  autoAppliedShellPage,
  devKernel,
  fakeContainerNode,
  fakeFynApp,
  fakeUnit,
  type FakeKernelOptions,
} from "./kernel-fixture.js";

/** Everything this file is responsible for; the federation ones are tested elsewhere. */
const FYNMESH_CODES = new Set([
  "fynmesh-checks-unavailable",
  "fynapp-bootstrap-failed",
  "fynapp-bootstrap-stalled",
  "middleware-not-registered",
  "middleware-declaration-unreadable",
  "middleware-range-unsatisfied",
  "middleware-multiple-versions",
  "middleware-provider-ambiguous",
  "middleware-auto-apply-undelivered",
  "fynapp-name-ambiguous",
  "fynmesh-provider-absent",
  "fynmesh-import-target-absent",
  "fynmesh-provider-mismatch",
  "container-not-fynapp",
]);

interface PageOptions extends FakeKernelOptions {
  containers?: ContainerNode[];
  scopes?: ShareScopeNode[];
  /** build the kernel without one of its surfaces, to test the "could not check" row */
  kernel?: unknown;
}

/** Run the whole diagnostic pass over a page, and keep only the FynMesh half. */
function issuesOf(opts: PageOptions): Issue[] {
  const { containers = [], scopes = [], kernel, ...kernelOpts } = opts;
  const snap = emptySnapshot();
  const { fynmesh } = collectFynMesh(kernel ?? devKernel(kernelOpts), containers, snap.capability);
  snap.fynmesh = fynmesh;
  snap.containers = containers;
  snap.scopes = scopes;
  // set the same way the federation collector sets it: seen on a container
  snap.capability.manifest = containers.some((c) => c.versions.some((v) => v.manifest));
  return findIssues(snap, buildGraph(snap)).filter((i) => FYNMESH_CODES.has(i.code));
}

function codes(issues: Issue[]): string[] {
  return issues.map((i) => i.code);
}

function one(issues: Issue[], code: string): Issue {
  const found = issues.filter((i) => i.code === code);
  expect(found, `expected exactly one ${code} in [${codes(issues).join(", ")}]`).toHaveLength(1);
  return found[0];
}

/* ------------------------------------------------------------ healthy page */

/**
 * The shape the demo page actually has: everything mounted, every declared
 * middleware registered and delivered, every manifest name loaded.
 *
 * Asserted against zero, not "few". This is the page the tool has to stay
 * silent on, and the assertion is deliberately the whole list rather than a
 * per-code check, so a diagnostic added later cannot start crying wolf without
 * failing here first.
 */
function healthyPage(): PageOptions {
  const provider = fakeFynApp({
    name: "fynapp-design-tokens",
    version: "1.0.0",
    exposes: {
      "./main": fakeUnit(["initialize", "execute"]),
      "./middleware/design-tokens": {},
    },
  });
  const consumer = fakeFynApp({
    name: "fynapp-1",
    version: "1.0.0",
    exposes: {
      "./main": fakeUnit(
        ["initialize", "execute"],
        [{ info: { name: "design-tokens", provider: "fynapp-design-tokens" }, config: { theme: "dark" } }]
      ),
    },
    delivered: ["design-tokens"],
  });

  const manifest: FynAppManifest = {
    name: "fynapp-1",
    version: "1.0.0",
    "shared-providers": {
      "fynapp-design-tokens": { semver: "^1.0.0", provides: [] },
    },
    "import-exposed": {
      "fynapp-design-tokens": { "middleware/design-tokens": { type: "middleware" } },
    },
  };

  return {
    apps: [provider, consumer],
    states: [
      { name: "fynapp-design-tokens", version: "1.0.0", status: "mounted" },
      { name: "fynapp-1", version: "1.0.0", status: "mounted" },
    ],
    middlewares: [
      { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
    ],
    containers: [
      fakeContainerNode({ name: "fynapp-1", version: "1.0.0", manifest }),
      fakeContainerNode({ name: "fynapp-design-tokens", version: "1.0.0", manifest: { name: "fynapp-design-tokens" } }),
    ],
  };
}

describe("a page with nothing wrong", () => {
  it("reports nothing at all", () => {
    expect(codes(issuesOf(healthyPage()))).toEqual([]);
  });

  /*
   * Absent is not empty, at the outermost level: a page with no kernel gets no
   * FynMesh diagnostics *and* no "could not check" row, because there is
   * nothing there to have checked. The FynApps tab hides itself for the same
   * reason.
   */
  it("says nothing about FynMesh on a page that has no kernel", () => {
    const snap = emptySnapshot();
    expect(snap.fynmesh).toBeUndefined();
    expect(codes(findIssues(snap, buildGraph(snap)).filter((i) => FYNMESH_CODES.has(i.code)))).toEqual([]);
  });
});

/* ---------------------------------------------------------------- lifecycle */

describe("bootstrap failures", () => {
  it("reports a failed FynApp with the error the kernel retained", () => {
    const issue = one(
      issuesOf({
        apps: [fakeFynApp({ name: "fynapp-2", version: "1.0.0" })],
        states: [
          {
            name: "fynapp-2",
            version: "1.0.0",
            status: "failed",
            error: new Error("Cannot read properties of undefined (reading 'render')"),
          },
        ],
      }),
      "fynapp-bootstrap-failed"
    );
    expect(issue.severity).toBe("error");
    expect(issue.title).toContain("fynapp-2@1.0.0");
    expect(issue.detail).toContain("reading 'render'");
    // actionable: says what the consequence is and that the error is perishable
    expect(issue.detail).toContain("FynUnits never ran");
    expect(issue.detail).toContain("before reloading");
    expect(issue.view).toBe("fynapps");
  });

  it("still reports a failure the kernel kept no error for", () => {
    const issue = one(
      issuesOf({
        apps: [fakeFynApp({ name: "fynapp-2", version: "1.0.0" })],
        states: [{ name: "fynapp-2", version: "1.0.0", status: "failed" }],
      }),
      "fynapp-bootstrap-failed"
    );
    expect(issue.detail).toContain("retained no error object");
  });

  it("does not fire for mounted, suspended or shutdown apps", () => {
    for (const status of ["mounted", "suspended", "shutdown"]) {
      expect(
        codes(
          issuesOf({
            apps: [fakeFynApp({ name: "fynapp-2", version: "1.0.0" })],
            states: [{ name: "fynapp-2", version: "1.0.0", status }],
          })
        )
      ).not.toContain("fynapp-bootstrap-failed");
    }
  });
});

describe("a bootstrap that never finishes", () => {
  const stalled = (ageMs: number, meta?: unknown[]): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-slow",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["initialize", "execute"], meta) },
      }),
    ],
    states: [
      {
        name: "fynapp-slow",
        version: "1.0.0",
        status: "bootstrapping",
        updatedAt: Date.now() - ageMs,
      },
    ],
  });

  it("reports one that has sat in bootstrapping past the threshold", () => {
    const issue = one(issuesOf(stalled(60_000)), "fynapp-bootstrap-stalled");
    expect(issue.severity).toBe("warn");
    expect(issue.title).toMatch(/bootstrapping for \d+s/);
    expect(issue.detail).toContain("Every middleware it declares is registered");
  });

  it("names the unregistered middleware, because that is where to look", () => {
    const issue = one(
      issuesOf(stalled(60_000, [{ info: { name: "shell-layout", provider: "fynapp-shell-mw" } }])),
      "fynapp-bootstrap-stalled"
    );
    expect(issue.detail).toContain("fynapp-shell-mw::shell-layout");
    expect(codes(issuesOf(stalled(60_000, [{ info: { name: "shell-layout", provider: "fynapp-shell-mw" } }])))).toContain(
      "middleware-not-registered"
    );
  });

  /*
   * The whole point of the threshold. A snapshot taken while the page is still
   * coming up catches apps mid-bootstrap every time, and reporting those would
   * make the view fire on every cold load.
   */
  it("says nothing about one that only just started", () => {
    expect(codes(issuesOf(stalled(500)))).not.toContain("fynapp-bootstrap-stalled");
  });

  it("says nothing when the kernel kept no timestamp to measure against", () => {
    const kernel = devKernel({
      apps: [fakeFynApp({ name: "fynapp-slow", version: "1.0.0" })],
    });
    (kernel as any).listFynAppStates = () => [
      { name: "fynapp-slow", version: "1.0.0", status: "bootstrapping" },
    ];
    expect(codes(issuesOf({ kernel }))).not.toContain("fynapp-bootstrap-stalled");
  });
});

/* --------------------------------------------------------------- middleware */

describe("middleware nothing registers", () => {
  const declaring = (meta: unknown[]): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["initialize", "execute"], meta) },
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
  });

  it("reports it as an error, with the consequence and the convention to check", () => {
    const issue = one(
      issuesOf(declaring([{ info: { name: "design-tokens", provider: "fynapp-design-tokens" } }])),
      "middleware-not-registered"
    );
    expect(issue.severity).toBe("error");
    expect(issue.title).toContain("fynapp-design-tokens::design-tokens");
    expect(issue.detail).toContain("`execute()` never runs");
    expect(issue.detail).toContain("__middleware__");
    // the reason this row exists at all
    expect(issue.detail).toContain("compiled out of the production build");
  });

  it("says something different when the declaration named no provider", () => {
    const issue = one(issuesOf(declaring([{ info: { name: "design-tokens" } }])), "middleware-not-registered");
    expect(issue.detail).toContain("scanned every registered middleware");
  });

  it("does not fire when the middleware is registered", () => {
    expect(
      codes(
        issuesOf({
          ...declaring([{ info: { name: "design-tokens", provider: "fynapp-design-tokens" } }]),
          middlewares: [
            { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
          ],
        })
      )
    ).not.toContain("middleware-not-registered");
  });
});

describe("a declaration the kernel cannot read", () => {
  const withMeta = (meta: unknown[]): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["initialize", "execute"], meta) },
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
  });

  it("reports a shape the executor would throw on", () => {
    const issue = one(issuesOf(withMeta([42])), "middleware-declaration-unreadable");
    expect(issue.severity).toBe("error");
    expect(issue.detail).toContain("unusableMiddlewareMeta");
    expect(issue.detail).toContain("fails the whole FynApp");
  });

  it("reports a middleware string that does not parse, and quotes it", () => {
    const issue = one(
      issuesOf(withMeta(["-FYNAPP_MIDDLEWARE fynapp-design-tokens"])),
      "middleware-declaration-unreadable"
    );
    expect(issue.detail).toContain("-FYNAPP_MIDDLEWARE fynapp-design-tokens");
    expect(issue.detail).toContain("does not parse");
  });

  /*
   * The string form the demo actually emits, trailing space and no semver
   * included. It parses, so it is not a declaration problem -- it is an
   * unregistered middleware, which is a different row.
   */
  it("does not fire on the string form the build really emits", () => {
    const found = codes(
      issuesOf(withMeta(["-FYNAPP_MIDDLEWARE fynapp-react-middleware main/basic-counter "]))
    );
    expect(found).not.toContain("middleware-declaration-unreadable");
    expect(found).toContain("middleware-not-registered");
  });
});

describe("a declared range nothing satisfies (FYM-321)", () => {
  const asking = (range: string | undefined, hostVersions: string[]): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: {
          "./main": fakeUnit(
            ["initialize", "execute"],
            [{ info: { name: "design-tokens", provider: "fynapp-design-tokens", version: range } }]
          ),
        },
        delivered: ["design-tokens"],
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    middlewares: hostVersions.map((hostVersion) => ({
      provider: "fynapp-design-tokens",
      name: "design-tokens",
      hostVersion,
    })),
  });

  it("names the version asked for and the default it actually gets", () => {
    const issue = one(issuesOf(asking("^2.0.0", ["1.0.0"])), "middleware-range-unsatisfied");
    expect(issue.severity).toBe("warn");
    expect(issue.title).toContain("^2.0.0");
    expect(issue.title).toContain("got 1.0.0");
    expect(issue.detail).toContain("`default`");
    expect(issue.detail).toContain("not the version it asked for");
    expect(issue.detail).toContain("compiled out of the production build");
  });

  it("says so differently when the kernel cannot read the range at all", () => {
    const issue = one(issuesOf(asking("next", ["1.0.0"])), "middleware-range-unsatisfied");
    expect(issue.title).toContain("not a range the kernel can read");
    expect(issue.detail).toContain("does not even try");
  });

  /*
   * A hyphen range is the one form where this module's matcher is *more*
   * capable than the kernel's. The kernel is the one that ran, so the row has
   * to describe what the kernel did -- fall back -- and not what a better
   * matcher would have matched.
   */
  it("treats a hyphen range as unreadable, because the kernel does", () => {
    const issue = one(issuesOf(asking("1.0.0 - 2.0.0", ["1.5.0"])), "middleware-range-unsatisfied");
    expect(issue.title).toContain("not a range the kernel can read");
  });

  it("does not fire when a registered version satisfies the range", () => {
    expect(codes(issuesOf(asking("^1.0.0", ["1.2.0"])))).not.toContain("middleware-range-unsatisfied");
  });

  /* `getMiddleware` takes an exact version key before it looks at ranges. */
  it("does not fire when the range is an exact registered version key", () => {
    expect(codes(issuesOf(asking("1.0.0", ["1.0.0"])))).not.toContain("middleware-range-unsatisfied");
  });

  it("does not fire for a declaration that asked for nothing", () => {
    for (const range of [undefined, "*"]) {
      expect(codes(issuesOf(asking(range, ["1.0.0"])))).not.toContain("middleware-range-unsatisfied");
    }
  });

  /*
   * A registered version neither matcher can parse still resolves: the kernel's
   * `maxSatisfying` finds nothing, falls back, and warns. The collector mirrors
   * that, and this row reports what actually happened rather than declining to
   * have an opinion.
   */
  it("still reports the fallback when a registered version will not parse", () => {
    const issue = one(issuesOf(asking("^2.0.0", ["nightly"])), "middleware-range-unsatisfied");
    expect(issue.title).toContain("got nightly");
  });
});

describe("two versions of one middleware (FYM-332)", () => {
  const twoVersions = (range?: string): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: {
          "./main": fakeUnit(
            ["initialize", "execute"],
            [{ info: { name: "design-tokens", provider: "fynapp-design-tokens", version: range } }]
          ),
        },
        delivered: ["design-tokens"],
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    middlewares: [
      { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
      { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "2.0.0" },
    ],
  });

  /*
   * The wording matters as much as the firing. First-registered-wins is the
   * documented rule, kept deliberately in FYM-332; describing it as a bug would
   * send the reader to fix the kernel instead of their own declaration.
   */
  it("describes first-registered as the rule and the ambiguity as the issue", () => {
    const issue = one(issuesOf(twoVersions()), "middleware-multiple-versions");
    expect(issue.severity).toBe("warn");
    expect(issue.detail).toContain("first version that registered (1.0.0)");
    expect(issue.detail).toContain("never re-points it");
    expect(issue.detail).toContain("fynapp-1@1.0.0");
    expect(issue.detail).toContain("Declare a version range");
  });

  it("drops to info when every consumer already declares a range", () => {
    const issue = one(issuesOf(twoVersions("^2.0.0")), "middleware-multiple-versions");
    expect(issue.severity).toBe("info");
    expect(issue.detail).toContain("nothing is resolving through `default` today");
  });

  it("does not fire on a single registered version", () => {
    expect(
      codes(
        issuesOf({
          ...twoVersions(),
          middlewares: [
            { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
          ],
        })
      )
    ).not.toContain("middleware-multiple-versions");
  });
});

describe("two providers of one middleware name (FYM-333)", () => {
  const twoProviders = (provider?: string): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: {
          "./main": fakeUnit(["initialize", "execute"], [{ info: { name: "design-tokens", provider } }]),
        },
        delivered: ["design-tokens"],
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    middlewares: [
      { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
      { provider: "fynapp-other-tokens", name: "design-tokens", hostVersion: "1.0.0" },
    ],
  });

  it("names the pick the kernel actually made for a provider-less declaration", () => {
    const issue = one(issuesOf(twoProviders()), "middleware-provider-ambiguous");
    expect(issue.severity).toBe("warn");
    expect(issue.detail).toContain("fynapp-design-tokens::design-tokens");
    expect(issue.detail).toContain("fynapp-other-tokens::design-tokens");
    expect(issue.detail).toMatch(
      /fynapp-1@1\.0\.0 did not pin a provider and resolved to fynapp-\S+::design-tokens/
    );
    expect(issue.detail).toContain("Name the provider");
  });

  it("drops to info when every declaration names its provider", () => {
    const issue = one(issuesOf(twoProviders("fynapp-other-tokens")), "middleware-provider-ambiguous");
    expect(issue.severity).toBe("info");
    expect(issue.detail).toContain("trap set for the next consumer");
  });

  it("does not fire when only one provider registers the name", () => {
    expect(
      codes(
        issuesOf({
          ...twoProviders(),
          middlewares: [
            { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
          ],
        })
      )
    ).not.toContain("middleware-provider-ambiguous");
  });
});

/* --------------------------------------------------------- auto-apply reach */

describe("a middleware that auto-applies and reached nobody (FYM-357)", () => {
  /** An auto-applying middleware, two FynApps, and no trace of it on either. */
  const unreachedPage = (over: Partial<PageOptions> = {}): PageOptions => ({
    apps: [
      fakeFynApp({ name: "fynapp-1", version: "1.0.0", exposes: { "./main": fakeUnit(["execute"]) } }),
      fakeFynApp({ name: "fynapp-shell-mw", version: "1.0.0", exposes: { "./main": fakeUnit(["execute"]) } }),
    ],
    states: [
      { name: "fynapp-1", version: "1.0.0", status: "mounted" },
      { name: "fynapp-shell-mw", version: "1.0.0", status: "mounted" },
    ],
    middlewares: [
      {
        provider: "fynapp-shell-mw",
        name: "shell-layout",
        hostVersion: "1.0.0",
        autoApplyScope: ["fynapp", "middleware"],
      },
    ],
    ...over,
  });

  it("says what was intended, what is missing, and what would explain it", () => {
    const issue = one(issuesOf(unreachedPage()), "middleware-auto-apply-undelivered");
    expect(issue.severity).toBe("info");
    expect(issue.title).toContain("fynapp-shell-mw::shell-layout");
    expect(issue.detail).toContain("autoApplyScope is fynapp, middleware");
    expect(issue.detail).toContain("2 FynApps the kernel has registered");
    // the three readings it cannot tell apart, and the way to tell them apart
    expect(issue.detail).toContain("not proof it never ran");
    expect(issue.detail).toContain("shouldApply");
    expect(issue.detail).toContain("context.fynApp.middlewareContext");
    expect(issue.view).toBe("middleware");
    expect(issue.focus).toBe("mw:shell-layout");
    expect(issue.refs).toContain("fynapp-shell-mw@1.0.0");
  });

  it("names the override hooks, when those are what needs no context entry", () => {
    const issue = one(
      issuesOf(
        unreachedPage({
          middlewares: [
            {
              provider: "fynapp-shell-mw",
              name: "shell-layout",
              hostVersion: "1.0.0",
              autoApplyScope: ["fynapp"],
              overrideHooks: ["overrideExecute"],
            },
          ],
        })
      ),
      "middleware-auto-apply-undelivered"
    );
    expect(issue.detail).toContain("It implements overrideExecute");
  });

  /*
   * The case that blocked this check until FYM-347, and the reason it is tested
   * against the real shell page's shape rather than an empty snapshot:
   * `shell-layout` auto-applies, nothing declares it, and three FynApps carry
   * it. Reported here, the row would have contradicted the FynApps view on
   * screen -- and been the first thing a reader learned to ignore.
   */
  it("stays quiet when every delivery came by the undeclared route", () => {
    expect(codes(issuesOf(autoAppliedShellPage()))).not.toContain(
      "middleware-auto-apply-undelivered"
    );
  });

  /*
   * `fynapp-react-middleware::react-context` is in exactly this state on both
   * demo pages: registered, declared by nobody, delivered to nobody. A provider
   * publishing something this page has not needed yet is not broken, and the
   * narrower condition is what keeps the check off a healthy page.
   */
  it("stays quiet for an unused middleware that does not auto-apply", () => {
    expect(
      codes(
        issuesOf(
          unreachedPage({
            middlewares: [
              { provider: "fynapp-react-middleware", name: "react-context", hostVersion: "1.0.0" },
            ],
          })
        )
      )
    ).not.toContain("middleware-auto-apply-undelivered");
  });

  it("stays quiet as soon as one FynApp carries it", () => {
    expect(
      codes(
        issuesOf(
          unreachedPage({
            apps: [
              fakeFynApp({
                name: "fynapp-1",
                version: "1.0.0",
                exposes: { "./main": fakeUnit(["execute"]) },
                delivered: ["shell-layout"],
              }),
              fakeFynApp({ name: "fynapp-shell-mw", version: "1.0.0" }),
            ],
          })
        )
      )
    ).not.toContain("middleware-auto-apply-undelivered");
  });
});

describe("an auto-applying middleware whose reach cannot be judged", () => {
  /*
   * FYM-333 in its sharpest form: `fynapp-1` really is carrying `shell-layout`,
   * but two providers register that name, so the collector attributes the
   * delivery to neither and both consumer lists are empty. The consumers exist
   * and are unattributable -- which is not the same claim as "reached nobody".
   */
  const collidingPage = (): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["execute"]) },
        delivered: ["shell-layout"],
      }),
    ],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    middlewares: [
      {
        provider: "fynapp-shell-mw",
        name: "shell-layout",
        hostVersion: "1.0.0",
        autoApplyScope: ["fynapp"],
      },
      { provider: "fynapp-other-shell", name: "shell-layout", hostVersion: "1.0.0" },
    ],
  });

  it("does not report it as unreached", () => {
    expect(codes(issuesOf(collidingPage()))).not.toContain(
      "middleware-auto-apply-undelivered"
    );
  });

  it("says so, rather than going silent", () => {
    const issue = one(issuesOf(collidingPage()), "fynmesh-checks-unavailable");
    expect(issue.detail).toContain("whether fynapp-shell-mw::shell-layout reached anything");
    expect(issue.detail).toContain("fynapp-other-shell::shell-layout");
    expect(issue.detail).toContain("unattributable rather than absent");
  });
});

describe("auto-apply reach with nothing to read", () => {
  const page = (): PageOptions => ({
    apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    middlewares: [
      {
        provider: "fynapp-shell-mw",
        name: "shell-layout",
        hostVersion: "1.0.0",
        autoApplyScope: ["fynapp"],
      },
    ],
  });

  /*
   * Without `runTime.apps` every middleware has zero consumers, so an ungated
   * check reports every auto-applying one on the page as unreached. The row
   * that already names that surface is where this belongs.
   */
  it("checks nothing when kernel.runTime.apps could not be read", () => {
    const kernel = devKernel(page()) as any;
    kernel.runTime = { middlewares: kernel.runTime.middlewares };
    const issues = issuesOf({ kernel });
    expect(codes(issues)).not.toContain("middleware-auto-apply-undelivered");
    expect(one(issues, "fynmesh-checks-unavailable").detail).toContain(
      "whether an auto-applying middleware reached anything"
    );
  });

  it("checks nothing when the registry is readable and holds no FynApp", () => {
    const issues = issuesOf({ ...page(), apps: [], states: [] });
    expect(codes(issues)).not.toContain("middleware-auto-apply-undelivered");
    expect(one(issues, "fynmesh-checks-unavailable").detail).toContain(
      "nothing on this page to reach"
    );
  });
});

describe("an auto-applying middleware scoped at a bucket this page is empty of", () => {
  /*
   * "In scope" is not a preference the kernel weighs. `getTargetMiddlewares`
   * hands a FynApp the `mw` list or the `fynapp` list and never both, chosen by
   * `isFynAppMiddlewareProvider` -- did it import a `./middleware/*` expose. A
   * middleware scoped to the bucket this page has nobody in reached nobody by
   * arithmetic, and reporting that is reporting a page for its own contents.
   */
  const page = (over: { providerExpose?: boolean } = {}): PageOptions => ({
    apps: [
      fakeFynApp({
        name: "fynapp-1",
        version: "1.0.0",
        exposes: over.providerExpose
          ? { "./main": fakeUnit(["execute"]), "./middleware/other": { __middleware__other: {} } }
          : { "./main": fakeUnit(["execute"]) },
      }),
      fakeFynApp({
        name: "fynapp-shell-mw",
        version: "1.0.0",
        exposes: { "./main": fakeUnit(["execute"]) },
      }),
    ],
    states: [
      { name: "fynapp-1", version: "1.0.0", status: "mounted" },
      { name: "fynapp-shell-mw", version: "1.0.0", status: "mounted" },
    ],
    middlewares: [
      {
        provider: "fynapp-shell-mw",
        name: "shell-layout",
        hostVersion: "1.0.0",
        autoApplyScope: ["middleware"],
      },
    ],
  });

  it("does not report it, and says the scope is why", () => {
    const issues = issuesOf(page());
    expect(codes(issues)).not.toContain("middleware-auto-apply-undelivered");
    const skipped = one(issues, "fynmesh-checks-unavailable");
    expect(skipped.detail).toContain("whether fynapp-shell-mw::shell-layout reached anything");
    expect(skipped.detail).toContain("autoApplyScope is middleware");
    expect(skipped.detail).toContain("is in that scope");
  });

  it("reports it as soon as one FynApp is in the bucket", () => {
    const issue = one(
      issuesOf(page({ providerExpose: true })),
      "middleware-auto-apply-undelivered"
    );
    // one of the two FynApps imported a `./middleware/*` expose, so exactly one
    // could ever have been offered this middleware
    expect(issue.detail).toContain("1 of the 2 FynApps the kernel has registered is in that scope");
  });

  /*
   * A misspelt scope selects neither list -- registration tests for the exact
   * strings -- so it auto-applies to nothing, and "nobody is in that scope" is
   * the literally correct reading rather than a lenient one.
   */
  /*
   * On a kernel with neither `runTime.autoApply` nor `mwMgr.getAutoApply()`
   * there is no kernel-side bucket list to read, so the registration rule is
   * re-applied to the declared scopes here. The verdict must come out the same
   * either way -- otherwise the fallback is a second, quieter opinion.
   */
  it("falls back to the declared scope when the kernel exposes no bucket list", () => {
    expect(codes(issuesOf({ ...page(), autoApply: "none" }))).not.toContain(
      "middleware-auto-apply-undelivered"
    );
    const issue = one(
      issuesOf({ ...page({ providerExpose: true }), autoApply: "none" }),
      "middleware-auto-apply-undelivered"
    );
    expect(issue.detail).toContain("1 of the 2 FynApps the kernel has registered is in that scope");
  });

  it("treats a scope the kernel does not recognise as selecting nobody", () => {
    const issues = issuesOf({
      ...page(),
      middlewares: [
        {
          provider: "fynapp-shell-mw",
          name: "shell-layout",
          hostVersion: "1.0.0",
          autoApplyScope: ["fynapps"],
        },
      ],
    });
    expect(codes(issues)).not.toContain("middleware-auto-apply-undelivered");
    expect(one(issues, "fynmesh-checks-unavailable").detail).toContain(
      "autoApplyScope is fynapps"
    );
  });
});

describe("auto-apply reach against FynApps that are no longer registered", () => {
  /*
   * `fynmesh.apps` is the registry unioned with the lifecycle table, and a row
   * that exists only in the lifecycle table is a shutdown app: no exposes, no
   * `middlewareDelivered`, and an empty list there means unreadable rather than
   * empty. Counting one as a FynApp the middleware failed to reach would report
   * a middleware for not reaching something that is gone.
   */
  it("counts registry rows only, and skips when they are all gone", () => {
    const issues = issuesOf({
      apps: [],
      states: [{ name: "fynapp-1", version: "1.0.0", status: "shutdown" }],
      middlewares: [
        {
          provider: "fynapp-shell-mw",
          name: "shell-layout",
          hostVersion: "1.0.0",
          autoApplyScope: ["fynapp"],
        },
      ],
    });
    expect(codes(issues)).not.toContain("middleware-auto-apply-undelivered");
    expect(one(issues, "fynmesh-checks-unavailable").detail).toContain(
      "nothing on this page to reach"
    );
  });
});

/* ------------------------------------------------------------- app registry */

describe("two versions of one FynApp name", () => {
  const twoVersions: PageOptions = {
    apps: [
      fakeFynApp({ name: "fynapp-x1", version: "1.0.0" }),
      fakeFynApp({ name: "fynapp-x1", version: "2.0.0" }),
    ],
    states: [
      { name: "fynapp-x1", version: "1.0.0", status: "mounted" },
      { name: "fynapp-x1", version: "2.0.0", status: "mounted" },
    ],
  };

  /*
   * The two registries tie-break in opposite directions and the rows have to
   * say so: the app registry keeps the LAST registration under the bare name,
   * the middleware registry keeps the FIRST under `default`.
   */
  it("says the bare name resolves to the last registration, not the first", () => {
    const issue = one(issuesOf(twoVersions), "fynapp-name-ambiguous");
    expect(issue.severity).toBe("info");
    expect(issue.detail).toContain("registered last");
    expect(issue.detail).toContain("opposite of the middleware registry");
    // agrees with the FynApps view, which flags the same instance as `default`
    expect(issue.detail).toContain("gets 2.0.0");
  });

  it("does not fire when one name has one version", () => {
    expect(
      codes(
        issuesOf({
          apps: [fakeFynApp({ name: "fynapp-x1", version: "2.0.0" })],
          states: [{ name: "fynapp-x1", version: "2.0.0", status: "mounted" }],
        })
      )
    ).not.toContain("fynapp-name-ambiguous");
  });
});

/* ------------------------------------------------------------ manifest joins */

describe("manifest names that are not on the page", () => {
  const manifest: FynAppManifest = {
    name: "fynapp-1",
    "shared-providers": {
      "fynapp-react-lib": { semver: "^19.0.0", provides: ["esm-react"] },
    },
    "import-exposed": {
      "fynapp-x1": { main: { semver: "^2.0.0" } },
    },
  };
  const page = (extra: ContainerNode[]): PageOptions => ({
    apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })],
    states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted" }],
    containers: [fakeContainerNode({ name: "fynapp-1", version: "1.0.0", manifest }), ...extra],
  });

  it("reports a declared share provider with nothing of that name loaded", () => {
    const issue = one(issuesOf(page([])), "fynmesh-provider-absent");
    expect(issue.severity).toBe("warn");
    expect(issue.title).toContain("fynapp-react-lib");
    expect(issue.title).toContain("esm-react");
    expect(issue.detail).toContain("neither a FynApp nor a federation container");
  });

  it("reports an import-exposed target with nothing of that name loaded", () => {
    const issue = one(issuesOf(page([])), "fynmesh-import-target-absent");
    expect(issue.severity).toBe("warn");
    expect(issue.title).toContain("fynapp-x1");
    expect(issue.detail).toContain("resolves to nothing");
  });

  /*
   * The FYM-341 rule, as a test. A container the kernel never adopted still
   * provides its shares and still exposes its modules, so calling it missing
   * would contradict the Containers view on screen. It is reported once, as an
   * aggregate info row, and not as an absence.
   */
  it("does not call a loaded container missing just because it is not a FynApp", () => {
    const found = codes(
      issuesOf(
        page([
          fakeContainerNode({ name: "fynapp-react-lib", version: "19.2.8", manifest: { name: "fynapp-react-lib" } }),
          fakeContainerNode({ name: "fynapp-x1", version: "2.0.0", manifest: { name: "fynapp-x1" } }),
        ])
      )
    );
    expect(found).not.toContain("fynmesh-provider-absent");
    expect(found).not.toContain("fynmesh-import-target-absent");
    expect(found).toContain("container-not-fynapp");
  });

  it("does not fire when the names are loaded as FynApps", () => {
    const found = codes(
      issuesOf({
        apps: [
          fakeFynApp({ name: "fynapp-1", version: "1.0.0" }),
          fakeFynApp({ name: "fynapp-react-lib", version: "19.2.8" }),
          fakeFynApp({ name: "fynapp-x1", version: "2.0.0" }),
        ],
        states: [
          { name: "fynapp-1", version: "1.0.0", status: "mounted" },
          { name: "fynapp-react-lib", version: "19.2.8", status: "mounted" },
          { name: "fynapp-x1", version: "2.0.0", status: "mounted" },
        ],
        containers: [
          fakeContainerNode({ name: "fynapp-1", version: "1.0.0", manifest }),
          fakeContainerNode({ name: "fynapp-react-lib", version: "19.2.8" }),
          fakeContainerNode({ name: "fynapp-x1", version: "2.0.0" }),
        ],
      })
    );
    expect(found).toEqual([]);
  });
});

describe("a share that came from a container the manifest did not name", () => {
  const scope = (sourceContainer: string, versions: string[]): ShareScopeNode[] => [
    {
      name: "fynmesh",
      keys: [
        {
          key: "esm-react",
          singleton: false,
          loadedCount: versions.length,
          issues: [],
          versions: versions.map((version) => ({
            version,
            url: "https://cdn/" + sourceContainer + "/react-" + version + ".js",
            loaded: true,
            sources: [{ id: "esm-react", container: sourceContainer, version: "1.0.0" }],
            consumers: [],
          })),
        },
      ],
    },
  ];

  const page = (scopes: ShareScopeNode[]): PageOptions => ({
    apps: [
      fakeFynApp({ name: "fynapp-1", version: "1.0.0" }),
      fakeFynApp({ name: "fynapp-react-lib", version: "19.2.8" }),
    ],
    states: [
      { name: "fynapp-1", version: "1.0.0", status: "mounted" },
      { name: "fynapp-react-lib", version: "19.2.8", status: "mounted" },
    ],
    containers: [
      fakeContainerNode({
        name: "fynapp-1",
        version: "1.0.0",
        manifest: {
          name: "fynapp-1",
          "shared-providers": {
            "fynapp-react-lib": { semver: "^19.0.0", provides: ["esm-react"] },
          },
        },
      }),
      fakeContainerNode({ name: "fynapp-react-lib", version: "19.2.8" }),
    ],
    scopes,
  });

  it("reports the copy the app is really running, and defers to the Shares tab", () => {
    const issue = one(issuesOf(page(scope("some-other-app", ["19.2.8"]))), "fynmesh-provider-mismatch");
    expect(issue.severity).toBe("warn");
    expect(issue.title).toContain("expects esm-react from fynapp-react-lib");
    expect(issue.title).toContain("some-other-app");
    expect(issue.view).toBe("shares");
    expect(issue.refs).toContain("fynmesh:esm-react");
    expect(issue.detail).toContain("not a missing dependency");
  });

  it("does not fire when the declared provider announced the loaded copy", () => {
    expect(codes(issuesOf(page(scope("fynapp-react-lib", ["19.2.8"]))))).not.toContain(
      "fynmesh-provider-mismatch"
    );
  });

  /*
   * With two copies loaded there is no single answer to "where did it come
   * from", and guessing one is how the Issues view came to contradict the
   * Shares view in FYM-341.
   */
  it("stays quiet when the key has more than one loaded copy", () => {
    expect(
      codes(issuesOf(page(scope("some-other-app", ["18.3.1", "19.2.8"]))))
    ).not.toContain("fynmesh-provider-mismatch");
  });
});

/* -------------------------------------------------------- absent vs empty */

describe("checks that could not run", () => {
  it("says which ones, rather than passing quietly", () => {
    const issue = one(
      issuesOf({ kernel: devKernel({ noLifecycle: true }) }),
      "fynmesh-checks-unavailable"
    );
    expect(issue.severity).toBe("info");
    expect(issue.detail).toContain("they had nothing to read");
    expect(issue.detail).toContain("listFynAppStates");
    // the manifest join is unavailable too on this page: no container carries one
    expect(issue.detail).toContain("__FYNAPP_MANIFEST__");
    expect(issue.title).toContain("2 FynMesh checks");
  });

  it("names the middleware registry when that is the surface missing", () => {
    const kernel = devKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })] });
    (kernel as any).runTime = { apps: (kernel as any).runTime.apps };
    const issue = one(issuesOf({ kernel }), "fynmesh-checks-unavailable");
    expect(issue.detail).toContain("kernel.runTime.middlewares");
  });

  it("is absent when every surface was readable", () => {
    expect(codes(issuesOf(healthyPage()))).not.toContain("fynmesh-checks-unavailable");
  });
});

/* ------------------------------------------------------------- housekeeping */

describe("re-analysis", () => {
  /*
   * The live poll re-analyses; ids are handed out from a module-level counter
   * that `findIssues` resets. A FynMesh issue that leaked into a second pass
   * would double every row on the second tick.
   */
  it("produces the same issues, with the same ids, every pass", () => {
    const opts: PageOptions = {
      apps: [fakeFynApp({ name: "fynapp-2", version: "1.0.0" })],
      states: [{ name: "fynapp-2", version: "1.0.0", status: "failed", error: new Error("boom") }],
    };
    const first = issuesOf(opts);
    const second = issuesOf(opts);
    expect(codes(second)).toEqual(codes(first));
    expect(second.map((i) => i.id)).toEqual(first.map((i) => i.id));
  });
});
