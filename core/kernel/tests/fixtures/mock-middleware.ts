import { vi } from "vitest";
import type { 
  FynAppMiddleware, 
  FynAppMiddlewareReg,
  FynAppMiddlewareCallContext,
  FynApp 
} from "../../src/types";
import { createMockFynApp } from "./mock-fynapp";

/**
 * Create a mock middleware for testing
 */
export function createMockMiddleware(
  overrides?: Partial<FynAppMiddleware>
): FynAppMiddleware {
  return {
    name: "test-middleware",
    setup: vi.fn().mockResolvedValue({ status: "ready" }),
    apply: vi.fn(),
    ...overrides,
  };
}

/**
 * Create a mock middleware with auto-apply scope
 */
export function createMockAutoApplyMiddleware(
  scope: ("all" | "fynapp" | "middleware")[],
  overrides?: Partial<FynAppMiddleware>
): FynAppMiddleware {
  return createMockMiddleware({
    autoApplyScope: scope,
    ...overrides,
  });
}

/**
 * Create a mock middleware registration
 */
export function createMockMiddlewareReg(
  overrides?: Partial<FynAppMiddlewareReg>
): FynAppMiddlewareReg {
  const hostFynApp = createMockFynApp();
  const middleware = createMockMiddleware();
  
  return {
    regKey: `${hostFynApp.name}::${middleware.name}`,
    fullKey: `${hostFynApp.name}@${hostFynApp.version}::${middleware.name}`,
    hostFynApp,
    exposeName: "./middleware/test",
    exportName: "__middleware__test",
    middleware,
    ...overrides,
  };
}

/**
 * Create a mock middleware call context
 */
export function createMockCallContext(
  overrides?: Partial<FynAppMiddlewareCallContext>
): FynAppMiddlewareCallContext {
  const fynApp = createMockFynApp();
  const reg = createMockMiddlewareReg();
  
  return {
    meta: {
      info: {
        name: reg.middleware.name,
        provider: reg.hostFynApp.name,
        version: reg.hostFynApp.version,
      },
      config: {},
    },
    fynMod: {
      execute: vi.fn(),
    },
    fynApp,
    reg,
    runtime: {
      fynApp,
      middlewareContext: new Map(),
    },
    kernel: {} as any, // Will be provided by test
    status: "",
    ...overrides,
  };
}

/**
 * Create a mock middleware that defers execution
 */
export function createMockDeferringMiddleware(
  overrides?: Partial<FynAppMiddleware>
): FynAppMiddleware {
  return createMockMiddleware({
    setup: vi.fn().mockResolvedValue({ status: "defer" }),
    ...overrides,
  });
}

/**
 * Create a mock middleware with execution override capabilities
 */
export function createMockOverrideMiddleware(
  overrides?: Partial<FynAppMiddleware>
): FynAppMiddleware {
  return createMockMiddleware({
    canOverrideExecution: vi.fn().mockReturnValue(true),
    overrideInitialize: vi.fn().mockResolvedValue({ status: "ready" }),
    overrideExecute: vi.fn(),
    ...overrides,
  });
}
