import { describe, it, expect, vi } from "vitest";
import { createTestKernel } from "./fixtures/test-kernel";
import { createMockOverrideMiddleware } from "./fixtures/mock-middleware";

/**
 * Regression coverage for the kernel resume loop (kernel-core.ts handleMiddlewareReady).
 *
 * A FynUnit that defers at middleware setup is queued with resumeMode "full" and
 * resumed once the provider middleware signals ready. The resume loop forwards
 * `runTime.autoApplyMiddlewares` to MiddlewareExecutor.callMiddlewares, so a
 * deferred-then-resumed FynUnit honors a registered execution override (e.g. the
 * shell middleware's overrideExecute) exactly like a FynUnit that loads without
 * deferring.
 *
 * Before this was wired up the resume path passed `undefined` for
 * autoApplyMiddlewares, so findExecutionOverride() short-circuited to null and a
 * resumed FynUnit always ran its own execute() instead of the override — diverging
 * from the non-deferred load path. These tests pin both sides of that behavior.
 */
describe("Resume path execution overrides", () => {
  // A consumer middleware that defers on the first call (no shareKey) and becomes
  // ready once share.shareKey is present, mirroring a provider that isn't ready yet.
  function buildDeferringContext(kernel: any, fynUnit: any) {
    const fynApp: any = { name: "fynapp-consumer", version: "1.0.0", exposes: {} };
    const runtime: any = { fynApp, middlewareContext: new Map(), share: undefined };

    const setup = vi.fn(async (cc: any) => {
      if (!cc.runtime.share?.shareKey) return { status: "defer" };
      return { status: "ready" };
    });
    const apply = vi.fn(async () => undefined);

    const reg: any = {
      regKey: "fynapp-provider::basic-counter",
      fullKey: "fynapp-provider@1.0.0::basic-counter",
      hostFynApp: { name: "fynapp-provider", version: "1.0.0", middlewareContext: new Map() },
      middleware: { name: "basic-counter", setup, apply },
    };

    const cc: any = {
      meta: { info: { name: "basic-counter", provider: "fynapp-provider", version: "*" }, config: {} },
      fynUnit,
      fynApp,
      reg,
      kernel,
      runtime,
      status: "",
    };
    return { fynApp, runtime, reg, cc, setup, apply };
  }

  // Mirrors the "middleware ready" event detail consumed by handleMiddlewareReady.
  const makeReadyEvent = (cc: any) =>
    ({ detail: { name: cc.fynApp.name, status: "ready", cc, share: { shareKey: "abc" } } } as any);

  it("applies a registered execution override when a deferred FynUnit resumes in 'full' mode", async () => {
    const kernel = createTestKernel();

    const execute = vi.fn(async () => undefined);
    const fynUnit: any = { execute }; // no initialize -> resume stays "full" (not degraded)

    const { cc, setup } = buildDeferringContext(kernel, fynUnit);

    // Register an auto-apply execution override (the "shell" middleware) in the runtime,
    // the way the kernel populates it during middleware registration.
    const overrideMw = createMockOverrideMiddleware();
    (kernel as any).runTime.autoApplyMiddlewares = {
      fynapp: [{ middleware: overrideMw, hostFynApp: { name: "fynapp-shell-mw", version: "1.0.0" } }],
      middleware: [],
    };

    // First pass: setup defers (no shareKey) -> queues a "full" resume; nothing executes yet.
    const first = await kernel.middlewareExecutor.callMiddlewares([cc]);
    expect(first).toBe("defer");
    expect(setup).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(overrideMw.overrideExecute).not.toHaveBeenCalled();
    expect(kernel.testDeferInvoke).toHaveLength(1);
    expect((kernel.testDeferInvoke[0] as any).resumeMode).toBe("full");

    // Provider becomes ready -> kernel resume loop runs with runTime.autoApplyMiddlewares.
    await (kernel as any).handleMiddlewareReady(makeReadyEvent(cc));

    // The override takes over execution; the unit's own execute is skipped.
    expect(setup).toHaveBeenCalledTimes(2);
    expect(overrideMw.overrideExecute).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
    expect(kernel.testDeferInvoke).toHaveLength(0);
  });

  it("runs the FynUnit's own execute on resume when no execution override is registered", async () => {
    const kernel = createTestKernel();

    const execute = vi.fn(async () => undefined);
    const fynUnit: any = { execute };

    const { cc } = buildDeferringContext(kernel, fynUnit);

    // No auto-apply override registered: runTime.autoApplyMiddlewares stays undefined.

    const first = await kernel.middlewareExecutor.callMiddlewares([cc]);
    expect(first).toBe("defer");
    expect(execute).not.toHaveBeenCalled();

    await (kernel as any).handleMiddlewareReady(makeReadyEvent(cc));

    // With no override, the resumed unit runs its own execute exactly once.
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
