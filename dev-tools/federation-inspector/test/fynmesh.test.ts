import { describe, expect, it } from "vitest";
import { collect, fingerprint } from "../src/core/collect.js";
import { collectFynMesh, probeKernel } from "../src/core/collectors/fynmesh.js";
import { emptyCapability } from "../src/core/model.js";
import type { Capability, ContainerNode, FynAppNode } from "../src/core/model.js";
import { filterFynApps } from "../src/ui/views/fynapps.js";
import { twoContainerPage } from "./fixture.js";
import { devKernel, fakeFynApp, fakeUnit, minifiedKernel } from "./kernel-fixture.js";

function run(kernel: unknown, containers: ContainerNode[] = []) {
  const cap: Capability = emptyCapability();
  const result = collectFynMesh(kernel, containers, cap);
  return { cap, ...result };
}

function appNamed(apps: FynAppNode[], key: string): FynAppNode {
  const found = apps.find((a) => a.key === key);
  if (!found) {
    throw new Error(`no FynApp ${key} in [${apps.map((a) => a.key).join(", ")}]`);
  }
  return found;
}

describe("no kernel", () => {
  it("produces no fynmesh node at all, rather than an empty one", () => {
    const { fynmesh, cap } = run(undefined);
    expect(fynmesh).toBeUndefined();
    expect(cap.kernel).toBe(false);
  });

  /*
   * The distinction the whole tab hangs on. "Zero FynApps" and "no FynMesh on
   * this page" are different claims and only the second one is true here, so
   * the snapshot must carry no list at all -- an empty array would let the UI
   * render a table that makes the false claim.
   */
  it("leaves snapshot.fynmesh absent on a plain federation page", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({ loader, federation });
    expect(snap.fynmesh).toBeUndefined();
    expect(snap.capability.kernel).toBe(false);
    expect(snap.containers.length).toBeGreaterThan(0);
  });

  it("ignores a global of the right name with the wrong shape", () => {
    expect(probeKernel({ version: "1.0.0" }).kernel).toBeUndefined();
    expect(run({ version: "1.0.0" }).fynmesh).toBeUndefined();
  });
});

describe("build detection", () => {
  it("tests shape, never presence -- `in` is a false positive on a min build", () => {
    const min = minifiedKernel();
    // the trap, asserted rather than described: the husk is an own property
    expect("bootstrapCoordinator" in min).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(min, "bootstrapCoordinator")).toBe(true);
    expect(min.bootstrapCoordinator).toBeUndefined();

    expect(probeKernel(min).build).toBe("minified");
    expect(probeKernel(devKernel()).build).toBe("dev");
  });

  it("says unknown rather than guessing when neither witness is there", () => {
    expect(probeKernel({ runTime: { apps: {}, middlewares: {} } }).build).toBe("unknown");
  });

  it("reads the same apps out of a minified kernel as out of a dev one", () => {
    const opts = {
      apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0", exposes: { "./main": fakeUnit(["execute"]) } })],
      states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted", mountedAt: 1_200 }],
    };
    const dev = run(devKernel(opts)).fynmesh!;
    const min = run(minifiedKernel(opts)).fynmesh!;
    expect(min.apps).toEqual(dev.apps);
    expect(min.build).toBe("minified");
  });
});

