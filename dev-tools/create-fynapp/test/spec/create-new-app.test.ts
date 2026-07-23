import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildPackage, runBuiltGenerator } from '../helpers/built-package';

/**
 * Checks that the STATIC scaffolder produces a skeleton that conforms to the
 * current FynApp contract (rollup.config.ts + the createFynAppRollupConfig
 * factory form). The old AST "smart detection" (RollupConfigManager) was
 * removed — creation is now a plain template copy.
 */
describe('create-fynapp static generator', () => {
    let tmpRoot: string;
    let targetDir: string;

    beforeAll(() => {
        buildPackage();
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cfa-gen-'));
        targetDir = path.join(tmpRoot, 'demo', 'test-fynapp');
        fs.mkdirSync(targetDir, { recursive: true });
        runBuiltGenerator({
            name: 'test-fynapp',
            framework: 'react',
            targetDir,
            rootDir: tmpRoot,
        });
    });

    afterAll(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('creates the core FynApp files', () => {
        for (const f of ['package.json', 'tsconfig.json', 'rollup.config.ts', 'src/main.ts']) {
            expect(fs.existsSync(path.join(targetDir, f))).toBe(true);
        }
    });

    it('emits rollup.config.ts using the createFynAppRollupConfig factory', () => {
        const cfg = fs.readFileSync(path.join(targetDir, 'rollup.config.ts'), 'utf8');
        expect(cfg).toContain('createFynAppRollupConfig');
        expect(cfg).toContain('from "create-fynapp"');
        expect(cfg).toContain('name: "test-fynapp"');
        // no leftover legacy .mjs verbose form
        expect(cfg).not.toContain('setupReactFederationPlugins');
    });

    it('creates a valid package.json wired for the FynApp build', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
        expect(pkg.name).toBe('test-fynapp');
        expect(pkg.type).toBe('module');
        expect(pkg.scripts.build).toBe('rm -rf dist && rollup -c');
        expect(pkg.devDependencies['create-fynapp']).toBeDefined();
        expect(pkg.devDependencies['@fynmesh/kernel']).toBeDefined();
    });

    it('main.ts exports `main` as a FynUnit', () => {
        const main = fs.readFileSync(path.join(targetDir, 'src', 'main.ts'), 'utf8');
        expect(main).toContain('export const main');
        expect(main).toContain('FynUnit');
    });
});
