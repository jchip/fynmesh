import fs from "node:fs";
import path from "node:path";
import type { AppConfig, BuildOptions, GeneratorConfig } from "../../src/index";

type _PublicConfigTypes = AppConfig | BuildOptions | GeneratorConfig;

const packageDir = path.resolve(__dirname, "../..");

describe("release gate configuration", () => {
  it("loads tasks without the incompatible local TypeScript loader", () => {
    expect(fs.existsSync(path.join(packageDir, "xrun-tasks.ts"))).toBe(false);
  });

  it("enables ESLint in the prepublish check", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg["@xarc/module-dev"].features).toContain("eslint");
    expect(pkg.scripts.prepublishOnly).toContain("xarc/check");
    expect(fs.existsSync(path.join(packageDir, ".eslintrc.cjs"))).toBe(true);
  });

  it("uses a TypeDoc release compatible with the resolved TypeScript", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.devDependencies.typedoc).toBe("^0.28.7");
  });

  it("uses fyn for the global install script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.scripts["install-cfa"]).toBe("fyn run build && fyn global add .");
  });
});
