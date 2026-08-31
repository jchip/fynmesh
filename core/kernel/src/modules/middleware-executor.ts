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
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";
import { isFynAppMiddlewareProvider, MIDDLEWARE_EXPOSE_PREFIX, getTargetMiddlewares, findExecutionOverride, createMiddlewareCallContext, executeMiddlewareOverride, parseMiddlewareString } from "../util";
import { noOpFynUnit } from "../use-middleware";
import {
  MiddlewareError,
  KernelErrorCode,
} from "../errors";

export interface MiddlewareExecutionOptions {
  signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>;
  providerModeRegistrar?: (fynAppName: string, middlewareName: string, mode: "provider" | "consumer") => void;
  autoApply?: {
    fynapp: FynAppMiddlewareReg[];
    mw: FynAppMiddlewareReg[];
  };
  skipFynUnit?: boolean;
}

/**
 * A group of middleware call contexts parked until all of them are ready.
 *
 * `key` identifies the group by its members. It is stored rather than derived
 * on demand because every lookup used to rebuild it — a map + sort + join over
 * the group — for *each* parked group, turning a comparison into O(n·m log m)
 * of string building.
 */
type DeferredGroup = {
  callContexts: FynAppMiddlewareCallContext[];
  resumeMode?: "full" | "middleware_only";
  key: string;
};

/** Identity of a deferred group: its member keys, order-independent. */
function deferKeyOf(ccs: FynAppMiddlewareCallContext[]): string {
  return ccs
    .map((c) => c.reg.fullKey)
    .sort()
    .join("|");
}

/**
 * Turn a value thrown by middleware into a logged `MiddlewareError`.
 *
 * Every auto-apply failure site built the same thing by hand: the same
 * `instanceof Error` narrowing twice over (once for the message, once for the
 * cause), the same three-key context off `mwReg`, and the same `❌` log line.
 * Only the code and the summary ever differed, so those are the parameters.
 */
function middlewareFailure(
  code: KernelErrorCode,
  summary: string,
  mwReg: FynAppMiddlewareReg,
  fynApp: FynApp,
  error: unknown
): MiddlewareError {
  const cause = error instanceof Error ? error : undefined;
  const mwError = new MiddlewareError(code, `${summary}: ${cause ? cause.message : String(error)}`, {
    middlewareName: mwReg.mw.name,
    provider: mwReg.hostFynApp.name,
    fynAppName: fynApp.name,
    cause,
  });
  console.error(`❌ ${mwError.message}`);
  return mwError;
}

export interface MiddlewareExecutor {
  /** Ready middlewares by fullKey, with the share each published. Exposed for
   * the executor tests, which assert on defer/ready bookkeeping directly. */
  middlewareReady: Map<string, any>;
  deferInvoke: DeferredGroup[];
  setMiddlewareReady(fullKey: string, share: any): void;
  checkSingleMiddlewareReady(cc: FynAppMiddlewareCallContext): boolean;
  checkMiddlewareReady(ccs: FynAppMiddlewareCallContext[]): boolean;
  checkDeferCalls(status: string, ccs: FynAppMiddlewareCallContext[]): string;
  processReadyMiddleware(readyKey: string, share: any): { resumes: DeferredGroup[] };
  callMiddlewares(
    ccs: FynAppMiddlewareCallContext[],
    options?: MiddlewareExecutionOptions,
    tries?: number,
  ): Promise<string>;
  useMiddlewareOnFynUnit(
    fynUnit: FynUnit,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    createRuntime: () => FynUnitRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>,
    autoApply?: { fynapp: FynAppMiddlewareReg[]; mw: FynAppMiddlewareReg[] },
  ): Promise<string>;
  applyAutoScopeMiddlewares(
    fynApp: FynApp,
    fynUnit: FynUnit | undefined,
    kernel: FynMeshKernel,
    autoApply: { fynapp: FynAppMiddlewareReg[]; mw: FynAppMiddlewareReg[] } | undefined,
    createRuntime: () => FynUnitRuntime,
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>,
  ): Promise<MiddlewareError[]>;
  clear(): void;
}

/**
 * Built as a closure over its state rather than a class — see the note on
 * `ManifestResolver`. The defer bookkeeping is read on nearly every path, so
 * making it closure state removes a property lookup from each one.
 */
