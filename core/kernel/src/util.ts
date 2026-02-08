import type { FynApp, FynUnit, FynAppMiddlewareReg } from "./types";

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
