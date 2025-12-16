import { describe, it, expect, vi } from "vitest";
import { MiddlewareExecutor } from "../src/modules/middleware-executor.js";
import { ModuleLoader } from "../src/modules/module-loader.js";

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
      middleware: { name: "basic-counter", setup, apply },
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

    const second = await executor.callMiddlewares(resumes[0].callContexts, undefined, undefined, undefined, {
      skipFynUnit: true,
    });
    expect(second).toBe("ready");
    expect(setup).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("ModuleLoader override execution context", () => {
  it("provides kernel reference to override middleware context", async () => {
    const moduleLoader = new ModuleLoader();

    const fynApp: any = {
      name: "test-app",
      version: "1.0.0",
      exposes: {},
    };

    const execute = vi.fn();
    const initialize = vi.fn();
    const fynUnit: any = { initialize, execute };

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

    const autoApplyMiddlewares = {
      fynapp: [
        {
          middleware: overrideMiddleware,
          hostFynApp: { name: "shell-middleware-provider", version: "1.0.0" },
        },
      ],
      middleware: [],
    };

    // Mock kernel object
    const mockKernel: any = {
      version: "1.0.0",
      events: { on: vi.fn(), dispatchEvent: vi.fn() },
    };

    await moduleLoader.invokeFynUnit(fynUnit, fynApp, autoApplyMiddlewares, mockKernel);

    expect(overrideExecute).toHaveBeenCalledTimes(1);
    expect(capturedContext).not.toBeNull();
    expect(capturedContext.kernel).toBe(mockKernel);
    expect(capturedContext.kernel.version).toBe("1.0.0");
    // FynUnit's execute should NOT have been called since middleware overrode it
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes kernel to non-override execution path", async () => {
    const moduleLoader = new ModuleLoader();

    const fynApp: any = {
      name: "test-app",
      version: "1.0.0",
      exposes: {},
    };

    const execute = vi.fn();
    const initialize = vi.fn();
    const fynUnit: any = { initialize, execute };

    // No override middleware
    const autoApplyMiddlewares = {
      fynapp: [],
      middleware: [],
    };

    const mockKernel: any = {
      version: "1.0.0",
    };

    await moduleLoader.invokeFynUnit(fynUnit, fynApp, autoApplyMiddlewares, mockKernel);

    // Normal execution should proceed
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
