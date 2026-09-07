import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));

describe("published package artifact", () => {
  it("installs dependencies referenced by public declarations", () => {
    expect(pkg.dependencies["federation-js"]).toBe("^1.0.0");
    expect(pkg.devDependencies["federation-js"]).toBeUndefined();
  });

  it("does not advertise CommonJS without a CommonJS artifact", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.exports["."]).not.toHaveProperty("require");
  });

  it("builds the public ESM entrypoint as a bundle", () => {
    const rollupConfig = fs.readFileSync(path.resolve("rollup.config.ts"), "utf-8");

    expect(pkg.exports["."].import).toBe("./dist/index.js");
    expect(rollupConfig).toContain('input: "src/index.ts"');
    expect(rollupConfig).toContain('file: "dist/index.js"');
  });

  /*
   * FYM-393. `build-dist` is the fast inner loop while iterating on
   * rollup.config.ts, and rollup only overwrites what it writes -- it does not
   * remove what an earlier build left. Running it directly used to leave the
   * previous build's `.map` files in dist/ beside fresh bundles that no longer
   * reference them. The existing `clean` cannot be reused for this: it also
   * removes `lib`, which `compile-lib` owns and produces earlier in the chain.
   */
  it("clears dist before rollup writes, so an earlier build cannot linger", () => {
    expect(pkg.scripts["build-dist"]).toBe("rm -rf dist && rollup -c");
  });

  it("leaves lib alone, since compile-lib owns it and runs first", () => {
    expect(pkg.scripts["build-dist"]).not.toContain("lib");
    expect(pkg.scripts["compile-lib"]).toContain("tsconfig.lib.json");
    expect(pkg.scripts.clean).toBe("rm -rf dist lib");
  });

  it("keeps the development error overlay out of the production browser entry", () => {
    const rollupConfig = fs.readFileSync(path.resolve("rollup.config.ts"), "utf-8");

    expect(rollupConfig).toContain('input: "src/browser-dev.ts"');
    expect(rollupConfig).toContain('file: "dist/fynmesh-browser-kernel.dev.js"');
    expect(rollupConfig).toContain('input: "src/browser.ts"');
    expect(rollupConfig).toContain('file: "dist/fynmesh-browser-kernel.min.js"');
  });
});
