import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KERNEL_VERSION } from '../src/kernel-version.js';
import { FynMeshKernelCore } from '../src/kernel-core.js';

/**
 * src/kernel-version.ts is generated from package.json by build/gen-version.mjs
 * and committed, so src/ compiles without the build having run. That leaves one
 * way to be wrong: a checkout where package.json moved and the generated file
 * did not -- exactly what shipped @fynmesh/kernel@1.1.0 reporting "1.0.0".
 *
 * These run against src/, so they fail before such a build is published.
 */
describe('kernel version', () => {
    // vitest runs with the package root as cwd; import.meta.url is not a file
    // URL under the configured test environment.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    it('matches the version in package.json', () => {
        expect(KERNEL_VERSION).toBe(pkg.version);
    });

    it('is a plain semver release string', () => {
        expect(KERNEL_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    });

    it('is what the kernel reports as its version', () => {
        class TestKernel extends FynMeshKernelCore {
            async loadFynApp(): Promise<void> {}
        }
        expect(new TestKernel().version).toBe(pkg.version);
    });
});
