import type { FynApp } from "./types";

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
  return Object.keys(fynApp.exposes).some(key => key.startsWith('./middleware'));
}
