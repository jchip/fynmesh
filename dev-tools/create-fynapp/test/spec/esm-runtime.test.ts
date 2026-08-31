import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildPackage, distDir, packageDir, runBuiltGenerator } from "../helpers/built-package";

describe("published ESM runtime", () => {
  beforeAll(buildPackage);

  function runCreate(cwd: string, args: string[]) {
    return spawnSync(process.execPath, [path.join(distDir, "create-cli.js"), ...args], {
      cwd,
      input: "\n",
      encoding: "utf8",
      timeout: 5_000,
    });
  }

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

  it("honors cfa check --no-build and --dir", () => {
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
        [path.join(distDir, "cfa.js"), "check", "--dir", appDir, "--no-build"],
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
    const targetDir = path.join(tmpRoot, "vue-app");

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

  it("rejects an invalid direct app name before writing files", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-name-"));
    try {
      const result = runCreate(tmpRoot, [
        "--name",
        "Bad_Name",
        "--framework",
        "react",
        "--dir",
        "valid-dir",
        "--skip-install",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "App name can only contain lowercase letters, numbers, and hyphens",
      );
      expect(fs.existsSync(path.join(tmpRoot, "valid-dir"))).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("rejects a direct directory traversal before writing files", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-traversal-"));
    try {
      const result = runCreate(tmpRoot, [
        "--name",
        "safe-app",
        "--framework",
        "react",
        "--dir",
        "../escape",
        "--skip-install",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Directory name can only contain lowercase letters, numbers, and hyphens",
      );
      expect(fs.existsSync(path.join(tmpRoot, "escape"))).toBe(false);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("rejects an existing target symlink outside the base directory", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-symlink-"));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-outside-"));
    // fynpo.json + demo/ is what puts the base at demo/ (FYM-248), which is
    // where the planted symlink has to sit for this to test the guard.
    fs.writeFileSync(path.join(tmpRoot, "fynpo.json"), "{}");
    fs.mkdirSync(path.join(tmpRoot, "demo"));
    fs.symlinkSync(outsideDir, path.join(tmpRoot, "demo", "safe-app"));

    try {
      const result = runCreate(tmpRoot, [
        "--name",
        "safe-app",
        "--framework",
        "react",
        "--dir",
        "safe-app",
        "--skip-install",
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Target directory must stay inside");
      expect(fs.readdirSync(outsideDir)).toHaveLength(0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("creates a fully specified app without reading stdin", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-noninteractive-"));
    const targetDir = path.join(tmpRoot, "test-app");

    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(distDir, "create-cli.js"),
          "--name",
          "test-app",
          "--framework",
          "react",
          "--dir",
          "test-app",
          "--skip-install",
        ],
        { cwd: tmpRoot, encoding: "utf8", timeout: 2_000 },
      );

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(targetDir, "package.json"))).toBe(true);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // The counterpart to the test above: same invocation, but at a monorepo root,
  // where the demo/ convention this repository and its agent guides document
  // still has to hold (FYM-248).
  it("still creates under demo/ at a monorepo root", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-monorepo-"));
    fs.writeFileSync(path.join(tmpRoot, "fynpo.json"), "{}");
    fs.mkdirSync(path.join(tmpRoot, "demo"));

    try {
      const result = runCreate(tmpRoot, [
        "--name",
        "test-app",
        "--framework",
        "react",
        "--dir",
        "test-app",
        "--skip-install",
      ]);

      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tmpRoot, "demo", "test-app", "package.json"))).toBe(true);
      expect(result.stdout).toContain(`cd ${path.join("demo", "test-app")}`);
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
