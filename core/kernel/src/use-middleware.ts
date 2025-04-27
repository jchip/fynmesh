/**
 * info about a middleware marked for usage
 */
export type MiddlewareInfo = {
  /** npm package that provided the middleware */
  pkg: string;
  /** name of the middleware */
  middleware: string;
};

/**
 * contains information about a user application
 * that wants to use a middleware
 */
export type MiddlewareUsage<ConfigT = any, UserT = unknown> = {
  /** info about the middleware */
  __middlewareInfo: MiddlewareInfo;
  /** configuration for the middleware */
  config: ConfigT;
  /** user code that uses the middleware */
  user: UserT;
};

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
  user: UserT
): MiddlewareUsage<ConfigT> => {
  return { __middlewareInfo: info, config, user };
};
