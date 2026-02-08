// Mock the index module to avoid loading CLI dependencies (inquirer, etc.)
jest.mock('../../src/index', () => {
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
  };
});

// Mock rollup-wrap-plugin
jest.mock('rollup-wrap-plugin', () => ({
  newRollupPlugin: (pluginFn: any) => (...args: any[]) => pluginFn(...args),
}));

// Mock rollup plugins
jest.mock('@rollup/plugin-node-resolve', () => ({
  __esModule: true,
  default: (config: any) => ({ name: 'node-resolve', ...config }),
}));

jest.mock('@rollup/plugin-typescript', () => ({
  __esModule: true,
  default: (config: any) => ({ name: 'typescript', ...config }),
}));

jest.mock('rollup', () => ({
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

  it('should add react externals by default for react framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
    });

    expect(config[0].external).toEqual(['esm-react', 'esm-react-dom']);
  });

  it('should add react externals for react18 framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react18',
    });

    expect(config[0].external).toEqual(['esm-react', 'esm-react-dom']);
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
    const tsPlugin = plugins.find((p: any) => p?.name === 'typescript');
    expect(tsPlugin).toBeDefined();
  });

  it('should not include typescript plugin when typescript is not set', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    const plugins = config[0].plugins as any[];
    const tsPlugin = plugins.find((p: any) => p?.name === 'typescript');
    expect(tsPlugin).toBeUndefined();
  });

  it('should include react alias plugin for react framework', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
    });

    const plugins = config[0].plugins as any[];
    const aliasPlugin = plugins.find((p: any) => p?.name === 'alias');
    expect(aliasPlugin).toBeDefined();
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

  it('should place extraPluginsAfter after federation and react alias plugins', () => {
    const customPlugin = { name: 'custom-after' } as any;
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'react',
      extraPluginsAfter: [customPlugin],
    });

    const plugins = config[0].plugins as any[];
    const afterIdx = plugins.findIndex((p: any) => p?.name === 'custom-after');
    const aliasIdx = plugins.findIndex((p: any) => p?.name === 'alias');
    expect(afterIdx).toBeGreaterThan(aliasIdx);
  });

  it('should default framework to react', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
    });

    // React framework should produce react externals
    expect(config[0].external).toEqual(['esm-react', 'esm-react-dom']);

    // And should include alias plugin (react alias)
    const plugins = config[0].plugins as any[];
    const aliasPlugin = plugins.find((p: any) => p?.name === 'alias');
    expect(aliasPlugin).toBeDefined();
  });

  it('should use vanilla federation for non-react frameworks', () => {
    const config = createFynAppRollupConfig({
      name: 'test-app',
      framework: 'solid',
    });

    const plugins = config[0].plugins as any[];
    const fedPlugin = plugins.find((p: any) => p?.name === 'federation');
    expect(fedPlugin).toBeDefined();
    // Vanilla federation should not have default esm-react in shared
    expect(fedPlugin?.shared?.['esm-react']).toBeUndefined();
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
    const tsPlugin = plugins.find((p: any) => p?.name === 'typescript');
    expect(tsPlugin?.tsconfig).toBe('./custom-tsconfig.json');
    expect(tsPlugin?.sourceMap).toBe(false);
  });
});