describe("the apps list", () => {
  it("lists one row per name@version, deduping the registry's double key", () => {
    const { fynmesh, cap } = run(
      devKernel({
        apps: [
          fakeFynApp({ name: "fynapp-1", version: "1.0.0" }),
          fakeFynApp({ name: "fynapp-2", version: "2.1.0" }),
        ],
        states: [
          { name: "fynapp-1", version: "1.0.0", status: "mounted", mountedAt: 1_100 },
          { name: "fynapp-2", version: "2.1.0", status: "bootstrapping" },
        ],
      })
    );
    expect(fynmesh!.apps.map((a) => a.key)).toEqual(["fynapp-1@1.0.0", "fynapp-2@2.1.0"]);
    expect(cap.kernelRunTime).toBe(true);
    expect(cap.kernelLifecycle).toBe(true);
    expect(appNamed(fynmesh!.apps, "fynapp-1@1.0.0").status).toBe("mounted");
    expect(appNamed(fynmesh!.apps, "fynapp-2@2.1.0").status).toBe("bootstrapping");
  });

  it("keeps two versions of one name apart and flags the ambiguous bare key", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [
          fakeFynApp({ name: "fynapp-react-lib", version: "18.3.0" }),
          fakeFynApp({ name: "fynapp-react-lib", version: "19.2.8" }),
        ],
      })
    );
    expect(fynmesh!.apps.map((a) => a.key)).toEqual([
      "fynapp-react-lib@18.3.0",
      "fynapp-react-lib@19.2.8",
    ]);
    // the bare key was written last by 19.2.8, and every by-name lookup gets it
    expect(appNamed(fynmesh!.apps, "fynapp-react-lib@19.2.8").isDefaultForName).toBe(true);
    expect(appNamed(fynmesh!.apps, "fynapp-react-lib@18.3.0").isDefaultForName).toBe(false);
  });

  it("keeps a failed app's error, message and stack both", () => {
    const error = new TypeError("x is not a function");
    const { fynmesh } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-8-svelte", version: "1.0.0" })],
        states: [
          { name: "fynapp-8-svelte", version: "1.0.0", status: "failed", error, updatedAt: 4_100 },
        ],
      })
    );
    const app = appNamed(fynmesh!.apps, "fynapp-8-svelte@1.0.0");
    expect(app.status).toBe("failed");
    expect(app.error?.message).toBe("x is not a function");
    expect(app.error?.stack).toContain("TypeError");
    expect(app.updatedAt).toBe(4_100);
  });

  it("lists an app known only from the lifecycle table, and says so", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })],
        states: [
          { name: "fynapp-1", version: "1.0.0", status: "mounted" },
          { name: "fynapp-gone", version: "3.0.0", status: "shutdown" },
        ],
      })
    );
    const gone = appNamed(fynmesh!.apps, "fynapp-gone@3.0.0");
    expect(gone.inRegistry).toBe(false);
    expect(gone.status).toBe("shutdown");
    expect(appNamed(fynmesh!.apps, "fynapp-1@1.0.0").inRegistry).toBe(true);
  });

  it("still lists apps when the lifecycle surface is missing, with no status", () => {
    const { fynmesh, cap } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })],
        noLifecycle: true,
      })
    );
    expect(fynmesh!.apps).toHaveLength(1);
    expect(fynmesh!.apps[0].status).toBeUndefined();
    expect(cap.kernelLifecycle).toBe(false);
    expect(cap.notes.join(" ")).toContain("listFynAppStates");
  });
});

describe("exposes", () => {
  it("separates what the kernel imported from what the build declared", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [
          fakeFynApp({
            name: "fynapp-1",
            version: "1.0.0",
            exposes: { "./main": fakeUnit(["initialize", "execute", "shutdown"]) },
            declared: ["./main", "./config", "./widget"],
          }),
        ],
      })
    );
    const app = appNamed(fynmesh!.apps, "fynapp-1@1.0.0");
    expect(app.importedExposes).toEqual(["./main"]);
    expect(app.declaredExposes).toEqual(["./main", "./config", "./widget"]);
    expect(app.unitHooks).toEqual(["initialize", "execute", "shutdown"]);
  });

  it("reports no hooks rather than inventing them when ./main was never imported", () => {
    const { fynmesh } = run(
      devKernel({
        apps: [fakeFynApp({ name: "fynapp-lib", version: "1.0.0", declared: ["./main"] })],
      })
    );
    const app = appNamed(fynmesh!.apps, "fynapp-lib@1.0.0");
    expect(app.importedExposes).toEqual([]);
    expect(app.unitHooks).toEqual([]);
  });
});

