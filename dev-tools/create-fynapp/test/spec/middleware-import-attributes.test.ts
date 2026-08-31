import { describe, it, expect } from "vitest";
import { transform } from "esbuild";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fynappEsbuildSupported } from "../../src/index.ts";

/**
 * FYM-283 - a FynApp declares its middleware through import attributes:
 *
 *   import("pkg/middleware/x/x", { with: { type: "fynapp-middleware" } })
 *
 * Those attributes are the whole mechanism. rollup-plugin-federation reads them
 * in `resolveDynamicImport` and rewrites the import into an id string, and the
 * manifest's `import-exposed` is written from the same signal.
 *
 * esbuild drops them for every target below `esnext`, silently. The app then
 * ships a real dynamic import, the kernel gets a Promise where it expects an id,
 * and the FynUnit's `execute` is never called - three demo apps rendered nothing
 * for several releases with no error anywhere.
 */

const DECLARATION = `
const unit = useMiddleware(
  [
    {
      mw: import("fynapp-react-middleware/main/basic-counter", {
        with: { type: "fynapp-middleware" },
      }),
      config: {},
    },
  ],
  {}
);
export default unit;
`;

describe("middleware import attributes", () => {
  // the targets FynApps in this repo actually compile to, plus the default
  it.each(["es2020", "es2022", undefined])(
    "survive the TypeScript transform at target %s",
    async (target) => {
      const { code } = await transform(DECLARATION, {
        loader: "ts",
        target,
        supported: { ...fynappEsbuildSupported },
      });

      expect(code).toContain('with: { type: "fynapp-middleware" }');
    },
  );

  it("is what the flag is for - esbuild drops them without it", async () => {
    const { code } = await transform(DECLARATION, {
      loader: "ts",
      target: "es2022",
    });

    // the failure this guards against, pinned so the flag is never dropped as
    // redundant: no warning, no error, just a plain dynamic import
    expect(code).toContain("import(");
    expect(code).not.toContain("fynapp-middleware");
  });

  it("every FynApp rollup config goes through setupTypeScriptPlugins", () => {
    // configuring rollup-plugin-esbuild directly is how the attributes get lost,
    // so the demo apps are read off disk rather than listed - a new one that
    // wires esbuild by hand fails here instead of rendering nothing
    const demo = fileURLToPath(new URL("../../../../demo", import.meta.url));
    const configs = readdirSync(demo)
      .map((dir) => [dir, `${demo}/${dir}/rollup.config.ts`] as const)
      .filter(([, path]) => existsSync(path));

    expect(configs.length).toBeGreaterThan(0);

    for (const [dir, path] of configs) {
      const source = readFileSync(path, "utf8");
      if (!/esbuild|setupTypeScriptPlugins|typescript:/.test(source)) {
        continue; // no TypeScript transform in this one
      }
      expect(source, `${dir} configures rollup-plugin-esbuild directly`).not.toMatch(
        /newRollupPlugin\(esbuild\)/,
      );
    }
  });
});
