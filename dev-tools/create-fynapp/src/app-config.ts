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

export function resolveTargetDir(rootDir: string, dir: string): string {
  const demoDir = path.resolve(rootDir, "demo");
  const targetDir = path.resolve(demoDir, dir);
  if (!isInside(demoDir, targetDir)) {
    throw new Error(`Target directory must stay inside ${demoDir}.`);
  }

  if (fs.existsSync(targetDir)) {
    const realDemoDir = fs.realpathSync(demoDir);
    const realTargetDir = fs.realpathSync(targetDir);
    if (!isInside(realDemoDir, realTargetDir)) {
      throw new Error(`Target directory must stay inside ${demoDir}.`);
    }
  }

  return targetDir;
}