describe("middleware", () => {
  const withMiddleware = () =>
    devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-design-tokens",
          version: "1.0.0",
          exposes: { "./middleware/design-tokens": {} },
        }),
        fakeFynApp({
          name: "fynapp-1",
          version: "1.0.0",
          exposes: {
            "./main": fakeUnit(["execute"], [
              {
                info: { name: "design-tokens", provider: "fynapp-design-tokens", version: "^1.0.0" },
                config: { theme: "dark" },
              },
              { info: { name: "ghost-mw", provider: "nobody" }, config: {} },
            ]),
          },
          delivered: ["design-tokens"],
        }),
      ],
      middlewares: [
        {
          provider: "fynapp-design-tokens",
          name: "design-tokens",
          hostVersion: "1.0.0",
          autoApplyScope: ["fynapp"],
        },
      ],
    });

  it("marks a declaration registered and delivered, and one that is neither", () => {
    const { fynmesh } = run(withMiddleware());
    const app = appNamed(fynmesh!.apps, "fynapp-1@1.0.0");

    const tokens = app.usesMiddleware.find((u) => u.name === "design-tokens")!;
    expect(tokens.provider).toBe("fynapp-design-tokens");
    expect(tokens.range).toBe("^1.0.0");
    expect(tokens.registered).toBe(true);
    expect(tokens.delivered).toBe(true);
    expect(tokens.resolvedFullKey).toBe("fynapp-design-tokens@1.0.0::design-tokens");
    expect(tokens.config).toEqual({ theme: "dark" });
    expect(tokens.configKind).toBe("json");

    const ghost = app.usesMiddleware.find((u) => u.name === "ghost-mw")!;
    expect(ghost.registered).toBe(false);
    expect(ghost.delivered).toBe(false);
    expect(app.middlewareDelivered).toEqual(["design-tokens"]);
  });

  /*
   * Declared and registered but nothing in `middlewareContext`: the kernel
   * retains no record of middleware application, so this is the only visible
   * trace of a middleware that ran and handed the app nothing.
   */
  it("reports registered-but-not-delivered separately from unregistered", () => {
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-6-react",
          version: "1.0.0",
          exposes: {
            "./main": fakeUnit(["execute"], [
              { info: { name: "design-tokens", provider: "fynapp-design-tokens" }, config: {} },
            ]),
          },
        }),
      ],
      middlewares: [
        { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
      ],
    });
    const app = appNamed(run(kernel).fynmesh!.apps, "fynapp-6-react@1.0.0");
    expect(app.usesMiddleware[0].registered).toBe(true);
    expect(app.usesMiddleware[0].delivered).toBe(false);
    expect(app.middlewareDelivered).toEqual([]);
  });

  it("normalises all three declaration shapes", () => {
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-mixed",
          version: "1.0.0",
          exposes: {
            "./main": fakeUnit(["execute"], [
              "-FYNAPP_MIDDLEWARE fynapp-shell-mw ./middleware/shell-layout ^1.0.0",
              { mw: "-FYNAPP_MIDDLEWARE fynapp-x ./middleware/deep/thing", config: { a: 1 } },
              { info: { name: "design-tokens", provider: "fynapp-design-tokens" }, config: {} },
              { nonsense: true },
            ]),
          },
        }),
      ],
    });
    const uses = appNamed(run(kernel).fynmesh!.apps, "fynapp-mixed@1.0.0").usesMiddleware;

    expect(uses.map((u) => u.form)).toEqual(["string", "mw", "info", "unknown"]);
    expect(uses[0]).toMatchObject({
      name: "shell-layout",
      provider: "fynapp-shell-mw",
      range: "^1.0.0",
    });
    // the name is the last path segment, the provider is the package
    expect(uses[1]).toMatchObject({ name: "thing", provider: "fynapp-x" });
    expect(uses[1].config).toEqual({ a: 1 });
    expect(uses[1].range).toBeUndefined();
    expect(uses[3].name).toBeUndefined();
  });

  it("keeps an unclonable config out of the snapshot, keeping only its keys", () => {
    const kernel = devKernel({
      apps: [
        fakeFynApp({
          name: "fynapp-cfg",
          version: "1.0.0",
          exposes: {
            "./main": fakeUnit(["execute"], [
              {
                info: { name: "shell-layout", provider: "fynapp-shell-mw" },
                config: { render: () => null, slot: "main" },
              },
            ]),
          },
        }),
      ],
    });
    const use = appNamed(run(kernel).fynmesh!.apps, "fynapp-cfg@1.0.0").usesMiddleware[0];
    expect(use.configKind).toBe("opaque");
    expect(use.config).toBeUndefined();
    expect(use.configKeys).toEqual(["render", "slot"]);
  });

  it("reads the registry from the provider's side too", () => {
    const { fynmesh } = run(withMiddleware());
    const mw = fynmesh!.middlewares.find((m) => m.name === "design-tokens")!;
    expect(mw.regKey).toBe("fynapp-design-tokens::design-tokens");
    expect(mw.versions).toEqual([
      {
        version: "1.0.0",
        isDefault: true,
        fullKey: "fynapp-design-tokens@1.0.0::design-tokens",
        hostApp: "fynapp-design-tokens@1.0.0",
        exposeName: "./middleware/design-tokens",
        exportName: "__middleware__design-tokens",
        autoApplyScope: ["fynapp"],
        hasSetup: true,
        hasApply: true,
        hasShouldApply: false,
        overridesExecution: false,
        overrideHooks: [],
        // the same declaration `usesMiddleware` carries above, pinned to the
        // version the kernel's resolution order puts it on (FYM-329)
        consumers: [
          {
            route: "declared",
            app: "fynapp-1@1.0.0",
            range: "^1.0.0",
            pinnedProvider: true,
            delivered: true,
            via: "range",
          },
        ],
      },
    ]);
    expect(mw.autoApply).toEqual(["fynapp"]);
    expect(mw.consumers).toEqual(["fynapp-1@1.0.0"]);
    expect(
      appNamed(fynmesh!.apps, "fynapp-design-tokens@1.0.0").providesMiddleware
    ).toEqual(["fynapp-design-tokens::design-tokens"]);
  });
});

