import type { MiddlewareUseMeta, FynUnit } from "./types.ts";

/**
 * Attach middleware metadata to a FynUnit
 *
 * @param meta Middleware metadata (single or array)
 * @param unit The FynUnit to attach middleware to
 * @returns The same unit with __middlewareMeta attached
 *
 * @example
 * ```typescript
 * export const main = useMiddleware(
 *   [
 *     { middleware: import('pkg/middleware'), config: { theme: 'dark' } },
 *   ],
 *   {
 *     execute(runtime) { return { type: 'component', component: MyComponent }; }
 *   }
 * );
 * ```
 */
export const useMiddleware = <UnitT extends FynUnit = FynUnit>(
  meta: MiddlewareUseMeta<unknown> | MiddlewareUseMeta<unknown>[],
  unit: UnitT,
): UnitT => {
  unit.__middlewareMeta = ([] as MiddlewareUseMeta<unknown>[]).concat(meta);
  return unit;
};

/**
 * A no-op FynUnit for middleware-only usage patterns
 */
export const noOpFynUnit: FynUnit = {
  initialize: () => ({ status: "ready" }),
  execute: () => { },
};

/**
 * @deprecated Use noOpFynUnit instead
 */
export const noOpMiddlewareUser = noOpFynUnit;

// example usage of useMiddleware
/*
export const main = useMiddleware(
  {
    info: {
      name: "react-context",
      version: "^1.0.0",
      provider: "fynapp-react-lib",
    },
    config: { theme: "light" },
  },
  noOpMiddlewareUser,
);
*/