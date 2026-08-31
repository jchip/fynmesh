import fs from "fs";
import os from "os";
import path from "path";
import {
  assertCreationValuesAllowed,
  checkAppName,
  checkDirectoryName,
  resolveBaseDir,
  resolveTargetDir,
} from "../../src/app-config";

describe("create input inspections", () => {
  it("checks local identifier formats without validation terminology", () => {
    expect(checkAppName("test-app")).toBe(true);
    expect(checkDirectoryName("test-dir")).toBe(true);
    expect(checkAppName("Bad_Name")).toBe(
      "App name can only contain lowercase letters, numbers, and hyphens",
    );
    expect(() => assertCreationValuesAllowed("test-app", "../escape")).toThrow(
      "Directory name can only contain lowercase letters, numbers, and hyphens",
    );
  });
});

// FYM-248: scaffolding into `./demo/<name>` is right at this monorepo's root
// and wrong everywhere else, where it plants the repository's own layout in a
// consumer's project. Both shapes are exercised against real directories --
// the choice turns on files being on disk, which a mocked fs would not prove.
describe("scaffold target directory", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfa-base-")));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeMonorepo() {
    fs.writeFileSync(path.join(tmpRoot, "fynpo.json"), "{}");
    fs.mkdirSync(path.join(tmpRoot, "demo"));
  }

  it("keeps demo/ at the root of this monorepo", () => {
    makeMonorepo();
    expect(resolveBaseDir(tmpRoot)).toBe(path.join(tmpRoot, "demo"));
    expect(resolveTargetDir(tmpRoot, "my-app")).toBe(path.join(tmpRoot, "demo", "my-app"));
  });

  it("creates in the current directory for a public install", () => {
    expect(resolveBaseDir(tmpRoot)).toBe(tmpRoot);
    expect(resolveTargetDir(tmpRoot, "my-app")).toBe(path.join(tmpRoot, "my-app"));
  });

  // Either marker alone is not this repo: a bare demo/ directory is a name
  // anyone might use, and an unrelated fynpo monorepo has no demo convention.
  it("takes both markers together, not either alone", () => {
    fs.writeFileSync(path.join(tmpRoot, "fynpo.json"), "{}");
    expect(resolveBaseDir(tmpRoot)).toBe(tmpRoot);

    fs.rmSync(path.join(tmpRoot, "fynpo.json"));
    fs.mkdirSync(path.join(tmpRoot, "demo"));
    expect(resolveBaseDir(tmpRoot)).toBe(tmpRoot);
  });

  it("still refuses a target that escapes the base directory", () => {
    expect(() => resolveTargetDir(tmpRoot, "../escape")).toThrow(
      `Target directory must stay inside ${tmpRoot}.`,
    );
  });

  // An existing path is re-checked through its real location, so a symlink
  // planted in the base cannot redirect the scaffold outside it.
  it("still refuses an existing symlink pointing outside the base", () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfa-out-")));
    try {
      fs.symlinkSync(outside, path.join(tmpRoot, "my-app"), "dir");
      expect(() => resolveTargetDir(tmpRoot, "my-app")).toThrow(
        `Target directory must stay inside ${tmpRoot}.`,
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
