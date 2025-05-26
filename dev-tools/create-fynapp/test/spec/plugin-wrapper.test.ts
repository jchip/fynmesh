import {
    newRollupPlugin,
    getPluginMeta,
    FYNMESH_META
} from '../../src/rollup-plugin-wrapper';

// Mock plugin constructors for testing
const mockFederationPlugin = (config: any) => ({
    name: 'federation',
    buildStart() { },
    generateBundle() { },
    config: config // Store config separately to avoid overwriting name
});

const mockResolvePlugin = (config: any) => ({
    name: 'resolve',
    resolveId() { },
    config: config
});

const mockTypescriptPlugin = (config: any) => ({
    name: 'typescript',
    transform() { },
    config: config
});

describe('Plugin Wrapper', () => {
    describe('newRollupPlugin() wrapper function', () => {
        it('should wrap plugin constructor and preserve original functionality', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);
            const config = { name: 'test-app', exposes: { './App': './src/App.tsx' } };

            const pluginInstance = wrappedFederation(config);

            // Should preserve original plugin properties
            expect(pluginInstance.name).toBe('federation');
            expect(pluginInstance.buildStart).toBeDefined();
            expect(pluginInstance.generateBundle).toBeDefined();
            expect(pluginInstance.config).toEqual(config);
        });

        it('should attach metadata with symbol key', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);
            const config = { name: 'test-app', shareScope: 'fynmesh' };

            const pluginInstance = wrappedFederation(config);

            // Should have metadata attached
            expect(pluginInstance[FYNMESH_META]).toBeDefined();
            expect(typeof pluginInstance[FYNMESH_META]).toBe('object');
        });

        it('should preserve TypeScript type safety', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);

            // This should compile without TypeScript errors
            const pluginInstance = wrappedFederation({
                name: 'test-app',
                exposes: { './App': './src/App.tsx' }
            });

            expect(pluginInstance).toBeDefined();
        });

        it('should handle multiple arguments', () => {
            const mockMultiArgPlugin = (config: any, options: any) => ({
                name: 'multi-arg',
                config,
                options
            });

            const wrapped = newRollupPlugin(mockMultiArgPlugin);
            const config = { name: 'test' };
            const options = { debug: true };

            const pluginInstance = wrapped(config, options);
            const meta = getPluginMeta(pluginInstance);

            expect(meta?.args).toHaveLength(2);
            expect(meta?.args[0]).toEqual(config);
            expect(meta?.args[1]).toEqual(options);
        });

        it('should generate unique IDs for each plugin instance', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);

            const instance1 = wrappedFederation({ name: 'app1' });
            const instance2 = wrappedFederation({ name: 'app2' });

            const meta1 = getPluginMeta(instance1);
            const meta2 = getPluginMeta(instance2);

            expect(meta1?.id).toBeDefined();
            expect(meta2?.id).toBeDefined();
            expect(meta1?.id).not.toBe(meta2?.id);
        });
    });

    describe('getPluginMeta()', () => {
        it('should return complete metadata object', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);
            const config = { name: 'test-app', exposes: {} };

            const pluginInstance = wrappedFederation(config);
            const meta = getPluginMeta(pluginInstance);

            expect(meta).toBeDefined();
            expect(meta?.id).toBeDefined();
            expect(meta?.args).toBeDefined();
            expect(meta?.config).toBeDefined();
            expect(meta?.pluginName).toBe('federation');
            expect(meta?.created).toBeDefined();
            expect(typeof meta?.created).toBe('number');
        });

        it('should return undefined for non-wrapped plugins', () => {
            const regularPlugin = mockFederationPlugin({ name: 'test' });
            const meta = getPluginMeta(regularPlugin);

            expect(meta).toBeUndefined();
        });

        it('should return the first argument as config', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);
            const config = {
                name: 'test-app',
                exposes: { './App': './src/App.tsx' },
                shared: { react: { singleton: true } }
            };

            const pluginInstance = wrappedFederation(config);
            const meta = getPluginMeta(pluginInstance);

            expect(meta?.config).toEqual(config);
        });

        it('should handle functions in config (safe cloning)', () => {
            const wrappedPlugin = newRollupPlugin(mockFederationPlugin);
            const config = {
                name: 'test-app',
                callback: () => 'test',
                nested: {
                    func: () => 'nested'
                }
            };

            const pluginInstance = wrappedPlugin(config);
            const meta = getPluginMeta(pluginInstance);

            expect(meta?.config.name).toBe('test-app');
            expect(typeof meta?.config.callback).toBe('function');
            expect(typeof meta?.config.nested.func).toBe('function');
        });
    });

    describe('Integration with real rollup config pattern', () => {
        it('should work with typical fynapp rollup config structure', () => {
            const wrappedFederation = newRollupPlugin(mockFederationPlugin);
            const wrappedResolve = newRollupPlugin(mockResolvePlugin);
            const wrappedTypescript = newRollupPlugin(mockTypescriptPlugin);

            // Simulate typical fynapp rollup config
            const rollupConfig = [
                {
                    input: ['fynapp-dummy-entry', 'fynapp-entry.js'],
                    output: [{ dir: 'dist', format: 'system', sourcemap: true }],
                    external: ['esm-react', 'esm-react-dom'],
                    plugins: [
                        wrappedResolve({ exportConditions: ['development'] }),
                        wrappedFederation({
                            name: 'fynapp-1',
                            shareScope: 'fynmesh',
                            filename: 'fynapp-entry.js',
                            exposes: {
                                './App': './src/App.tsx',
                                './main': './src/main.ts'
                            },
                            shared: {
                                'esm-react': {
                                    import: false,
                                    singleton: false,
                                    requiredVersion: '^19.0.0'
                                }
                            }
                        }),
                        wrappedTypescript({
                            tsconfig: './tsconfig.json',
                            sourceMap: true
                        })
                    ]
                }
            ];

            // Extract metadata from plugins
            const plugins = rollupConfig[0].plugins;
            const federationPlugin = plugins[1];
            const federationMeta = getPluginMeta(federationPlugin);

            expect(federationMeta).toBeDefined();
            expect(federationMeta?.config.name).toBe('fynapp-1');
            expect(federationMeta?.config.shareScope).toBe('fynmesh');
            expect(federationMeta?.config.exposes['./App']).toBe('./src/App.tsx');
        });
    });
});