describe("the FynApp / container join", () => {
  it("lands on the container version, and says when there is no container", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({
      loader,
      federation,
      kernel: devKernel({
        apps: [
          fakeFynApp({ name: "fynapp-1", version: "1.0.0" }),
          // a FynApp the loader's registry has no container for at all
          fakeFynApp({ name: "fynapp-elsewhere", version: "9.9.9" }),
        ],
        states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted", mountedAt: 900 }],
      }),
    });

    const one = appNamed(snap.fynmesh!.apps, "fynapp-1@1.0.0");
    expect(one.containerId).toBe("__mf_container_fynapp-1");
    expect(one.containerVersion).toBe("1.0.0");

    const stray = appNamed(snap.fynmesh!.apps, "fynapp-elsewhere@9.9.9");
    expect(stray.containerId).toBeUndefined();
    expect(stray.containerVersion).toBeUndefined();
  });

  /*
   * A container absent from `runTime.apps` is not a FynApp -- that is the fact
   * that separates real FynApps from plain federated libraries, and it has to
   * survive as an asymmetry rather than being smoothed over.
   */
  it("does not turn every container into a FynApp", () => {
    const { loader, federation } = twoContainerPage();
    const snap = collect({
      loader,
      federation,
      kernel: devKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })] }),
    });
    expect(snap.containers.length).toBeGreaterThan(1);
    expect(snap.fynmesh!.apps.map((a) => a.name)).toEqual(["fynapp-1"]);
  });

  it("leaves containerVersion unset when that version was never collected", () => {
    const containers: ContainerNode[] = [
      {
        name: "fynapp-1",
        id: "__mf_container_fynapp-1",
        versions: [
          {
            version: "1.0.0",
            entryId: "__mf_container_fynapp-1",
            stage: "executed",
            scope: "fynmesh",
            exposes: [],
            provides: [],
            consumes: [],
            moduleIds: [],
          },
        ],
      },
    ];
    const { fynmesh } = run(
      devKernel({ apps: [fakeFynApp({ name: "fynapp-1", version: "2.0.0" })] }),
      containers
    );
    const app = appNamed(fynmesh!.apps, "fynapp-1@2.0.0");
    expect(app.containerId).toBe("__mf_container_fynapp-1");
    expect(app.containerVersion).toBeUndefined();
  });
});

