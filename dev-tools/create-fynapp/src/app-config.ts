import fs from "fs";
import path from "path";

const identifierPattern = /^[a-z0-9-]+$/;

function checkIdentifier(value: string, label: string): true | string {
  if (!value.trim()) {
    return `${label} cannot be empty`;
  }
  if (!identifierPattern.test(value)) {
    return `${label} can only contain lowercase letters, numbers, and hyphens`;
  }
  return true;
}

export function checkAppName(value: string): true | string {
  return checkIdentifier(value, "App name");
}

export function checkDirectoryName(value: string): true | string {
  return checkIdentifier(value, "Directory name");
}

export function assertCreationValuesAllowed(name: string, dir: string): void {
  for (const result of [checkAppName(name), checkDirectoryName(dir)]) {
    if (result !== true) {
      throw new Error(result);
    }
  }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Where new FynApps go, given the directory the CLI was run from.
 *
 * This repository keeps every FynApp under `demo/`, and both the docs and the
 * agent guides say so, so running `create-fynapp` at the monorepo root has to
 * keep landing there. A public install has no such convention -- scaffolding
 * into `./demo/<name>` in someone else's project is the repository's layout
 * leaking into their tree (FYM-248), so there the base is simply the current
 * directory.
 *
 * The test is fynpo.json beside a `demo` directory rather than the package's
 * own location, because `fyn global add` and `npx` both put the CLI outside
 * the repo it is scaffolding into. Requiring both markers keeps an unrelated
 * fynpo monorepo from silently acquiring a `demo/` convention it never had.
 *
 * @param rootDir directory the CLI was invoked from
 * @returns the directory new FynApps are created under
 */
export function resolveBaseDir(rootDir: string): string {
  const demoDir = path.resolve(rootDir, "demo");
  const inFynmeshMonorepo =
    fs.existsSync(path.resolve(rootDir, "fynpo.json")) && fs.existsSync(demoDir);
  return inFynmeshMonorepo ? demoDir : path.resolve(rootDir);
}

export function resolveTargetDir(rootDir: string, dir: string): string {
  const baseDir = resolveBaseDir(rootDir);
  const targetDir = path.resolve(baseDir, dir);
  if (!isInside(baseDir, targetDir)) {
    throw new Error(`Target directory must stay inside ${baseDir}.`);
  }

  if (fs.existsSync(targetDir)) {
    const realBaseDir = fs.realpathSync(baseDir);
    const realTargetDir = fs.realpathSync(targetDir);
    if (!isInside(realBaseDir, realTargetDir)) {
      throw new Error(`Target directory must stay inside ${baseDir}.`);
    }
  }

  return targetDir;
}
