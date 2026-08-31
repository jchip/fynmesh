import fs from "node:fs";
import path from "node:path";
import type { AppConfig, BuildOptions, GeneratorConfig } from "../../src/index";
import { supportedFrameworks } from "../../src/frameworks";

type _PublicConfigTypes = AppConfig | BuildOptions | GeneratorConfig;

const packageDir = path.resolve(__dirname, "../..");

// A bare SyntaxError from JSON.parse names no file, leaving the developer to
// bisect which manifest or template broke -- always parse with the path.
function readJson(file: string) {
  const text = fs.readFileSync(file, "utf-8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

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

const pkg = readJson(path.join(packageDir, "package.json"));
const templateDir = path.join(packageDir, "templates");
const templates = findTemplates(templateDir);

describe("release gate configuration", () => {
  it("loads tasks without the incompatible local TypeScript loader", () => {
    expect(fs.existsSync(path.join(packageDir, "xrun-tasks.ts"))).toBe(false);
  });

  it("enables ESLint in the prepublish check", () => {
    expect(pkg["@xarc/module-dev"].features).toContain("eslint");
    expect(pkg.scripts.prepublishOnly).toContain("xarc/check");
    expect(fs.existsSync(path.join(packageDir, ".eslintrc.cjs"))).toBe(true);
  });

  it("uses a TypeDoc release compatible with the resolved TypeScript", () => {
    expect(pkg.devDependencies.typedoc).toBe("^0.28.7");
  });

  // The CLI binds to nix-clap through untyped exec callbacks, so an API change
  // inside the range is a runtime break with no compile-time signal. 2.4.5
  // changed exec's second argument from an array of command nodes to a
  // parse-result object and stopped honoring `defaultCommand`, which broke
  // every command of both published bins (FYM-247). The monorepo lockfile hid
  // it: the repo resolved 2.0.0 while a public install of `^2.0.0` resolved
  // 2.4.5. Pin exactly until the CLI is migrated to the 2.4.x API. Check the
  // resolved copy too, so a lockfile that drifted fails here rather than only
  // in a consumer's install.
  it("pins nix-clap to the exact version the CLI's exec signature binds to", () => {
    expect(pkg.dependencies["nix-clap"]).toBe("2.0.0");
    expect(readJson(require.resolve("nix-clap/package.json")).version).toBe("2.0.0");
  });

  it("uses fyn for the global install script", () => {
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
    expect(pkg.fyn).toBeUndefined();
  });

  // generator.ts scaffolds from templates/<framework>, and the files list
  // deliberately ships only supported frameworks (see package-artifact test).
  // So every framework we claim to support must have its template directory
  // published -- otherwise the npm tarball can't scaffold it even though this
  // gate validated the working-tree copy.
  it("publishes a template directory for every supported framework", () => {
    for (const framework of supportedFrameworks) {
      expect(pkg.files).toContain(`templates/${framework}`);
    }
  });

  it("finds scaffold templates to gate", () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates)("scaffolds %s with no local fyn dependency overrides", template => {
    expect(readJson(path.join(templateDir, template)).fyn).toBeUndefined();
  });
});
