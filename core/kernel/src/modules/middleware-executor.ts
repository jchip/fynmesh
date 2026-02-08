/**
 * Middleware Execution Module
 * Handles middleware execution, defer/retry logic, and ready state management
 */

import type {
  FynApp,
  FynUnit,
  FynUnitRuntime,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynMeshKernel,
  MiddlewareUseMeta,
  KernelTelemetry,
} from "../types";
import { noOpTelemetry } from "../kernel-telemetry";
import { isFynAppMiddlewareProvider, MIDDLEWARE_EXPOSE_PREFIX, getTargetMiddlewares, findExecutionOverride, createMiddlewareCallContext, executeMiddlewareOverride } from "../util";
import { noOpFynUnit } from "../use-middleware";
import {
  MiddlewareError,
  KernelErrorCode,
} from "../errors";

export class MiddlewareExecutor {
  protected telemetry: KernelTelemetry;
  private middlewareReady: Map<string, any> = new Map();
  private deferInvoke: { callContexts: FynAppMiddlewareCallContext[]; resumeMode?: "full" | "middleware_only" }[] = [];

  constructor(telemetry?: KernelTelemetry) {
    this.telemetry = telemetry ?? noOpTelemetry;
  }

  private getDeferKey(ccs: FynAppMiddlewareCallContext[]): string {
    return ccs.map((c) => c.reg.fullKey).sort().join("|");
  }

  private markDeferResumeMode(ccs: FynAppMiddlewareCallContext[], resumeMode: "full" | "middleware_only"): void {
    const key = this.getDeferKey(ccs);
    for (const item of this.deferInvoke) {
      if (this.getDeferKey(item.callContexts) === key) {
        item.resumeMode = resumeMode;
      }
    }
  }

  /**
   * Set middleware as ready
   */
  setMiddlewareReady(fullKey: string, share: any): void {
    this.middlewareReady.set(fullKey, share);
  }

  /**
   * Check if a single middleware is ready
   */
  private checkSingleMiddlewareReady(cc: FynAppMiddlewareCallContext): boolean {
    if (this.middlewareReady.has(cc.reg.fullKey)) {
      cc.runtime.share = this.middlewareReady.get(cc.reg.fullKey);
      cc.status = "ready";
      return true;
    }
    return false;
  }

  /**
   * Check if all middlewares in the list are ready
   */
  private checkMiddlewareReady(ccs: FynAppMiddlewareCallContext[]): string {
    let status = "ready";
    for (const cc of ccs) {
      if (!this.checkSingleMiddlewareReady(cc)) {
        status = "defer";
      }
    }
    return status;
  }

  /**
   * Check and handle deferred calls
   */
  private checkDeferCalls(status: string, ccs: FynAppMiddlewareCallContext[]): string {
    if (status === "defer") {
      if (this.checkMiddlewareReady(ccs) === "ready") {
        return "retry";
      }
      // Dedupe: avoid pushing identical pending groups
      const incomingKeys = this.getDeferKey(ccs);
      const exists = this.deferInvoke.some((d) => {
        return this.getDeferKey(d.callContexts) === incomingKeys;
      });
      if (!exists) {
        this.deferInvoke.push({
          callContexts: ccs,
          resumeMode: "full",
        });
      }
      return "defer";
    }
    return "ready";
  }

  /**
   * Process ready middlewares when one becomes ready
   */
  processReadyMiddleware(
    readyKey: string,
    share: any
  ): { resumes: { callContexts: FynAppMiddlewareCallContext[]; resumeMode?: "full" | "middleware_only" }[] } {
    this.setMiddlewareReady(readyKey, share);

    // Optimized: Use a Map to track ready status instead of O(n²) loops
    const resumeIndices: number[] = [];

    for (let i = 0; i < this.deferInvoke.length; i++) {
      const { callContexts } = this.deferInvoke[i];
      let allReady = true;

      for (const deferCC of callContexts) {
        if (deferCC.reg.fullKey === readyKey) {
          deferCC.runtime.share = share;
          deferCC.status = "ready";
        }
        // Check if all contexts are ready
        if (deferCC.status !== "ready" && deferCC.status !== "skip") {
          allReady = false;
        }
      }

      if (allReady) {
        resumeIndices.push(i);
      }
    }

    // Process resumes and clean up in reverse order to maintain indices
    const resumes: { callContexts: FynAppMiddlewareCallContext[]; resumeMode?: "full" | "middleware_only" }[] = [];
    if (resumeIndices.length > 0) {
      for (let i = resumeIndices.length - 1; i >= 0; i--) {
        const idx = resumeIndices[i];
        resumes.push(this.deferInvoke[idx]);
        this.deferInvoke.splice(idx, 1);
      }
      // Resume in original order
      resumes.reverse();
    }

    return { resumes };
  }

