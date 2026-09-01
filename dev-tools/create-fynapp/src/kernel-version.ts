import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cached: string | undefined;

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
 *
 * Resolved from this module's directory, so it reads the same manifest whether
 * running from `src` under vitest or from the published `dist`.
 */
export function kernelVersion(): string {
  if (cached) {
    return cached;
  }

  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const range = pkg.devDependencies?.["@fynmesh/kernel"];

  // Scaffolding an app whose kernel dependency says `undefined` fails far from
  // here, in the consumer's install, so refuse at the source instead.
  if (!range) {
    throw new Error(
      `no @fynmesh/kernel devDependency in ${pkgPath} - create-fynapp cannot tell a scaffolded app which kernel to use`,
    );
  }

  cached = range;
  return range;
}
