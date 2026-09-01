import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cached: Record<string, string> = {};

/**
 * Read one version off create-fynapp's own manifest.
 *
 * Resolved from this module's directory, so it reads the same manifest whether
 * running from `src` under vitest or from the published `dist`.
 */
function ownManifest(): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
}

/**
 * The `@fynmesh/kernel` range a scaffolded FynApp should depend on.
 *
 * Taken from create-fynapp's own `@fynmesh/kernel` devDependency, which is the
 * one copy of that version that stays correct without anyone maintaining it:
 * fynpo's `prepare` rewrites it on every kernel release, and the `versionLocks`
 * group in fynpo.json makes the kernel and create-fynapp release together — so
 * at publish time it already names the kernel about to ship.
 *
 * The templates therefore carry a `{{kernelVersion}}` placeholder rather than a
 * literal range of their own. Nothing updates a literal sitting in a template:
 * templates/ went untouched by five straight `[Publish]` commits and drifted to
 * a kernel two minor versions old before anyone noticed (FYM-285).
 */
export function kernelVersion(): string {
  if (cached.kernel) {
    return cached.kernel;
  }

  const range = ownManifest().devDependencies?.["@fynmesh/kernel"];

  // Scaffolding an app whose kernel dependency says `undefined` fails far from
  // here, in the consumer's install, so refuse at the source instead.
  if (!range) {
    throw new Error(
      "no @fynmesh/kernel devDependency in create-fynapp's package.json - cannot tell a scaffolded app which kernel to use",
    );
  }

  cached.kernel = range;
  return range;
}

/**
 * The `create-fynapp` range a scaffolded FynApp should depend on.
 *
 * A scaffolded app keeps create-fynapp as a devDependency for its rollup config
 * factory, so it wants the release that scaffolded it -- taken from this
 * package's own `version`, which fynpo bumps on every release. Same drift the
 * kernel range had: the literal here sat at `^1.0.0` through 1.1.3 (FYM-286).
 */
export function createFynappVersion(): string {
  if (cached.self) {
    return cached.self;
  }

  const version = ownManifest().version;

  if (!version) {
    throw new Error("create-fynapp's package.json has no version to pin a scaffolded app to");
  }

  cached.self = `^${version}`;
  return cached.self;
}
