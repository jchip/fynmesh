/**
 * Shared middleware helper utilities for demo FynApps.
 *
 * Provides type-safe middleware data lookup and common constants
 * used across multiple demo applications.
 */

/**
 * Type-safe lookup of middleware data from a FynUnitRuntime's middlewareContext.
 *
 * @param runtime - The FynUnitRuntime instance
 * @param middlewareName - Name of the middleware to look up
 * @returns The middleware data or undefined if not found
 */
export function getMiddlewareData<T = any>(
  runtime: { middlewareContext: Map<string, any> } | undefined,
  middlewareName: string
): T | undefined {
  return runtime?.middlewareContext?.get(middlewareName) as T | undefined;
}

/**
 * Get the shared counter data object from middleware context, with a fallback
 * to the global kernel registry for late-provider scenarios.
 *
 * Used by apps that consume the basic-counter middleware.
 */
export function getSharedCounterData(
  runtime: { middlewareContext: Map<string, any>; fynApp?: { name: string } } | undefined
): any {
  // First try runtime.middlewareContext (set during middleware setup)
  if (runtime?.middlewareContext) {
    const basicCounterData = runtime.middlewareContext.get("basic-counter");
    if (basicCounterData) return basicCounterData;
  }
  // Fallback: check global registry directly (handles late provider loading)
  const kernel: any = (globalThis as any).fynMeshKernel;
  const registry = kernel?.getMiddlewareRegistry?.("global");
  const counterState = registry?.lookup?.("basic-counter");
  return counterState?.get?.() || null;
}

/**
 * Available theme options for the design-tokens middleware.
 * Shared across demo apps that support theme switching.
 */
export const THEME_OPTIONS = [
  { value: "fynmesh-default", label: "Default" },
  { value: "fynmesh-dark", label: "Dark" },
  { value: "fynmesh-blue", label: "Blue" },
  { value: "fynmesh-green", label: "Green" },
  { value: "fynmesh-purple", label: "Purple" },
  { value: "fynmesh-sunset", label: "Sunset" },
  { value: "fynmesh-cyberpunk", label: "Cyberpunk" },
] as const;

export type ThemeOption = (typeof THEME_OPTIONS)[number];
export type ThemeValue = ThemeOption["value"];
