import type { FynApp, FynUnit, FynAppMiddlewareReg, FynAppMiddlewareCallContext, FynUnitRuntime, FynMeshKernel } from "./types";

/** Prefix for middleware expose modules (e.g., "./middleware/design-tokens") */
export const MIDDLEWARE_EXPOSE_PREFIX = "./middleware";

/** Prefix for middleware export names (e.g., "__middleware__design_tokens") */
export const MIDDLEWARE_EXPORT_PREFIX = "__middleware__";

export function urlJoin(baseUrl: string, urlPath: string): string {
  const fillSlash = urlPath.startsWith("/") || baseUrl.endsWith("/") ? "" : "/";
  return `${baseUrl}${fillSlash}${urlPath}`;
}

/**
 * Check if a FynApp is a middleware provider
 * @param fynApp The FynApp to check
 * @returns true if the FynApp exposes middleware modules
 */
export function isFynAppMiddlewareProvider(fynApp: FynApp): boolean {
  return Object.keys(fynApp.exposes).some(key => key.startsWith(MIDDLEWARE_EXPOSE_PREFIX));
}

/**
 * Get the appropriate middleware list based on FynApp type
 * @param fynApp The FynApp to check
 * @param autoApplyMiddlewares The categorized middleware lists
 * @returns The middleware list for the given FynApp type, or empty array if no auto-apply middlewares
 */
export function getTargetMiddlewares(
  fynApp: FynApp,
  autoApplyMiddlewares?: { fynapp: FynAppMiddlewareReg[]; middleware: FynAppMiddlewareReg[] }
): FynAppMiddlewareReg[] {
  if (!autoApplyMiddlewares) return [];
  return isFynAppMiddlewareProvider(fynApp)
    ? autoApplyMiddlewares.middleware
    : autoApplyMiddlewares.fynapp;
}

/**
 * Find the first middleware that can override execution for a given FynApp and FynUnit
 * @param fynApp The FynApp being executed
 * @param fynUnit The FynUnit being executed
 * @param autoApplyMiddlewares The categorized auto-apply middleware lists
 * @returns The middleware reg that can override execution, or null
 */
export function findExecutionOverride(
  fynApp: FynApp,
  fynUnit: FynUnit,
  autoApplyMiddlewares?: { fynapp: FynAppMiddlewareReg[]; middleware: FynAppMiddlewareReg[] }
): FynAppMiddlewareReg | null {
  if (!autoApplyMiddlewares) return null;

  const targetMiddlewares = getTargetMiddlewares(fynApp, autoApplyMiddlewares);

  for (const mwReg of targetMiddlewares) {
    if (mwReg.middleware.canOverrideExecution?.(fynApp, fynUnit)) {
      return mwReg;
    }
  }

  return null;
}

/**
 * Create a middleware call context object
 * @param mwReg The middleware registration
 * @param fynUnit The FynUnit being processed
 * @param fynApp The FynApp owning the FynUnit
 * @param runtime The FynUnit runtime
 * @param kernel The FynMesh kernel
 * @param config Optional config (defaults to {})
 * @param status Optional status (defaults to "")
 * @returns A fully-constructed FynAppMiddlewareCallContext
 */
export function createMiddlewareCallContext(
  mwReg: FynAppMiddlewareReg,
  fynUnit: FynUnit,
  fynApp: FynApp,
  runtime: FynUnitRuntime,
  kernel: FynMeshKernel,
  config?: any,
  status?: string
): FynAppMiddlewareCallContext {
  return {
    meta: {
      info: {
        name: mwReg.middleware.name,
        provider: mwReg.hostFynApp.name,
        version: mwReg.hostFynApp.version,
      },
      config: config ?? {},
    },
    fynUnit,
    fynMod: fynUnit, // deprecated compatibility
    fynApp,
    reg: mwReg,
    runtime,
    kernel,
    status: status ?? "",
  };
}

/**
 * Execute a middleware override for a FynUnit (handles both overrideInitialize and overrideExecute)
 * @param executionOverride The middleware registration that overrides execution
 * @param fynUnit The FynUnit being overridden
 * @param fynApp The FynApp owning the FynUnit
 * @param runtime The FynUnit runtime
 * @param kernel The FynMesh kernel
 */
export async function executeMiddlewareOverride(
  executionOverride: FynAppMiddlewareReg,
  fynUnit: FynUnit,
  fynApp: FynApp,
  runtime: FynUnitRuntime,
  kernel: FynMeshKernel
): Promise<void> {
  console.debug(`🎭 Middleware ${executionOverride.middleware.name} is overriding execution for ${fynApp.name}`);

  const context = createMiddlewareCallContext(executionOverride, fynUnit, fynApp, runtime, kernel, {}, "ready");

  if (executionOverride.middleware.overrideInitialize && fynUnit.initialize) {
    console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
    const initResult = await executionOverride.middleware.overrideInitialize(context);
    console.debug(`🎭 Initialize result:`, initResult);
  }

  if (executionOverride.middleware.overrideExecute && typeof fynUnit.execute === "function") {
    console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
    await executionOverride.middleware.overrideExecute(context);
  }
}
