import { vi } from "vitest";
import type { FynApp, FynAppEntry } from "../../src/types";

/**
 * Create a mock container for FynAppEntry
 */
function createMockContainer(name: string = "test-container", version: string = "1.0.0") {
  return {
    name,
    version,
    $E: {} as Record<string, any>,
    __FYNAPP_MANIFEST__: null,
  };
}

/**
 * Create a mock FynApp entry for testing
 */
export function createMockEntry(overrides?: Partial<FynAppEntry>): FynAppEntry {
  const container = createMockContainer();
  // Add default exposes
  container.$E["./main"] = {};
  
  return {
    container,
    init: vi.fn(),
    get: vi.fn().mockResolvedValue(() => ({})),
    setup: undefined,
    ...overrides,
  } as unknown as FynAppEntry;
}

/**
 * Create a mock FynApp for testing
 */
export function createMockFynApp(overrides?: Partial<FynApp>): FynApp {
  return {
    name: "test-app",
    version: "1.0.0",
    packageName: "test-app",
    entry: createMockEntry(),
    middlewareContext: new Map(),
    exposes: {},
    ...overrides,
  };
}

/**
 * Create a mock FynApp with middleware exposes
 */
export function createMockFynAppWithMiddleware(
  middlewareName: string = "test-middleware"
): FynApp {
  const fynApp = createMockFynApp();
  // Type assertion to bypass type checking for test purposes
  (fynApp.entry.container as any).$E[`./middleware/${middlewareName}`] = {};
  return fynApp;
}
