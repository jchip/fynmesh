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

  // FYM-262 dropped @xarc/module-dev and eslint here, following what fynjs did
  // across its own packages. module-dev also carried a second @xarc/run, which
  // fought the @fynjs/run the rest of the repo now runs on (FYM-255), so this
  // asserts it stays gone rather than merely absent by accident.
  it("carries no @xarc/module-dev or eslint remnants", () => {
    expect(pkg["@xarc/module-dev"]).toBeUndefined();
    expect(pkg.devDependencies["@xarc/module-dev"]).toBeUndefined();
    expect(pkg.devDependencies.eslint).toBeUndefined();
    expect(pkg.devDependencies["@typescript-eslint/eslint-plugin"]).toBeUndefined();
    expect(pkg.devDependencies["@typescript-eslint/parser"]).toBeUndefined();
    expect(fs.existsSync(path.join(packageDir, ".eslintrc.cjs"))).toBe(false);
    expect(pkg.scripts.prepublishOnly).not.toContain("xarc/");
  });

  // The suite moved from jest to vitest with the module-dev drop, so nothing
  // should still reach for the jest toolchain.
  it("runs its tests on vitest, not jest", () => {
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.jest).toBeUndefined();
    expect(pkg.devDependencies.jest).toBeUndefined();
    expect(pkg.devDependencies["ts-jest"]).toBeUndefined();
    expect(pkg.devDependencies["@types/jest"]).toBeUndefined();
    expect(fs.existsSync(path.join(packageDir, "vitest.config.ts"))).toBe(true);
  });

  it("uses a TypeDoc release compatible with the resolved TypeScript", () => {
    expect(pkg.devDependencies.typedoc).toBe("^0.28.7");
  });

  // The CLI binds to @fynjs/cli-args through untyped exec callbacks, so an API
  // change inside the range is a runtime break with no compile-time signal.
  // cli-args 1.0.0 counted an option's separated value as a command argument
  // while pre-scanning argv, so `create-fynapp --name x --framework vue` died
  // with "No command given" and FYM-256 reverted to nix-clap 2.0.0. FJM-137
  // fixed the pre-scan in 1.0.1, so that is the floor. Check the resolved copy
  // too, so a lockfile that drifted below it fails here rather than only in a
  // consumer's install.
  it("requires the @fynjs/cli-args release whose defaultCommand survives option values", () => {
    expect(pkg.dependencies["@fynjs/cli-args"]).toBe("^1.0.1");
    expect(pkg.dependencies["nix-clap"]).toBeUndefined();
    const resolved = readJson(require.resolve("@fynjs/cli-args/package.json")).version;
    const [major, minor, patch] = resolved.split(".").map(Number);
    expect([major, minor, patch]).toEqual([1, 0, expect.any(Number)]);
    expect(patch).toBeGreaterThanOrEqual(1);
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
