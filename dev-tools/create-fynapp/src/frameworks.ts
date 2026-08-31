import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Frameworks that ship a hand-authored template under `templates/`.
 *
 * This is **not** an allowlist. `--framework <anything>` is accepted — a name
 * with no template of its own scaffolds from `templates/_generic` plus an agent
 * brief (FYM-273). This list is what the interactive prompt offers and what the
 * docs advertise as already done for you.
 */
export const templatedFrameworks = [
  "react",
  "react18",
  "preact",
  "vue",
  "solid",
  "svelte",
  "marko",
  "vanilla",
] as const;

export type TemplatedFramework = (typeof templatedFrameworks)[number];

/** Template directory used for a framework that has no template of its own. */
export const genericTemplateName = "_generic";

/**
 * A framework name becomes a path segment under `templates/`, so it is held to
 * the same shape as an app name and must start with a letter. That is what
 * keeps `..`, an absolute path, and `_generic` itself out of reach.
 */
const frameworkNamePattern = /^[a-z][a-z0-9-]*$/;

export function checkFrameworkName(value: string): true | string {
  if (!value || !value.trim()) {
    return "Framework cannot be empty";
  }
  if (!frameworkNamePattern.test(value)) {
    return "Framework must start with a letter and contain only lowercase letters, numbers, and hyphens";
  }
  return true;
}

/**
 * Lowercase and validate a framework name. Agents and humans both write `Vue`
 * as readily as `vue`, and the name is only ever compared and used as a
 * directory segment, so normalizing is safe.
 *
 * @throws if the name cannot be a template directory segment
 */
export function normalizeFrameworkName(value: string): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  const result = checkFrameworkName(normalized);
  if (result !== true) {
    throw new Error(result);
  }
  return normalized;
}

/** Absolute path to the templates bundled in this package. */
export function templatesDir(): string {
  return path.resolve(__dirname, "..", "templates");
}

export function hasTemplate(framework: string): boolean {
  return (
    frameworkNamePattern.test(framework) &&
    fs.existsSync(path.join(templatesDir(), framework, "package.json.template"))
  );
}

/**
 * Pick the template directory for a framework: its own if it has one, else the
 * generic one.
 *
 * @param framework a normalized framework name
 * @returns the template directory and whether it is the generic fallback
 */
export function resolveTemplate(framework: string): { dir: string; generic: boolean } {
  const generic = !hasTemplate(framework);
  return {
    dir: path.join(templatesDir(), generic ? genericTemplateName : framework),
    generic,
  };
}
