// Mock the index module to avoid loading CLI dependencies (inquirer, etc.)
vi.mock('../../src/index', () => {
  const env = process.env.NODE_ENV || 'development';
  const isProduction = env === 'production';
  return {
    env,
    isProduction,
    fynappDummyEntryName: 'fynapp-dummy-entry',
    fynappEntryFilename: 'fynapp-entry.js',
    fynmeshShareScope: 'fynmesh',
    setupFynAppOutputConfig: () => ({
      output: { dir: 'dist', format: 'systemjs', sourcemap: true },
    }),
    setupDummyEntryPlugins: () => [
      { name: 'virtual' },
      { name: 'no-emit' },
    ],
    setupReactFederationPlugins: (config: any) => [
      { ...config, name: 'federation', _appName: config?.name, shared: { 'esm-react': { import: false }, 'esm-react-dom': { import: false }, ...config?.shared } },
    ],
    setupFederationPlugins: (config: any) => [
      { ...config, name: 'federation', _appName: config?.name },
    ],
    setupReactAliasPlugins: () => [
      { name: 'alias' },
    ],
    setupMinifyPlugins: () => isProduction ? [{ name: 'terser' }] : [],
    setupTypeScriptPlugins: (options: any = {}) => [
      {
        name: 'esbuild',
        tsconfig: './tsconfig.json',
        sourceMap: true,
        ...options,
        supported: { 'import-attributes': true, ...options?.supported },
      },
    ],
  };
});

// Mock rollup-wrap-plugin
vi.mock('rollup-wrap-plugin', () => ({
  newRollupPlugin: (pluginFn: any) => (...args: any[]) => pluginFn(...args),
}));

// Mock rollup plugins
vi.mock('@rollup/plugin-node-resolve', () => ({
  __esModule: true,
  default: (config: any) => ({ name: 'node-resolve', ...config }),
}));

vi.mock('rollup-plugin-esbuild', () => ({
  __esModule: true,
  default: (config: any) => ({ name: 'esbuild', ...config }),
}));

vi.mock('rollup', () => ({
  defineConfig: (config: any) => config,
}));

import { createFynAppRollupConfig } from '../../src/rollup-config-factory';

