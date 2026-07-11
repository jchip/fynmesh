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