export const MiddlewareExecutor = function (telemetry?: KernelTelemetry): MiddlewareExecutor {
  const tel = telemetry ?? noOpTelemetry;
  const middlewareReady = new Map<string, any>();
  let deferInvoke: DeferredGroup[] = [];
  /** Runtimes whose unit.initialize already ran — a deferred group resumes
   * with the same runtime and must not re-run it (FYM-144) */
  const initializedRuntimes = new WeakSet<FynUnitRuntime>();

  const markDeferResumeMode = (ccs: FynAppMiddlewareCallContext[], resumeMode: "full" | "middleware_only"): void => {
    const key = deferKeyOf(ccs);
    for (const item of deferInvoke) {
      if (item.key === key) {
        item.resumeMode = resumeMode;
      }
    }
  };

  /**
   * Set middleware as ready
   */
  const setMiddlewareReady = (fullKey: string, share: any): void => {
    middlewareReady.set(fullKey, share);
  };

  /**
   * Check if a single middleware is ready
   */
  const checkSingleMiddlewareReady = (cc: FynAppMiddlewareCallContext): boolean => {
    if (middlewareReady.has(cc.reg.fullKey)) {
      cc.runtime.share = middlewareReady.get(cc.reg.fullKey);
      cc.status = "ready";
      return true;
    }
    return false;
  };

  /**
   * Check if all middlewares in the list are ready.
   *
   * Mapped before testing rather than `every`: checkSingleMiddlewareReady also
   * stamps status and share onto each context, so every one must be visited —
   * short-circuiting would leave later contexts unrefreshed.
   */
  const checkMiddlewareReady = (ccs: FynAppMiddlewareCallContext[]): boolean => {
    return ccs.map((cc) => checkSingleMiddlewareReady(cc)).every(Boolean);
  };

  /**
   * Check and handle deferred calls
   */
  const checkDeferCalls = (status: string, ccs: FynAppMiddlewareCallContext[]): string => {
    if (status === "defer") {
      if (checkMiddlewareReady(ccs)) {
        return "retry";
      }
      // Dedupe: avoid pushing identical pending groups
      const incomingKey = deferKeyOf(ccs);
      const exists = deferInvoke.some((d) => d.key === incomingKey);
      if (!exists) {
        deferInvoke.push({
          callContexts: ccs,
          resumeMode: "full",
          key: incomingKey,
        });
      }
      return "defer";
    }
    return "ready";
  };

  /**
   * Process ready middlewares when one becomes ready
   */
  const processReadyMiddleware = (
    readyKey: string,
    share: any
  ): { resumes: DeferredGroup[] } => {
    setMiddlewareReady(readyKey, share);

    // Partition the parked groups into those now fully ready and those still
    // waiting. The previous version collected indices, spliced them out back to
    // front to keep the indices valid, then reversed the result to undo that —
    // three passes and an index dance to express one filter.
    const resumes: DeferredGroup[] = [];
    const waiting: DeferredGroup[] = [];

    for (const group of deferInvoke) {
      const allReady = group.callContexts
        .map((deferCC) => {
          if (deferCC.reg.fullKey === readyKey) {
            deferCC.runtime.share = share;
            deferCC.status = "ready";
          }
          return deferCC.status === "ready" || deferCC.status === "skip";
        })
        .every(Boolean);

      (allReady ? resumes : waiting).push(group);
    }

    deferInvoke = waiting;
    return { resumes };
  };

  /**
   * Validate retry count and throw if exceeded
   */
  const validateRetryCount = (ccs: FynAppMiddlewareCallContext[], tries: number): void => {
    if (tries > 1) {
      const mwError = new MiddlewareError(
        KernelErrorCode.MIDDLEWARE_SETUP_FAILED,
        `Middleware setup failed after 2 tries for ${ccs.map(cc => cc.reg.regKey).join(", ")}`,
        {
          middlewareName: ccs[0]?.reg.mw.name,
          provider: ccs[0]?.reg.hostFynApp.name,
          fynAppName: ccs[0]?.fynApp.name,
        }
      );
      console.error(`🚨 ${mwError.message}`);
      throw mwError;
    }
  };

  /**
   * Run middleware setup phase and signal readiness
   * @returns {{ middlewareSetupStatus: string; hasDeferredMiddleware: boolean }}
   */
  const setupMiddlewares = async (
    ccs: FynAppMiddlewareCallContext[],
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>
  ): Promise<{ middlewareSetupStatus: string; hasDeferredMiddleware: boolean }> => {
    let middlewareSetupStatus = "ready";
    let hasDeferredMiddleware = false;

    for (const cc of ccs) {
      const { fynApp, reg } = cc;
      const mw = reg.mw;
      // Checked per context here rather than for the whole group up front: the
      // bulk pass discarded its result and only marked contexts ready, which
      // this call redoes for each one anyway — and does so later, after earlier
      // setups have had a chance to signal readiness, so it is never staler.
      checkSingleMiddlewareReady(cc);
      if (mw.setup) {
        console.debug("🚀 Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
        const result = await mw.setup(cc);
        captureEvent(tel, "setup.completed", { mw: reg.regKey, app: fynApp.name });
        if (result?.status === "ready" && !middlewareReady.has(cc.reg.fullKey)) {
          if (signalReady) {
            await signalReady(cc, result?.share);
          }
        }
        if (result?.status === "defer") {
          middlewareSetupStatus = "defer";
          hasDeferredMiddleware = true;
        }
        // A ready signal (sent by setup itself or by us above) populates the
        // ready map and refreshes deferred contexts, but not this in-flight
        // cc — refresh it so this first pass's applyReadyMiddlewares and
        // runtime.share see the readiness (FYM-143)
        checkSingleMiddlewareReady(cc);
      }
    }

    return { middlewareSetupStatus, hasDeferredMiddleware };
  };

  /**
   * Initialize the FynUnit and handle provider mode registration
   * @returns {{ allowDegraded: boolean; deferResult: string | null }} where deferResult is non-null if the caller should return early
   */
  const initializeFynUnit = async (
    ccs: FynAppMiddlewareCallContext[],
    fynUnit: FynUnit,
    fynApp: FynApp,
    runtime: FynUnitRuntime,
    providerModeRegistrar?: (fynAppName: string, middlewareName: string, mode: "provider" | "consumer") => void,
    skipFynUnit?: boolean
  ): Promise<{ allowDegraded: boolean; initDeferStatus: string }> => {
    if (skipFynUnit || !fynUnit.initialize) {
      return { allowDegraded: false, initDeferStatus: "ready" };
    }

    // initialize is a one-time declaration per unit runtime (FYM-144)
    if (initializedRuntimes.has(runtime)) {
      return { allowDegraded: false, initDeferStatus: "ready" };
    }

    console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
    const result: any = await fynUnit.initialize(runtime);
    initializedRuntimes.add(runtime);
    const allowDegraded = Boolean(result?.deferOk);

    if (result?.mode && providerModeRegistrar) {
      for (const cc of ccs) {
        providerModeRegistrar(fynApp.name, cc.reg.mw.name, result.mode);
      }
      console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
    }

    const initDeferStatus = checkDeferCalls(result?.status, ccs);
    return { allowDegraded, initDeferStatus };
  };

  /**
   * Apply middlewares that are currently ready
   */
  const applyReadyMiddlewares = async (ccs: FynAppMiddlewareCallContext[], fynApp: FynApp): Promise<void> => {
    for (const cc of ccs) {
      if (cc.status !== "ready") continue;
      const mw = cc.reg.mw;
      if (!mw.apply) continue;
      console.debug("🚀 Invoking middleware", cc.reg.regKey, "apply for", fynApp.name, fynApp.version);
      await mw.apply(cc);
    }
  };

  /**
   * Execute the FynUnit with possible middleware override
   */
  const executeWithOverride = async (
    fynUnit: FynUnit,
    fynApp: FynApp,
    runtime: FynUnitRuntime,
    kernel: FynMeshKernel,
    autoApply?: {
      fynapp: FynAppMiddlewareReg[];
      mw: FynAppMiddlewareReg[];
    }
  ): Promise<void> => {
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);

    let didExecute = false;
    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
      didExecute = true;
    } else if (fynUnit.execute) {
      console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
      await fynUnit.execute(runtime);
      didExecute = true;
    }

    if (didExecute) {
      captureEvent(tel, "execute.completed", { app: fynApp.name, override: !!executionOverride });
    }
  };

  /**
   * Call middlewares with setup and apply - orchestrates the middleware lifecycle
   */
  const callMiddlewares = async (
    ccs: FynAppMiddlewareCallContext[],
    options: MiddlewareExecutionOptions = {},
    tries = 0
  ): Promise<string> => {
    if (ccs.length === 0) {
      console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
      return "ready";
    }

    if (tries === 0) {
      captureEvent(tel, "call.started", { count: ccs.length, app: ccs[0]?.fynApp?.name });
    }

    validateRetryCount(ccs, tries);

    // Phase 1: Setup middlewares
    const { middlewareSetupStatus, hasDeferredMiddleware } = await setupMiddlewares(ccs, options.signalReady);

    const fynUnit = ccs[0].fynUnit;
    const fynApp = ccs[0].fynApp;
    const runtime = ccs[0].runtime;

    const postSetupStatus = checkDeferCalls(middlewareSetupStatus, ccs);
    if (postSetupStatus === "retry") {
      return await callMiddlewares(ccs, options, tries + 1);
    }

    // Phase 2: Initialize the FynUnit
    const { allowDegraded, initDeferStatus } = await initializeFynUnit(
      ccs, fynUnit, fynApp, runtime, options.providerModeRegistrar, options.skipFynUnit
    );

    if (initDeferStatus === "defer" && !allowDegraded) {
      captureEvent(tel, "call.deferred", { app: fynApp?.name });
      return "defer";
    }
    if (initDeferStatus === "retry") {
      return await callMiddlewares(ccs, options, tries + 1);
    }

    if (hasDeferredMiddleware && postSetupStatus === "defer" && !allowDegraded && !options.skipFynUnit) {
      captureEvent(tel, "call.deferred", { app: fynApp?.name });
      return "defer";
    }

    // Phase 3: Apply ready middlewares
    await applyReadyMiddlewares(ccs, fynApp);

    if (options.skipFynUnit) {
      return "ready";
    }

    if (allowDegraded && postSetupStatus === "defer") {
      markDeferResumeMode(ccs, "middleware_only");
    }

    // Phase 4: Execute with possible override
    await executeWithOverride(fynUnit, fynApp, runtime, ccs[0].kernel, options.autoApply);

    return "ready";
  };



  /**
   * Builds the error for a middleware declaration the kernel cannot read.
   *
   * This used to be a `console.debug` and a `continue`. The meta was dropped,
   * `callMiddlewares` found no contexts and returned "ready" without ever
   * calling the unit's `execute`, and bootstrap reported success -- so a FynApp
   * that rendered nothing looked exactly like one that had rendered. The build
   * defect behind it (esbuild stripping the `fynapp-middleware` import
   * attributes) survived that way through several releases (FYM-283).
   *
   * A declaration whose *shape* the kernel cannot read is always a build or
   * authoring defect, never a runtime condition to wait out, so it throws. A
   * readable declaration naming middleware that has not registered yet is a
   * different case and stays non-fatal.
   *
   * @param fynApp - The FynApp whose declaration this is
   * @param meta - The unusable declaration
   * @returns The error to throw
   */
  const unusableMiddlewareMeta = (fynApp: FynApp, meta: unknown) => {
    const shape =
      meta && typeof meta === "object"
        ? Object.entries(meta as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v === null ? "null" : typeof v}`)
            .join(", ")
        : typeof meta;

    return new MiddlewareError(
      KernelErrorCode.MIDDLEWARE_NOT_FOUND,
      `${fynApp.name} declared a middleware the kernel cannot read: {${shape}}. ` +
        `\`mw\` must be the id string that rollup-plugin-federation writes for an ` +
        `import tagged \`with { type: "fynapp-middleware" }\`. Getting a Promise ` +
        `here means those import attributes were stripped before the plugin saw ` +
        `them - check that the build's TypeScript transform preserves them ` +
        `(create-fynapp's setupTypeScriptPlugins does).`,
      { fynAppName: fynApp.name }
    );
  };

  /**
   * Use middleware on FynUnit
   */
  const useMiddlewareOnFynUnit = async (
    fynUnit: FynUnit,
    fynApp: FynApp,
    kernel: FynMeshKernel,
    createRuntime: () => FynUnitRuntime,
    getMiddleware: (name: string, provider?: string) => FynAppMiddlewareReg,
    loadMiddlewareFromDependency?: (packageName: string, middlewarePath: string) => Promise<void>,
    autoApply?: {
      fynapp: FynAppMiddlewareReg[];
      mw: FynAppMiddlewareReg[];
    }
  ): Promise<string> => {
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
        cc = await parseMiddlewareString(
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
        if ((meta as any).mw && typeof (meta as any).mw === 'string') {
          cc = await parseMiddlewareString(
            (meta as any).mw,
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
            fynApp,
            reg,
            kernel,
            runtime,
            status: "",
          };
        } else {
          throw unusableMiddlewareMeta(fynApp, meta);
        }
      } else {
        // neither the id string nor an object - nothing here to read
        throw unusableMiddlewareMeta(fynApp, meta);
      }

      if (cc) {
        ccs.push(cc);
      } else {
        /*
         * The shape was readable but named middleware that is not registered.
         * That can be a legitimate wait, so it is not fatal - but it is not
         * something to whisper either: with no context the unit's `execute` is
         * never reached, and the app renders nothing.
         */
        console.error(
          `\u26A0\uFE0F ${fynApp.name}: no middleware resolved for declaration`,
          meta,
          "- this FynApp will not execute unless another declaration resolves"
        );
      }
    }

    if (fynUnit.__middlewareMeta.length > 0 && ccs.length === 0) {
      console.error(
        `\u274C ${fynApp.name} declared ${fynUnit.__middlewareMeta.length} middleware(s)` +
          ` and resolved none, so its execute will not run and it will render nothing`
      );
    }

    console.debug("✅ Created", ccs.length, "middleware call contexts");

    return callMiddlewares(ccs, { autoApply });
  };

  /**
   * Apply auto-scope middlewares
   * @returns Array of errors that occurred during middleware application (empty if all succeeded)
   */
  const applyAutoScopeMiddlewares = async (
    fynApp: FynApp,
    fynUnit: FynUnit | undefined,
    kernel: FynMeshKernel,
    autoApply: {
      fynapp: FynAppMiddlewareReg[];
      mw: FynAppMiddlewareReg[];
    } | undefined,
    createRuntime: () => FynUnitRuntime,
    signalReady?: (cc: FynAppMiddlewareCallContext, share?: any) => Promise<void>
  ): Promise<MiddlewareError[]> => {
    const errors: MiddlewareError[] = [];

    console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApply exists?`, !!autoApply);
    if (!autoApply) {
      console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
      return errors;
    }

    // Apply middleware based on FynApp type
    const targetMiddlewares = getTargetMiddlewares(fynApp, autoApply);

    for (const mwReg of targetMiddlewares) {
      // Check if middleware has a filter function and call it
      if (mwReg.mw.shouldApply) {
        try {
          const shouldApply = mwReg.mw.shouldApply(fynApp);
          if (!shouldApply) {
            console.debug(`⏭️ Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
            continue;
          }
        } catch (error) {
          errors.push(
            middlewareFailure(
              KernelErrorCode.MIDDLEWARE_FILTER_ERROR,
              `Error in shouldApply for ${mwReg.regKey}`,
              mwReg,
              fynApp,
              error
            )
          );
          continue;
        }
      }

      console.debug(
        `🔄 Auto-applying ${mwReg.mw.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
      );

      const unit = fynUnit || noOpFynUnit;
      const context = createMiddlewareCallContext(mwReg, unit, fynApp, createRuntime(), kernel, {}, "ready");

      try {
        if (mwReg.mw.setup) {
          const result = await mwReg.mw.setup(context);
          if (result?.status === "ready" && signalReady) {
            await signalReady(context, result.share);
          }
        }
        if (mwReg.mw.apply) {
          await mwReg.mw.apply(context);
        }
      } catch (error) {
        tel.capErr(
          "auto_apply.failed",
          { mw: mwReg.regKey, app: fynApp.name },
          error
        );
        errors.push(
          middlewareFailure(
            KernelErrorCode.MIDDLEWARE_APPLY_FAILED,
            `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}`,
            mwReg,
            fynApp,
            error
          )
        );
      }
    }

    return errors;
  };

  /**
   * Clear executor state
   */
  const clear = (): void => {
    middlewareReady.clear();
    deferInvoke = [];
  };

  return {
    middlewareReady,
    get deferInvoke() {
      return deferInvoke;
    },
    setMiddlewareReady,
    checkSingleMiddlewareReady,
    checkMiddlewareReady,
    checkDeferCalls,
    processReadyMiddleware,
    callMiddlewares,
    useMiddlewareOnFynUnit,
    applyAutoScopeMiddlewares,
    clear,
  };
} as unknown as new (telemetry?: KernelTelemetry) => MiddlewareExecutor;
