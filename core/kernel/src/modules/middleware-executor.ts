/**
 * Middleware Execution Module
 * Handles middleware execution, defer/retry logic, and ready state management
 */

import type {
  FynApp,
  FynModule,
  FynModuleRuntime,
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynMeshKernel,
  MiddlewareUseMeta,
} from "../types";
import { isFynAppMiddlewareProvider } from "../util";

export class MiddlewareExecutor {
  private middlewareReady: Map<string, any> = new Map();
  private deferInvoke: { callContexts: FynAppMiddlewareCallContext[] }[] = [];

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
      const incomingKeys = ccs.map((c) => c.reg.fullKey).sort().join("|");
      const exists = this.deferInvoke.some((d) => {
        const keys = d.callContexts.map((c) => c.reg.fullKey).sort().join("|");
        return keys === incomingKeys;
      });
      if (!exists) {
        this.deferInvoke.push({
          callContexts: ccs,
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
  ): { resumes: { callContexts: FynAppMiddlewareCallContext[] }[] } {
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
    const resumes: { callContexts: FynAppMiddlewareCallContext[] }[] = [];
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
   * Call middlewares with setup and apply
   */
  async callMiddlewares(
    ccs: FynAppMiddlewareCallContext[],
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>,
    providerModeRegistrar?: (fynAppName: string, middlewareName: string, mode: "provider" | "consumer") => void,
    tries = 0
  ): Promise<string> {
    // Handle empty middleware array - nothing to call
    if (ccs.length === 0) {
      console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
      return "ready";
    }

    if (tries > 1) {
      console.error("🚨 Middleware setup failed after 2 tries", ccs);
      throw new Error("Middleware setup failed after 2 tries");
    }

    this.checkMiddlewareReady(ccs);
    let status = "ready";

    for (const cc of ccs) {
      const { fynApp, reg } = cc;
      const mw = reg.middleware;
      this.checkSingleMiddlewareReady(cc);
      if (mw.setup) {
        console.debug(
          "🚀 Invoking middleware",
          reg.regKey,
          "setup for",
          fynApp.name,
          fynApp.version,
        );
        const result = await mw.setup(cc);
        // Auto-signal if middleware reports ready and didn't already signal via event
        if (result?.status === "ready" && !this.middlewareReady.has(cc.reg.fullKey)) {
          if (signalReady) {
            await signalReady(cc, result?.share);
          }
        }
        if (result?.status === "defer") {
          status = "defer";
        }
      }
    }

    status = this.checkDeferCalls(status, ccs);
    if (status === "defer") {
      return status;
    }
    if (status === "retry") {
      return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, tries + 1);
    }

    const fynMod = ccs[0].fynMod;
    const fynApp = ccs[0].fynApp;
    const runtime = ccs[0].runtime;

    if (fynMod.initialize) {
      console.debug("🚀 Invoking user.initialize for", fynApp.name, fynApp.version);
      const result: any = await fynMod.initialize(runtime);

      // Capture provider/consumer mode for dependency tracking
      if (result?.mode && providerModeRegistrar) {
        // Store mode for each middleware this FynApp uses
        for (const cc of ccs) {
          providerModeRegistrar(fynApp.name, cc.reg.middleware.name, result.mode);
        }
        console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
      }

      status = this.checkDeferCalls(result?.status, ccs);
      if (status === "defer") {
        // User initialize requested defer and middleware not all ready: respect defer
        return "defer";
      }

      if (status === "retry") {
        if (result?.status === "defer") {
          return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, tries + 1);
        }
        return await this.callMiddlewares(ccs, signalReady, providerModeRegistrar, tries + 1);
      }
    }

    for (const cc of ccs) {
      const { reg } = cc;
      const mw = reg.middleware;
      if (mw.apply) {
        console.debug(
          "🚀 Invoking middleware",
          reg.regKey,
          "apply for",
          fynApp.name,
          fynApp.version,
        );
        await mw.apply(cc);
      }
    }

    if (fynMod.execute) {
      console.debug("🚀 Invoking user.execute for", fynApp.name, fynApp.version);
      await fynMod.execute(runtime);
    }

    return "ready";
  }

  /**
   * Parse middleware string format and create call context
   * @private
   */
  private async parseMiddlewareString(
    middlewareStr: string,
    config: unknown,
    fynMod: FynModule,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    runtime: FynModuleRuntime,
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
      fynMod,
      fynApp,
      reg,
      kernel,
      runtime,
      status: "",
    };
  }

  /**
   * Use middleware on FynModule
   */
  async useMiddlewareOnFynModule(
    fynMod: FynModule,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    createRuntime: () => FynModuleRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>
  ): Promise<string> {
    if (!fynMod.__middlewareMeta) {
      return "";
    }

    const runtime = createRuntime();

    console.debug("🔍 Processing middleware metadata:", fynMod.__middlewareMeta);

    const ccs: FynAppMiddlewareCallContext[] = [];

    for (const meta of fynMod.__middlewareMeta) {
      console.debug("🔍 Processing meta item:", meta);

      let cc: FynAppMiddlewareCallContext | null = null;

      // Handle new string format: "-FYNAPP_MIDDLEWARE package-name middleware-path [semver]"
      if (typeof meta === 'string') {
        cc = await this.parseMiddlewareString(
          meta,
          {},
          fynMod,
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
            fynMod,
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
            fynMod,
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

    return this.callMiddlewares(ccs);
  }

  /**
   * Apply auto-scope middlewares
   */
  async applyAutoScopeMiddlewares(
    fynApp: FynApp,
    fynModule: FynModule | undefined,
    kernel: FynMeshKernel,
    autoApplyMiddlewares: {
      fynapp: FynAppMiddlewareReg[];
      middleware: FynAppMiddlewareReg[];
    } | undefined,
    createRuntime: () => FynModuleRuntime,
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>
  ): Promise<void> {
    console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApplyMiddlewares exists?`, !!autoApplyMiddlewares);
    if (!autoApplyMiddlewares) {
      console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
      return;
    }

    // Apply middleware based on FynApp type
    const targetMiddlewares = isFynAppMiddlewareProvider(fynApp)
      ? autoApplyMiddlewares.middleware
      : autoApplyMiddlewares.fynapp;

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
          console.error(`❌ Error in shouldApply for ${mwReg.regKey}:`, error);
          continue;
        }
      }

      console.debug(
        `🔄 Auto-applying ${mwReg.middleware.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
      );

      const context: FynAppMiddlewareCallContext = {
        meta: {
          info: {
            name: mwReg.middleware.name,
            provider: mwReg.hostFynApp.name,
            version: mwReg.hostFynApp.version,
          },
          config: {},
        },
        fynMod: fynModule || { async execute() { } },
        fynApp,
        reg: mwReg,
        runtime: createRuntime(),
        kernel,
        status: "ready",
      };

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
        console.error(`❌ Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}:`, error);
      }
    }
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
  getDeferredInvokes(): { callContexts: FynAppMiddlewareCallContext[] }[] {
    return [...this.deferInvoke];
  }

  /**
   * Get ready middleware
   */
  getReadyMiddleware(): Map<string, any> {
    return new Map(this.middlewareReady);
  }
}
