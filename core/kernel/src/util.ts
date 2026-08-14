import type { FynApp, FynUnit, FynAppMiddlewareReg, FynAppMiddlewareCallContext, FynUnitRuntime, FynMeshKernel, MiddlewareInfo } from "./types";

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
 * @param autoApply The categorized middleware lists
 * @returns The middleware list for the given FynApp type, or empty array if no auto-apply middlewares
 */
export function getTargetMiddlewares(
  fynApp: FynApp,
  autoApply?: { fynapp: FynAppMiddlewareReg[]; mw: FynAppMiddlewareReg[] }
): FynAppMiddlewareReg[] {
  if (!autoApply) return [];
  return isFynAppMiddlewareProvider(fynApp)
    ? autoApply.mw
    : autoApply.fynapp;
}

/**
 * Find the first middleware that can override execution for a given FynApp and FynUnit
 * @param fynApp The FynApp being executed
 * @param fynUnit The FynUnit being executed
 * @param autoApply The categorized auto-apply middleware lists
 * @returns The middleware reg that can override execution, or null
 */
export function findExecutionOverride(
  fynApp: FynApp,
  fynUnit: FynUnit,
  autoApply?: { fynapp: FynAppMiddlewareReg[]; mw: FynAppMiddlewareReg[] }
): FynAppMiddlewareReg | null {
  if (!autoApply) return null;

  const targetMiddlewares = getTargetMiddlewares(fynApp, autoApply);

  for (const mwReg of targetMiddlewares) {
    if (mwReg.mw.canOverrideExecution?.(fynApp, fynUnit)) {
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
  status?: string,
  /** Overrides the identity taken from `mwReg` — the "-FYNAPP_MIDDLEWARE" string
   * form carries its own name/provider/semver, which may differ from the reg. */
  info?: MiddlewareInfo
): FynAppMiddlewareCallContext {
  return {
    meta: {
      info: info ?? {
        name: mwReg.mw.name,
        provider: mwReg.hostFynApp.name,
        version: mwReg.hostFynApp.version,
      },
      config: config ?? {},
    },
    fynUnit,
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
  console.debug(`🎭 Middleware ${executionOverride.mw.name} is overriding execution for ${fynApp.name}`);

  const context = createMiddlewareCallContext(executionOverride, fynUnit, fynApp, runtime, kernel, {}, "ready");

  if (executionOverride.mw.overrideInitialize && fynUnit.initialize) {
    console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
    const initResult = await executionOverride.mw.overrideInitialize(context);
    console.debug(`🎭 Initialize result:`, initResult);
  }

  if (executionOverride.mw.overrideExecute && typeof fynUnit.execute === "function") {
    console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
    await executionOverride.mw.overrideExecute(context);
  }
}

/**
 * Get the global Federation instance safely
 * @returns The Federation instance
 * @throws Error if Federation is not loaded
 */
export function getFederation(): any {
  const Federation = (globalThis as any).Federation;
  if (!Federation) {
    throw new Error("Federation.js is not loaded.");
  }
  return Federation;
}

/**
 * Parse middleware string format and create call context
 */
export async function parseMiddlewareString(
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

  return createMiddlewareCallContext(reg, fynUnit, fynApp, runtime, kernel, config, "", {
    name: middlewareName,
    provider: packageName,
    version: semver || "*",
  });
}