describe('createFynAppRollupConfig', () => {
  it('should return an array with one RollupOptions entry', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      typescript: true,
    });

    expect(Array.isArray(config)).toBe(true);
    expect(config).toHaveLength(1);
  });

  it('should set standard input with dummy entry and fynapp entry', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const input = config[0].input as string[];
    expect(input).toContain('fynapp-dummy-entry');
    expect(input).toContain('fynapp-entry.js');
  });

  it('should set standard output config', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    expect(config[0].output).toBeDefined();
    const output = config[0].output as any;
    expect(output.dir).toBe('dist');
    expect(output.format).toBe('systemjs');
    expect(output.sourcemap).toBe(true);
  });

  it('should add public react externals by default for react framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
    });

    expect(config[0].external).toEqual(['react', 'react-dom', 'react-dom/client']);
  });

  it('should add react externals for react18 framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react18',
    });

    expect(config[0].external).toEqual(['react', 'react-dom', 'react-dom/client']);
  });

  it('should add empty externals by default for vanilla framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'vanilla',
    });

    expect(config[0].external).toEqual([]);
  });

  it('should allow custom externals to override defaults', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      external: ['custom-module'],
    });

    expect(config[0].external).toEqual(['custom-module']);
  });

  it('should allow empty externals to override react defaults', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      external: [],
    });

    expect(config[0].external).toEqual([]);
  });

  it('should include plugins array that is not empty', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const plugins = config[0].plugins as any[];
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('should include typescript plugin when typescript: true', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      typescript: true,
    });

    const plugins = config[0].plugins as any[];
    const tsPlugin = plugins.find((p: any) => p?.name === 'esbuild');
    expect(tsPlugin).toBeDefined();
  });

  it('should not include typescript plugin when typescript is not set', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const plugins = config[0].plugins as any[];
    const tsPlugin = plugins.find((p: any) => p?.name === 'esbuild');
    expect(tsPlugin).toBeUndefined();
  });

  it('should not include the demo react alias plugin for react framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
    });

    const plugins = config[0].plugins as any[];
    const aliasPlugin = plugins.find((p: any) => p?.name === 'alias');
    expect(aliasPlugin).toBeUndefined();
  });

  it('should not include react alias plugin for vanilla framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'vanilla',
    });

    const plugins = config[0].plugins as any[];
    const aliasPlugin = plugins.find((p: any) => p?.name === 'alias');
    expect(aliasPlugin).toBeUndefined();
  });

  it('should include extra plugins when provided', () => {
    const customPlugin = { name: 'custom-test-plugin' } as any;
    const config = createFynAppRollupConfig({
      name: 'test-app',
      extraPlugins: [customPlugin],
    });

    const plugins = config[0].plugins as any[];
    const found = plugins.find((p: any) => p?.name === 'custom-test-plugin');
    expect(found).toBeDefined();
  });

  it('should include extraPluginsAfter when provided', () => {
    const customPlugin = { name: 'after-plugin' } as any;
    const config = createFynAppRollupConfig({
      name: 'test-app',
      extraPluginsAfter: [customPlugin],
    });

    const plugins = config[0].plugins as any[];
    const found = plugins.find((p: any) => p?.name === 'after-plugin');
    expect(found).toBeDefined();
  });

  it('should include node-resolve plugin', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const plugins = config[0].plugins as any[];
    const resolvePlugin = plugins.find((p: any) => p?.name === 'node-resolve');
    expect(resolvePlugin).toBeDefined();
  });

  it('should include federation plugin', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin).toBeDefined();
  });

  it('should consume standard React packages through federation', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');

    expect(fedPlugin?.shared?.react).toMatchObject({ import: false, singleton: true });
    expect(fedPlugin?.shared?.['react-dom']).toMatchObject({ import: false, singleton: true });
    expect(fedPlugin?.shared?.['react-dom/client']).toMatchObject({
      import: false,
      singleton: true,
    });
    expect(fedPlugin?.shared?.['esm-react']).toBeUndefined();
    expect(fedPlugin?.shared?.['esm-react-dom']).toBeUndefined();
  });

  it('should preserve ESM adapters as an explicit local-demo option', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      reactPackages: 'esm-adapters',
    });

    expect(config[0].external).toEqual(['esm-react', 'esm-react-dom']);

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin?.shared?.['esm-react']).toBeDefined();
    expect(fedPlugin?.shared?.['esm-react-dom']).toBeDefined();
    expect(plugins.find((p: any) => p?.name === 'alias')).toBeDefined();
  });

  it('should place extraPlugins before federation plugin', () => {
    const customPlugin = { name: 'custom-before' } as any;
    const config = createFynAppRollupConfig({
      name: 'test-app',
      extraPlugins: [customPlugin],
    });

    const plugins = config[0].plugins as any[];
    const customIdx = plugins.findIndex((p: any) => p?.name === 'custom-before');
    const fedIdx = plugins.findIndex((p: any) => p?.name === 'federation');
    expect(customIdx).toBeLessThan(fedIdx);
  });

  it('should place extraPluginsAfter after federation plugins', () => {
    const customPlugin = { name: 'custom-after' } as any;
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      extraPluginsAfter: [customPlugin],
    });

    const plugins = config[0].plugins as any[];
    const afterIdx = plugins.findIndex((p: any) => p?.name === 'custom-after');
    const federationIdx = plugins.findIndex((p: any) => p?.name === 'federation');
    expect(afterIdx).toBeGreaterThan(federationIdx);
  });

  it('should default framework to react', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    // React framework should produce react externals
    expect(config[0].external).toEqual(['react', 'react-dom', 'react-dom/client']);

    // Demo-only aliasing is opt-in through the low-level helper.
    const plugins = config[0].plugins as any[];
    const aliasPlugin = plugins.find((p: any) => p?.name === 'alias');
    expect(aliasPlugin).toBeUndefined();
  });

  it('should use vanilla federation for non-react frameworks', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'solid',
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin).toBeDefined();
    // Vanilla federation should not have default React packages in shared.
    expect(fedPlugin?.shared?.react).toBeUndefined();
  });

  // The react path injects "./main" for you; the vanilla path passes exposes
  // through verbatim. A non-react config that omits it exposes nothing at all,
  // which is why templates/vue lists it explicitly (CONTRACT.md section 3).
  it('should not inject a default ./main expose for non-react frameworks', () => {
    const bare = createFynAppRollupConfig({ name: 'test-app', framework: 'vue' });
    const barePlugin = (bare[0].plugins as any[]).find((p: any) => p?.name === 'federation');
    expect(barePlugin?.exposes).toEqual({});

    const listed = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'vue',
      exposes: { './main': './src/main.ts' },
      shared: { vue: { singleton: true, semver: '^3.3.4' } },
    });
    const listedPlugin = (listed[0].plugins as any[]).find((p: any) => p?.name === 'federation');
    expect(listedPlugin?.exposes).toEqual({ './main': './src/main.ts' });
    expect(listedPlugin?.shared).toEqual({ vue: { singleton: true, semver: '^3.3.4' } });
    // Vue is bundled and provided, so it must not be marked external.
    expect(listed[0].external).toEqual([]);
  });

  it('should pass entry options to federation plugins', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      entry: { header: 'console.log("hello");' },
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin?.entry?.header).toBe('console.log("hello");');
  });

  it('should pass debugging option to federation plugins', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      debugging: true,
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin?.debugging).toBe(true);
  });

  it('should pass custom resolve options', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      resolve: { browser: true, extensions: ['.js', '.ts'] },
    });

    const plugins = config[0].plugins as any[];
    const resolvePlugin = plugins.find((p: any) => p?.name === 'node-resolve');
    expect(resolvePlugin?.browser).toBe(true);
    expect(resolvePlugin?.extensions).toEqual(['.js', '.ts']);
  });

  it('should accept custom typescript options object', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      typescript: { tsconfig: './custom-tsconfig.json', sourceMap: false },
    });

    const plugins = config[0].plugins as any[];
    const tsPlugin = plugins.find((p: any) => p?.name === 'esbuild');
    expect(tsPlugin?.tsconfig).toBe('./custom-tsconfig.json');
    expect(tsPlugin?.sourceMap).toBe(false);
  });
});
