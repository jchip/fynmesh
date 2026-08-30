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

  // fyn.<depSec> entries are local dev paths that only resolve inside this
  // monorepo. fyn reads them from the *published* metadata, so leaving them in
  // makes a consumer's install chase a directory that isn't there. fynpo
  // already local-links monorepo packages by name, so they buy us nothing.
  it("publishes no local fyn dependency overrides", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.fyn?.dependencies).toBeUndefined();
    expect(pkg.fyn?.devDependencies).toBeUndefined();
  });

  it("scaffolds templates with no local fyn dependency overrides", () => {
    const templateDir = path.join(packageDir, "templates");
    const templates = fs
      .readdirSync(templateDir, { recursive: true } as { recursive: true })
      .map(entry => String(entry))
      .filter(entry => path.basename(entry) === "package.json.template");

    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, template), "utf-8"));

      expect([template, pkg.fyn?.dependencies]).toEqual([template, undefined]);
      expect([template, pkg.fyn?.devDependencies]).toEqual([template, undefined]);
    }
  });
});
