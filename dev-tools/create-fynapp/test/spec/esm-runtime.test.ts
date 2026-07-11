import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildPackage, distDir, packageDir, runBuiltGenerator } from "../helpers/built-package";

describe("published ESM runtime", () => {
  beforeAll(buildPackage);

  it.each(["create-cli.js", "cfa.js"])("loads the %s bin", (bin) => {
    const result = spawnSync(process.execPath, [path.join(distDir, bin), "--help"], {
      cwd: packageDir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  });

  it.each(["create-cli.js", "cfa.js"])("executes the %s bin from a URL-sensitive path", (bin) => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-url-path-"));
    const copiedPackage = path.join(tmpRoot, "create fynapp#100%");
    fs.mkdirSync(copiedPackage);
    fs.cpSync(distDir, path.join(copiedPackage, "dist"), { recursive: true });
    fs.writeFileSync(path.join(copiedPackage, "package.json"), JSON.stringify({ type: "module" }));
    fs.symlinkSync(path.join(packageDir, "node_modules"), path.join(copiedPackage, "node_modules"));

    try {
      const result = spawnSync(process.execPath, [path.join(copiedPackage, "dist", bin), "--help"], {
        cwd: copiedPackage,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage:");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("honors cfa validate --no-build and --dir", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-no-build-"));
    const appDir = path.join(tmpRoot, "app");
    fs.mkdirSync(path.join(appDir, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "test-app", version: "1.0.0" }),
    );
    fs.writeFileSync(path.join(appDir, "dist", "fynapp-entry.js"), "");
    fs.writeFileSync(
      path.join(appDir, "dist", "fynapp.manifest.json"),
      JSON.stringify({ name: "test-app", version: "1.0.0", exposes: { "./main": {} } }),
    );

    try {
      const result = spawnSync(
        process.execPath,
        [path.join(distDir, "cfa.js"), "validate", "--dir", appDir, "--no-build"],
        { cwd: packageDir, encoding: "utf8", timeout: 5_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("rejects an unsupported framework before creating its target", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-framework-"));
    const targetDir = path.join(tmpRoot, "demo", "vue-app");

    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(distDir, "create-cli.js"),
          "--name",
          "vue-app",
          "--framework",
          "vue",
          "--dir",
          "vue-app",
          "--skip-install",
        ],
        { cwd: tmpRoot, input: "\n", encoding: "utf8", timeout: 5_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unsupported framework: vue");
      expect(fs.existsSync(targetDir)).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("generates from the built package's bundled templates", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-dist-gen-"));
    const targetDir = path.join(tmpRoot, "demo", "built-app");
    try {
      runBuiltGenerator({
        name: "built-app",
        framework: "react",
        targetDir,
        rootDir: tmpRoot,
      });
      expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
