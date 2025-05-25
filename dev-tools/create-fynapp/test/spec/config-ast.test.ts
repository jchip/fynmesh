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
          requiredVersion: "^19.0.0",
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
                requiredVersion: '^18.3.0'
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
                requiredVersion: '^18.3.0'
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

            // Only update singleton, leave requiredVersion unchanged
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
                requiredVersion: '^18.3.0'
            });

            manager.save();

            // Read the file back and verify changes
            const savedContent = fs.readFileSync(testConfigPath, 'utf8');
            expect(savedContent).toContain('singleton: true');
            expect(savedContent).toContain('^18.3.0');
        });
    });
});
