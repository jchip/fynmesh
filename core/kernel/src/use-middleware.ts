import type { MiddlewareInfo, MiddlewareUsage } from "./types";

/**
 * mark some user code for middleware usage
 *
 * @param info Information about the middleware
 * @param config Configuration for the middleware
 * @param user User code that uses the middleware
 * @returns A middleware usage object
 */
export const useMiddleware = <ConfigT, UserT = unknown>(
  info: MiddlewareInfo,
  config: ConfigT,
  user: UserT,
): MiddlewareUsage<ConfigT, UserT> => {
  return { __middlewareInfo: info, config, user };
};

// example usage of useMiddleware
export const main = useMiddleware<any, any>(
  {
    name: "react-context",
    version: "^1.0.0",
    provider: "fynapp-react-lib",
  },
  { theme: "light" },
  () => {
    console.log("Hello from react context middleware");
  },
);
