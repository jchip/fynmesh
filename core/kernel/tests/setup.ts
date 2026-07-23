import { vi, beforeEach } from 'vitest';

// Mock global variables that the kernel expects
Object.defineProperty(globalThis, 'fynMeshKernel', {
    value: undefined,
    writable: true,
    configurable: true,
});

// Mock fetch for testing API calls
globalThis.fetch = vi.fn();

// Mock import() for dynamic imports
vi.mock('import', () => ({
    default: vi.fn(),
}));

// Mock console methods in tests to reduce noise
const originalConsole = { ...console };
globalThis.console = {
    ...originalConsole,
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
};

// Restore console for debugging when needed
export const restoreConsole = () => {
    globalThis.console = originalConsole;
};

// Helper to create mock FynApp entries
export const createMockFynApp = (name: string, overrides: any = {}) => ({
    name,
    version: '1.0.0',
    entry: `./dist/${name}.js`,
    remotes: {},
    shared: {},
    exposes: {},
    setup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});

// Helper to create mock middleware
export const createMockMiddleware = (key: string, overrides: any = {}) => ({
    regKey: key,
    hostFynApp: {
        name: `host-${key}`,
        version: '1.0.0',
        ...overrides.hostFynApp,
    },
    middleware: {
        name: key,
        invoke: vi.fn(),
        ...overrides.middleware,
    },
    ...overrides,
});

// Reset all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fynMeshKernel = undefined;
});
