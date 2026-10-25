import { describe, it, expect, vi } from "vitest";
import { MiddlewareExecutor } from "../src/modules/middleware-executor.js";
import { createTestKernel } from "./fixtures/test-kernel";

describe("MiddlewareExecutor degraded execution", () => {
  it("executes unit when middleware setup defers and deferOk=true, and does not re-execute on resume", async () => {
    const executor = new MiddlewareExecutor();

    const fynApp: any = { name: "fynapp-6-react", version: "1.0.0", exposes: {} };

    const execute = vi.fn(async () => undefined);
    const initialize = vi.fn(() => ({ status: "ready", deferOk: true }));
    const fynUnit: any = { initialize, execute };

    const runtime: any = { fynApp, middlewareContext: new Map(), share: undefined };

    const setup = vi.fn(async (cc: any) => {
      if (!cc.runtime.share?.shareKey) {
        return { status: "defer" };
      }
      cc.runtime.middlewareContext.set("basic-counter", { shareKey: cc.runtime.share.shareKey });
      return { status: "ready" };
    });

    const apply = vi.fn(async () => undefined);

    const reg: any = {
      regKey: "fynapp-react-middleware::basic-counter",
      fullKey: "fynapp-react-middleware@1.0.0::basic-counter",
      hostFynApp: { name: "fynapp-react-middleware", version: "1.0.0", middlewareContext: new Map() },
      mw: { name: "basic-counter", setup, apply },
    };

    const cc: any = {
      meta: { info: { name: "basic-counter", provider: "fynapp-react-middleware", version: "*" }, config: "consume-only" },
      fynUnit,
      fynApp,
      reg,
      kernel: {},
      runtime,
      status: "",
    };

    const first = await executor.callMiddlewares([cc]);
    expect(first).toBe("ready");
    expect(setup).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(0);

    const { resumes } = executor.processReadyMiddleware(reg.fullKey, { shareKey: "abc" });
    expect(resumes).toHaveLength(1);
    expect(resumes[0].resumeMode).toBe("middleware_only");

    const second = await executor.callMiddlewares(resumes[0].callContexts, {
      skipFynUnit: true,
    });
    expect(second).toBe("ready");
    expect(setup).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

// Override handling lives in the middleware add-on's runUnit hook, ahead of loader.invokeFynUnit
describe("Add-on override execution context", () => {
  it("provides kernel reference to override middleware context", async () => {
    const kernel = createTestKernel();

    const execute = vi.fn();
    const initialize = vi.fn();
    const fynUnit: any = { initialize, execute };

    const fynApp: any = {
      name: "test-app",
      version: "1.0.0",
      entry: { container: { name: "test-app", version: "1.0.0", $E: { "./main": "./main" } } },
      exposes: { "./main": { main: fynUnit } },
      middlewareContext: new Map(),
    };

    // Create a middleware that captures the context to verify kernel is present
    let capturedContext: any = null;
    const overrideExecute = vi.fn(async (ctx: any) => {
      capturedContext = ctx;
    });

    const overrideMiddleware: any = {
      name: "shell-middleware",
      canOverrideExecution: () => true,
      overrideExecute,
    };

    const autoApply = {
      fynapp: [
        {
          mw: overrideMiddleware,
          hostFynApp: { name: "shell-middleware-provider", version: "1.0.0" },
        },
      ],
      mw: [],
    };

    vi.spyOn(kernel.mwMgr, "getAutoApply").mockReturnValue(autoApply as any);
    const invokeSpy = vi.spyOn(kernel.loader, "invokeFynUnit");

    await kernel.bootstrapFynApp(fynApp);

    expect(overrideExecute).toHaveBeenCalledTimes(1);
    expect(capturedContext).not.toBeNull();
    expect(capturedContext.kernel).toBe(kernel);
    expect(capturedContext.kernel.version).toBe(kernel.version);
    // The override is handled before the loader is ever called
    expect(invokeSpy).not.toHaveBeenCalled();
    // FynUnit's execute should NOT have been called since middleware overrode it
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes kernel to non-override execution path", async () => {
    const kernel = createTestKernel();

    const execute = vi.fn();
    const initialize = vi.fn();
    const fynUnit: any = { initialize, execute };

    const fynApp: any = {
      name: "test-app",
      version: "1.0.0",
      entry: { container: { name: "test-app", version: "1.0.0", $E: { "./main": "./main" } } },
      exposes: { "./main": { main: fynUnit } },
      middlewareContext: new Map(),
    };

    // No override middleware
    const autoApply = {
      fynapp: [],
      mw: [],
    };

    vi.spyOn(kernel.mwMgr, "getAutoApply").mockReturnValue(autoApply as any);

    await kernel.bootstrapFynApp(fynApp);

    // Normal execution should proceed
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
