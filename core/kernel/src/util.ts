import type { FynApp } from "./types";

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
