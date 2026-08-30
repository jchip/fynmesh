import fs from "node:fs";
import path from "node:path";
import type { AppConfig, BuildOptions, GeneratorConfig } from "../../src/index";
import { supportedFrameworks } from "../../src/frameworks";

type _PublicConfigTypes = AppConfig | BuildOptions | GeneratorConfig;

const packageDir = path.resolve(__dirname, "../..");

// fs.readdirSync's `recursive` option is silently ignored before Node 18.17,
// which would degrade the template scan to a shallow listing that still
// passes. Walk explicitly so the gate works on every Node, and skip
// node_modules so stray local installs under templates/ aren't scanned.
function findTemplates(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") {
        found.push(...findTemplates(path.join(dir, entry.name), path.join(prefix, entry.name)));
      }
    } else if (entry.name === "package.json.template") {
      found.push(path.join(prefix, entry.name));
    }
  }
  return found;
}

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

  // A `fyn` key in the manifest holds local dev dependency overrides, and fyn
  // honors more sections than dependencies/devDependencies (e.g.
  // optionalDependencies), so gate the whole key. The override paths only
  // resolve inside this monorepo, and fyn reads them from the *published*
  // metadata, so leaving any in makes a consumer's install chase a directory
  // that isn't there. fynpo already local-links monorepo packages by name, so
  // they buy us nothing.
  it("publishes no local fyn dependency overrides", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.fyn).toBeUndefined();
  });

  // generator.ts scaffolds from templates/<framework>, and the files list
  // deliberately ships only supported frameworks (see package-artifact test).
  // So every framework we claim to support must have its template directory
  // published -- otherwise the npm tarball can't scaffold it even though this
  // gate validated the working-tree copy.
  it("publishes a template directory for every supported framework", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    for (const framework of supportedFrameworks) {
      expect(pkg.files).toContain(`templates/${framework}`);
    }
  });

  it("scaffolds templates with no local fyn dependency overrides", () => {
    const templateDir = path.join(packageDir, "templates");
    const templates = findTemplates(templateDir);

    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, template), "utf-8"));

      expect([template, pkg.fyn]).toEqual([template, undefined]);
    }
  });
});
