import fs from 'fs';
import path from 'path';
import { RollupConfigManager } from '../../src/config-ast';

describe('RollupConfigManager', () => {
    const testConfigPath = path.join(__dirname, '../test-config.mjs');
    const originalConfig = `import federation from "rollup-plugin-federation";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "system",
  },
  plugins: [
    federation({
      name: "test-app",
      shared: {
        "esm-react": {
          singleton: false,
          semver: "^19.0.0",
        },
      },
    }),
  ],
};`;

    beforeEach(() => {
        // Create test config file
        fs.writeFileSync(testConfigPath, originalConfig);
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testConfigPath)) {
            fs.unlinkSync(testConfigPath);
        }
        const modifiedPath = testConfigPath.replace('.mjs', '-modified.mjs');
        if (fs.existsSync(modifiedPath)) {
            fs.unlinkSync(modifiedPath);
        }
    });

    describe('updateSharedDependency', () => {
        it('should update existing shared dependency properties', () => {
            const manager = new RollupConfigManager(testConfigPath);

            manager.updateSharedDependency('esm-react', {
                singleton: true,
                semver: '^18.3.0'
            });

            const result = manager.generate();

            // Check that singleton was changed to true
            expect(result).toContain('singleton: true');
            // Check that version was updated
            expect(result).toContain('^18.3.0');
            // Check that old values are gone
            expect(result).not.toContain('singleton: false');
            expect(result).not.toContain('^19.0.0');
        });

        it('should add new shared dependency if it does not exist', () => {
            const manager = new RollupConfigManager(testConfigPath);

            manager.updateSharedDependency('esm-react-dom', {
                singleton: true,
                semver: '^18.3.0'
            });

            const result = manager.generate();

            // Check that new dependency was added
            expect(result).toContain('"esm-react-dom"');
            expect(result).toContain('singleton: true');
            // Original dependency should still be there
            expect(result).toContain('"esm-react"');
        });

        it('should preserve original formatting and structure', () => {
            const manager = new RollupConfigManager(testConfigPath);

            manager.updateSharedDependency('esm-react', {
                singleton: true
            });

            const result = manager.generate();

            // Check that import statement is preserved
            expect(result).toContain('import federation from "rollup-plugin-federation"');
            // Check that export default structure is preserved
            expect(result).toContain('export default {');
            // Check that other config properties are preserved
            expect(result).toContain('input: "src/index.ts"');
            expect(result).toContain('name: "test-app"');
        });

        it('should handle partial updates', () => {
            const manager = new RollupConfigManager(testConfigPath);

            // Only update singleton, leave semver unchanged
            manager.updateSharedDependency('esm-react', {
                singleton: true
            });

            const result = manager.generate();

            expect(result).toContain('singleton: true');
            // Original version should be preserved
            expect(result).toContain('^19.0.0');
        });
    });

    describe('generate', () => {
        it('should return valid JavaScript code', () => {
            const manager = new RollupConfigManager(testConfigPath);
            const result = manager.generate();

            // Should contain basic structure elements
            expect(result).toContain('import federation from');
            expect(result).toContain('export default {');
            expect(result).toContain('plugins: [');
            expect(result).toContain('shared: {');

            // Should not have obvious syntax errors
            expect(result).not.toContain('undefined');
            expect(result).not.toContain('[object Object]');
        });
    });

    describe('save', () => {
        it('should write modified config to file', () => {
            const manager = new RollupConfigManager(testConfigPath);

            manager.updateSharedDependency('esm-react', {
                singleton: true,
                semver: '^18.3.0'
            });

            manager.save();

            // Read the file back and verify changes
            const savedContent = fs.readFileSync(testConfigPath, 'utf8');
            expect(savedContent).toContain('singleton: true');
            expect(savedContent).toContain('^18.3.0');
        });
    });

    describe('enforcePluginOrder', () => {
        it('should reorder plugins to correct order', () => {
            // Create a config with wrong plugin order
            const wrongOrderConfig = `export default [
  {
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      alias({ entries: { react: "esm-react" } }),
      resolve({ exportConditions: ["development"] }),
      federation({ name: "test", shareScope: "fynmesh" }),
    ],
  },
];`;

            fs.writeFileSync(testConfigPath, wrongOrderConfig);
            const manager = new RollupConfigManager(testConfigPath);

            const orderChanged = manager.enforcePluginOrder();
            expect(orderChanged).toBe(true);

            const correctedConfig = manager.generate();

            // Verify correct order: resolve → federation → alias → typescript
            const resolveIndex = correctedConfig.indexOf('resolve(');
            const federationIndex = correctedConfig.indexOf('federation(');
            const aliasIndex = correctedConfig.indexOf('alias(');
            const typescriptIndex = correctedConfig.indexOf('typescript(');

            expect(resolveIndex).toBeLessThan(federationIndex);
            expect(federationIndex).toBeLessThan(aliasIndex);
            expect(aliasIndex).toBeLessThan(typescriptIndex);
        });

        it('should not change already correct plugin order', () => {
            // Create a config with correct plugin order
            const correctOrderConfig = `export default [
  {
    plugins: [
      resolve({ exportConditions: ["development"] }),
      federation({ name: "test", shareScope: "fynmesh" }),
      alias({ entries: { react: "esm-react" } }),
      typescript({ tsconfig: "./tsconfig.json" }),
    ],
  },
];`;

            fs.writeFileSync(testConfigPath, correctOrderConfig);
            const manager = new RollupConfigManager(testConfigPath);

            const orderChanged = manager.enforcePluginOrder();
            expect(orderChanged).toBe(false);
        });

        it('should handle unknown plugins by placing them at the end', () => {
            // Create a config with unknown plugins
            const configWithUnknown = `export default [
  {
    plugins: [
      customPlugin(),
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve({ exportConditions: ["development"] }),
      federation({ name: "test", shareScope: "fynmesh" }),
      anotherCustomPlugin(),
    ],
  },
];`;

            fs.writeFileSync(testConfigPath, configWithUnknown);
            const manager = new RollupConfigManager(testConfigPath);

            const orderChanged = manager.enforcePluginOrder();
            expect(orderChanged).toBe(true);

            const correctedConfig = manager.generate();

            // Known plugins should be in correct order, unknown plugins at the end
            const resolveIndex = correctedConfig.indexOf('resolve(');
            const federationIndex = correctedConfig.indexOf('federation(');
            const typescriptIndex = correctedConfig.indexOf('typescript(');
            const customIndex = correctedConfig.indexOf('customPlugin(');
            const anotherCustomIndex = correctedConfig.indexOf('anotherCustomPlugin(');

            expect(resolveIndex).toBeLessThan(federationIndex);
            expect(federationIndex).toBeLessThan(typescriptIndex);
            expect(typescriptIndex).toBeLessThan(customIndex);
            expect(customIndex).toBeLessThan(anotherCustomIndex);
        });
    });

    describe('ensureFederationPluginWithOrder', () => {
        it('should add federation plugin and enforce correct order', () => {
            // Create a config without federation plugin
            const configWithoutFederation = `export default [
  {
    plugins: [
      typescript({ tsconfig: "./tsconfig.json" }),
      resolve({ exportConditions: ["development"] }),
    ],
  },
];`;

            fs.writeFileSync(testConfigPath, configWithoutFederation);

            // Create a package.json for the test
            const testPackageJson = {
                name: 'test-app',
                version: '1.0.0'
            };
            const packageJsonPath = testConfigPath.replace('.mjs', '-package.json');
            fs.writeFileSync(packageJsonPath, JSON.stringify(testPackageJson, null, 2));

            const manager = new RollupConfigManager(testConfigPath);

            const changed = manager.ensureFederationPluginWithOrder(packageJsonPath);
            expect(changed).toBe(true);

            const correctedConfig = manager.generate();

            // Should have federation plugin and correct order
            expect(correctedConfig).toContain('federation(');

            const resolveIndex = correctedConfig.indexOf('resolve(');
            const federationIndex = correctedConfig.indexOf('federation(');
            const typescriptIndex = correctedConfig.indexOf('typescript(');

            expect(resolveIndex).toBeLessThan(federationIndex);
            expect(federationIndex).toBeLessThan(typescriptIndex);

            // Clean up package.json
            if (fs.existsSync(packageJsonPath)) {
                fs.unlinkSync(packageJsonPath);
            }
        });
    });
});
