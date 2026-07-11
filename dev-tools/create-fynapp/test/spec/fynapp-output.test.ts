import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fynappEntryFilename } from "../../src/constants";
import { validateFynApp } from "../../src/validate-fynapp";

function writeOutput(appDir: string, name = "sample-app", version = "1.0.0") {
  const distDir = path.join(appDir, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, fynappEntryFilename), "export {};\n");
  fs.writeFileSync(
    path.join(distDir, "fynapp.manifest.json"),
    JSON.stringify({ name, version, exposes: { "./main": { path: "src/main.ts" } } }),
  );
}

describe("FynApp output checks", () => {
  let appDir: string;

  beforeEach(() => {
    appDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-output-"));
    fs.writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "sample-app", version: "1.0.0" }),
    );
  });

  afterEach(() => fs.rmSync(appDir, { recursive: true, force: true }));

  it("removes stale output before building", async () => {
    writeOutput(appDir);
    const binDir = path.join(appDir, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    const rollup = path.join(binDir, "rollup");
    fs.writeFileSync(rollup, "#!/bin/sh\nexit 0\n");
    fs.chmodSync(rollup, 0o755);

    const result = await validateFynApp(appDir);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`Missing federation entry: dist/${fynappEntryFilename}`);
    expect(result.errors).toContain("Missing dist/fynapp.manifest.json");
  });

  it("matches manifest identity and version to package.json", async () => {
    writeOutput(appDir, "other-app", "2.0.0");

    const result = await validateFynApp(appDir, { build: false });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'manifest name "other-app" does not match package.json name "sample-app"',
    );
    expect(result.errors).toContain(
      'manifest version "2.0.0" does not match package.json version "1.0.0"',
    );
  });

  it("rejects malformed package metadata", async () => {
    fs.writeFileSync(path.join(appDir, "package.json"), "{");
    writeOutput(appDir);

    const result = await validateFynApp(appDir, { build: false });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("package.json does not parse");
  });
});
