import type { MiddlewareUseMeta, FynModule } from "./types.ts";
/**
 * mark some user code for middleware usage
 *
 * @param meta Information about the middleware
 * @param config Configuration for the middleware
 * @param user User code that uses the middleware
 * @returns A middleware usage object
 */
export declare const useMiddleware: <UserT extends FynModule = FynModule>(meta: MiddlewareUseMeta<unknown> | MiddlewareUseMeta<unknown>[], user: UserT) => UserT;
export declare const noOpMiddlewareUser: FynModule;
export declare const main: FynModule;