describe("the snapshot contract", () => {
  /*
   * `adapters/remote.ts` is why this matters: the snapshot crosses a
   * postMessage bridge, so a single live kernel object, Map or function
   * anywhere in it takes the whole panel down in a devtools realm.
   */
  it("survives a real structuredClone", () => {
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
                {
                  info: { name: "design-tokens", provider: "fynapp-design-tokens" },
                  config: { theme: "dark", render: () => null },
                },
              ]),
            },
            delivered: ["design-tokens"],
            config: { anything: () => null },
          }),
        ],
        states: [{ name: "fynapp-1", version: "1.0.0", status: "mounted", mountedAt: 900 }],
        middlewares: [
          { provider: "fynapp-design-tokens", name: "design-tokens", hostVersion: "1.0.0" },
        ],
      }),
    });

    const clone = structuredClone(snap);
    expect(clone.fynmesh).toEqual(snap.fynmesh);
    // the app's own config is recorded as a fact, never as a value
    expect(appNamed(snap.fynmesh!.apps, "fynapp-1@1.0.0").hasConfig).toBe(true);
    expect(JSON.stringify(snap.fynmesh)).toContain("fynapp-1");
  });

  it("notices a mount that changed no module and no registration", () => {
    const { loader, federation } = twoContainerPage();
    const kernel = devKernel({
      apps: [fakeFynApp({ name: "fynapp-1", version: "1.0.0" })],
      states: [{ name: "fynapp-1", version: "1.0.0", status: "bootstrapping", updatedAt: 10 }],
    });
    const before = fingerprint({ loader, federation, kernel });
    // the kernel holds its own rows; mutate the ones it hands out, the way a
    // real bootstrap completing would
    const rows = (kernel.listFynAppStates as () => Array<Record<string, unknown>>)();
    rows[0].status = "mounted";
    rows[0].updatedAt = 50;
    expect(fingerprint({ loader, federation, kernel })).not.toBe(before);
  });
});

describe("filterFynApps", () => {
  const apps = [
    { name: "fynapp-1", version: "1.0.0", status: "mounted" },
    { name: "fynapp-2", version: "2.0.0", status: "failed" },
    { name: "other", version: "1.0.0" },
  ] as FynAppNode[];

  it("matches names, versions and statuses, and negates", () => {
    expect(filterFynApps(apps, "").length).toBe(3);
    expect(filterFynApps(apps, "fynapp").map((a) => a.name)).toEqual(["fynapp-1", "fynapp-2"]);
    expect(filterFynApps(apps, "status:failed").map((a) => a.name)).toEqual(["fynapp-2"]);
    expect(filterFynApps(apps, "-status:failed").map((a) => a.name)).toEqual([
      "fynapp-1",
      "other",
    ]);
    expect(filterFynApps(apps, "status:untracked").map((a) => a.name)).toEqual(["other"]);
  });

  /* a query carried in from another tab narrows by what applies and no more */
  it("ignores fields this tab cannot answer", () => {
    expect(filterFynApps(apps, "stage:errored container:fynapp-1").map((a) => a.name)).toEqual([
      "fynapp-1",
    ]);
  });
});
