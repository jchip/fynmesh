import { describe, it, expect, vi } from 'vitest';
import { useMiddleware, noOpMiddlewareUser } from '../src/use-middleware.js';
import type { MiddlewareUseMeta, FynModule } from '../src/types.js';

describe('useMiddleware', () => {
    describe('middleware decoration', () => {
        it('should attach single middleware meta to user module', () => {
            const meta: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'test-middleware',
                    version: '^1.0.0',
                    provider: 'test-provider',
                },
                config: { theme: 'dark' },
            };

            const user: FynModule = {
                initialize: vi.fn(),
                execute: vi.fn(),
            };

            const result = useMiddleware(meta, user);

            expect(result).toBe(user);
            expect(result.__middlewareMeta).toEqual([meta]);
        });

        it('should attach multiple middleware meta to user module', () => {
            const meta1: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'middleware-1',
                    version: '^1.0.0',
                    provider: 'provider-1',
                },
                config: { setting1: 'value1' },
            };

            const meta2: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'middleware-2',
                    version: '^2.0.0',
                    provider: 'provider-2',
                },
                config: { setting2: 'value2' },
            };

            const user: FynModule = {
                initialize: vi.fn(),
                execute: vi.fn(),
            };

            const result = useMiddleware([meta1, meta2], user);

            expect(result).toBe(user);
            expect(result.__middlewareMeta).toEqual([meta1, meta2]);
        });

        it('should handle middleware with minimal config', () => {
            const meta: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'simple-middleware',
                    provider: 'simple-provider',
                    version: '^1.0.0',
                },
                config: {},
            };

            const user: FynModule = {
                initialize: vi.fn(),
                execute: vi.fn(),
            };

            const result = useMiddleware(meta, user);

            expect(result.__middlewareMeta).toEqual([meta]);
            expect(result.__middlewareMeta![0].info.provider).toBe('simple-provider');
        });

        it('should preserve existing user module properties', () => {
            const meta: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'test-middleware',
                    provider: 'test-provider',
                    version: '^1.0.0',
                },
                config: {},
            };

            const initializeSpy = vi.fn();
            const executeSpy = vi.fn();

            const user: FynModule = {
                initialize: initializeSpy,
                execute: executeSpy,
                customProperty: 'preserved',
            } as any;

            const result = useMiddleware(meta, user);

            expect(result.initialize).toBe(initializeSpy);
            expect(result.execute).toBe(executeSpy);
            expect((result as any).customProperty).toBe('preserved');
        });
    });

    describe('noOpMiddlewareUser', () => {
        it('should have initialize and execute functions', () => {
            expect(typeof noOpMiddlewareUser.initialize).toBe('function');
            expect(typeof noOpMiddlewareUser.execute).toBe('function');
        });

        it('should execute initialize without errors', () => {
            const mockRuntime = { fynApp: {} as any, middlewareContext: new Map() };
            expect(() => noOpMiddlewareUser.initialize!(mockRuntime)).not.toThrow();
        });

        it('should execute execute without errors', () => {
            const mockRuntime = { fynApp: {} as any, middlewareContext: new Map() };
            expect(() => noOpMiddlewareUser.execute(mockRuntime)).not.toThrow();
        });

        it('should be usable as a FynModule', () => {
            const meta: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'test-middleware',
                    provider: 'test-provider',
                    version: '^1.0.0',
                },
                config: {},
            };

            const result = useMiddleware(meta, noOpMiddlewareUser);

            expect(result.__middlewareMeta).toEqual([meta]);
            expect(typeof result.initialize).toBe('function');
            expect(typeof result.execute).toBe('function');
        });
    });

    describe('type safety', () => {
        it('should preserve user module type', () => {
            interface CustomModule extends FynModule {
                customMethod(): string;
            }

            const meta: MiddlewareUseMeta<unknown> = {
                info: {
                    name: 'test-middleware',
                    provider: 'test-provider',
                    version: '^1.0.0',
                },
                config: {},
            };

            const user: CustomModule = {
                initialize: vi.fn(),
                execute: vi.fn(),
                customMethod: () => 'custom',
            };

            const result = useMiddleware(meta, user);

            // TypeScript should preserve the custom type
            expect(result.customMethod()).toBe('custom');
            expect(result.__middlewareMeta).toEqual([meta]);
        });
    });
});
