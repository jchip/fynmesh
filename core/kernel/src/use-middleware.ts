import type { MiddlewareUsage, MiddlewareUseMeta, FynModule } from "./types.ts";

/**
 * mark some user code for middleware usage
 *
 * @param meta Information about the middleware
 * @param config Configuration for the middleware
 * @param user User code that uses the middleware
 * @returns A middleware usage object
 */
export const useMiddleware = <UserT extends FynModule = FynModule>(
  meta: MiddlewareUseMeta<unknown> | MiddlewareUseMeta<unknown>[],
  user: UserT,
): MiddlewareUsage<UserT> => {
  return {
    __middlewareMeta: ([] as MiddlewareUseMeta<unknown>[]).concat(meta),
    user,
  };
};

export const noOpMiddlewareUser: FynModule = {
  initialize: () => {},
  execute: () => {},
};

// example usage of useMiddleware
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