  /**
   * Validate retry count and throw if exceeded
   */
  private validateRetryCount(ccs: FynAppMiddlewareCallContext[], tries: number): void {
    if (tries > 1) {
      const mwError = new MiddlewareError(
        KernelErrorCode.MIDDLEWARE_SETUP_FAILED,
        `Middleware setup failed after 2 tries for ${ccs.map(cc => cc.reg.regKey).join(", ")}`,
        {
          middlewareName: ccs[0]?.reg.middleware.name,
          provider: ccs[0]?.reg.hostFynApp.name,
          fynAppName: ccs[0]?.fynApp.name,
        }
      );
      console.error(`🚨 ${mwError.message}`);
      throw mwError;
    }
  }

  /**
   * Run middleware setup phase and signal readiness
   * @returns {{ middlewareSetupStatus: string; hasDeferredMiddleware: boolean }}
   */
  private async setupMiddlewares(
    ccs: FynAppMiddlewareCallContext[],
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>
  ): Promise<{ middlewareSetupStatus: string; hasDeferredMiddleware: boolean }> {
    this.checkMiddlewareReady(ccs);
    let middlewareSetupStatus = "ready";
    let hasDeferredMiddleware = false;

    for (const cc of ccs) {
      const { fynApp, reg } = cc;
      const mw = reg.middleware;
      this.checkSingleMiddlewareReady(cc);
      if (mw.setup) {
        console.debug("🚀 Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
        const result = await mw.setup(cc);
        this.telemetry.capture({
          type: "event",
          name: "setup.completed",
          data: { middleware: reg.regKey, app: fynApp.name },
        });
        if (result?.status === "ready" && !this.middlewareReady.has(cc.reg.fullKey)) {
          if (signalReady) {
            await signalReady(cc, result?.share);
          }
        }
        if (result?.status === "defer") {
          middlewareSetupStatus = "defer";
          hasDeferredMiddleware = true;
        }
      }
    }

    return { middlewareSetupStatus, hasDeferredMiddleware };
  }

  /**
   * Initialize the FynUnit and handle provider mode registration
   * @returns {{ allowDegraded: boolean; deferResult: string | null }} where deferResult is non-null if the caller should return early
   */
  private async initializeFynUnit(
    ccs: FynAppMiddlewareCallContext[],
    fynUnit: FynUnit,
    fynApp: FynApp,
    runtime: FynUnitRuntime,
    providerModeRegistrar?: (fynAppName: string, middlewareName: string, mode: "provider" | "consumer") => void,
    skipFynUnit?: boolean
  ): Promise<{ allowDegraded: boolean; initDeferStatus: string }> {
    if (skipFynUnit || !fynUnit.initialize) {
      return { allowDegraded: false, initDeferStatus: "ready" };
    }

    console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
    const result: any = await fynUnit.initialize(runtime);
    const allowDegraded = Boolean(result?.deferOk);

    if (result?.mode && providerModeRegistrar) {
      for (const cc of ccs) {
        providerModeRegistrar(fynApp.name, cc.reg.middleware.name, result.mode);
      }
      console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
    }

    const initDeferStatus = this.checkDeferCalls(result?.status, ccs);
    return { allowDegraded, initDeferStatus };
  }

  /**
   * Apply middlewares that are currently ready
   */
  private async applyReadyMiddlewares(ccs: FynAppMiddlewareCallContext[], fynApp: FynApp): Promise<void> {
    for (const cc of ccs) {
      if (cc.status !== "ready") continue;
      const mw = cc.reg.middleware;
      if (!mw.apply) continue;
      console.debug("🚀 Invoking middleware", cc.reg.regKey, "apply for", fynApp.name, fynApp.version);
      await mw.apply(cc);
    }
  }

  /**
   * Execute the FynUnit with possible middleware override
   */
  private async executeWithOverride(
    fynUnit: FynUnit,
    fynApp: FynApp,
    runtime: FynUnitRuntime,
    kernel: FynMeshKernel,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    }
  ): Promise<void> {
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApplyMiddlewares);

    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
    } else if (fynUnit.execute) {
      console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
      await fynUnit.execute(runtime);
    }

    this.telemetry.capture({
      type: "event",
      name: "execute.completed",
      data: { app: fynApp.name, override: !!executionOverride },
    });
  }

  /**
   * Call middlewares with setup and apply - orchestrates the middleware lifecycle
   */
  async callMiddlewares(
    ccs: FynAppMiddlewareCallContext[],
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>,
    providerModeRegistrar?: (fynAppName: string, middlewareName: string, mode: "provider" | "consumer") => void,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    },
    options?: { skipFynUnit?: boolean },
    tries = 0
  ): Promise<string> {
    if (ccs.length === 0) {
      console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
      return "ready";
    }

    this.telemetry.capture({
      type: "event",
      name: "call.started",
      data: { count: ccs.length, app: ccs[0]?.fynApp?.name },
    });

    this.validateRetryCount(ccs, tries);

    // Phase 1: Setup middlewares
    const { middlewareSetupStatus, hasDeferredMiddleware } = await this.setupMiddlewares(ccs, signalReady);

    const fynUnit = ccs[0].fynUnit;
    const fynApp = ccs[0].fynApp;
    const runtime = ccs[0].runtime;

    const postSetupStatus = this.checkDeferCalls(middlewareSetupStatus, ccs);
    if (postSetupStatus === "retry") {
      return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, options, tries + 1);
    }

    // Phase 2: Initialize the FynUnit
    const { allowDegraded, initDeferStatus } = await this.initializeFynUnit(
      ccs, fynUnit, fynApp, runtime, providerModeRegistrar, options?.skipFynUnit
    );

    if (initDeferStatus === "defer" && !allowDegraded) {
      this.telemetry.capture({ type: "event", name: "call.deferred", data: { app: fynApp?.name } });
      return "defer";
    }
    if (initDeferStatus === "retry") {
      return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, autoApplyMiddlewares, options, tries + 1);
    }

    if (hasDeferredMiddleware && postSetupStatus === "defer" && !allowDegraded && !options?.skipFynUnit) {
      this.telemetry.capture({ type: "event", name: "call.deferred", data: { app: fynApp?.name } });
      return "defer";
    }

    // Phase 3: Apply ready middlewares
    await this.applyReadyMiddlewares(ccs, fynApp);

    if (options?.skipFynUnit) {
      return "ready";
    }

    if (allowDegraded && postSetupStatus === "defer") {
      this.markDeferResumeMode(ccs, "middleware_only");
    }

    // Phase 4: Execute with possible override
    await this.executeWithOverride(fynUnit, fynApp, runtime, ccs[0].kernel, autoApplyMiddlewares);

    return "ready";
  }

  /**
   * Parse middleware string format and create call context
   * @private
   */
  private async parseMiddlewareString(
    middlewareStr: string,
    config: unknown,
    fynUnit: FynUnit,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    runtime: FynUnitRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>
  ): Promise<FynAppMiddlewareCallContext | null> {
    const parts = middlewareStr.trim().split(' ');

    if (parts.length < 3 || parts[0] !== '-FYNAPP_MIDDLEWARE') {
      return null;
    }

    const [, packageName, middlewarePath, semver] = parts;
    const middlewareName = middlewarePath.split('/').pop() || middlewarePath;

    console.debug("🔍 Middleware string - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");

    // Try to load middleware from dependency package first
    if (loadMiddlewareFromDependency) {
      await loadMiddlewareFromDependency(packageName, middlewarePath);
    }

    const reg = getMiddleware(middlewareName, packageName);
    if (reg.regKey === "") {
      console.debug("❌ No middleware found for", middlewareName, packageName);
      return null;
    }

    return {
      meta: {
        info: {
          name: middlewareName,
          provider: packageName,
          version: semver || "*"
        },
        config: config || {}
      },
      fynUnit,
      fynMod: fynUnit, // deprecated compatibility
      fynApp,
      reg,
      kernel,
      runtime,
      status: "",
    };
  }

  /**
   * Use middleware on FynUnit
   */
  async useMiddlewareOnFynUnit(
    fynUnit: FynUnit,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    createRuntime: () => FynUnitRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    }
  ): Promise<string> {
    if (!fynUnit.__middlewareMeta) {
      return "";
    }

    const runtime = createRuntime();

    console.debug("🔍 Processing middleware metadata:", fynUnit.__middlewareMeta);

    const ccs: FynAppMiddlewareCallContext[] = [];

    for (const meta of fynUnit.__middlewareMeta) {
      console.debug("🔍 Processing meta item:", meta);

      let cc: FynAppMiddlewareCallContext | null = null;

      // Handle new string format: "-FYNAPP_MIDDLEWARE package-name middleware-path [semver]"
      if (typeof meta === 'string') {
        cc = await this.parseMiddlewareString(
          meta,
          {},
          fynUnit,
          fynApp,
          kernel,
          runtime,
          getMiddleware,
          loadMiddlewareFromDependency
        );
      } else if (meta && typeof meta === 'object') {
        console.debug("🔍 Object format meta:", meta);

        // Check for new format with middleware property containing the string
        if ((meta as any).middleware && typeof (meta as any).middleware === 'string') {
          cc = await this.parseMiddlewareString(
            (meta as any).middleware,
            (meta as any).config || {},
            fynUnit,
            fynApp,
            kernel,
            runtime,
            getMiddleware,
            loadMiddlewareFromDependency
          );
        } else if ((meta as any).info) {
          // Handle legacy object format with info property
          const info = (meta as any).info;
          console.debug("🔍 Legacy format - name:", info.name, "provider:", info.provider);

          const reg = getMiddleware(info.name, info.provider);
          if (reg.regKey === "") {
            console.debug("❌ No middleware found for", info.name, info.provider);
            continue;
          }
          cc = {
            meta: meta as MiddlewareUseMeta<unknown>,
            fynUnit,
            fynMod: fynUnit, // deprecated compatibility
            fynApp,
            reg,
            kernel,
            runtime,
            status: "",
          };
        } else {
          console.debug("❌ Object format missing both middleware and info properties:", meta);
        }
      }

      if (cc) {
        ccs.push(cc);
      } else {
        console.debug("❌ Unrecognized middleware meta format:", meta);
      }
    }

    console.debug("✅ Created", ccs.length, "middleware call contexts");

    return this.callMiddlewares(ccs, undefined, undefined, autoApplyMiddlewares);
  }

  /**
   * @deprecated Use useMiddlewareOnFynUnit instead
   */
  async useMiddlewareOnFynModule(
    fynMod: FynUnit,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    createRuntime: () => FynUnitRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>,
    autoApplyMiddlewares?: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    }
  ): Promise<string> {
    return this.useMiddlewareOnFynUnit(fynMod, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApplyMiddlewares);
  }

  /**
   * Apply auto-scope middlewares
   * @returns Array of errors that occurred during middleware application (empty if all succeeded)
   */
  async applyAutoScopeMiddlewares(
    fynApp: FynApp,
    fynUnit: FynUnit | undefined,
    kernel: FynMeshKernel,
    autoApplyMiddlewares: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    } | undefined,
    createRuntime: () => FynUnitRuntime,
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>
  ): Promise<MiddlewareError[]> {
    const errors: MiddlewareError[] = [];

    console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApplyMiddlewares exists?`, !!autoApplyMiddlewares);
    if (!autoApplyMiddlewares) {
      console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
      return errors;
    }

    // Apply middleware based on FynApp type
    const targetMiddlewares = getTargetMiddlewares(fynApp, autoApplyMiddlewares);

    for (const mwReg of targetMiddlewares) {
      // Check if middleware has a filter function and call it
      if (mwReg.middleware.shouldApply) {
        try {
          const shouldApply = mwReg.middleware.shouldApply(fynApp);
          if (!shouldApply) {
            console.debug(`⏭️ Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
            continue;
          }
        } catch (error) {
          const mwError = new MiddlewareError(
            KernelErrorCode.MIDDLEWARE_FILTER_ERROR,
            `Error in shouldApply for ${mwReg.regKey}: ${error instanceof Error ? error.message : String(error)}`,
            {
              middlewareName: mwReg.middleware.name,
              provider: mwReg.hostFynApp.name,
              fynAppName: fynApp.name,
              cause: error instanceof Error ? error : undefined,
            }
          );
          console.error(`❌ ${mwError.message}`);
          errors.push(mwError);
          continue;
        }
      }

      console.debug(
        `🔄 Auto-applying ${mwReg.middleware.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
      );

      const unit = fynUnit || noOpFynUnit;
      const context = createMiddlewareCallContext(mwReg, unit, fynApp, createRuntime(), kernel, {}, "ready");

      try {
        if (mwReg.middleware.setup) {
          const result = await mwReg.middleware.setup(context);
          if (result?.status === "ready" && signalReady) {
            await signalReady(context, result.share);
          }
        }
        if (mwReg.middleware.apply) {
          await mwReg.middleware.apply(context);
        }
      } catch (error) {
        const mwError = new MiddlewareError(
          KernelErrorCode.MIDDLEWARE_APPLY_FAILED,
          `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}: ${error instanceof Error ? error.message : String(error)}`,
          {
            middlewareName: mwReg.middleware.name,
            provider: mwReg.hostFynApp.name,
            fynAppName: fynApp.name,
            cause: error instanceof Error ? error : undefined,
          }
        );
        this.telemetry.capture({
          type: "error",
          name: "auto_apply.failed",
          data: { middleware: mwReg.regKey, app: fynApp.name },
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
        console.error(`❌ ${mwError.message}`);
        errors.push(mwError);
      }
    }

    return errors;
  }

  /**
   * Clear executor state
   */
  clear(): void {
    this.middlewareReady.clear();
    this.deferInvoke = [];
  }

  /**
   * Get deferred invokes
   */
  getDeferredInvokes(): { callContexts: FynAppMiddlewareCallContext[]; resumeMode?: "full" | "middleware_only" }[] {
    return [...this.deferInvoke];
  }

  /**
   * Get ready middleware
   */
  getReadyMiddleware(): Map<string, any> {
    return new Map(this.middlewareReady);
  }
}
