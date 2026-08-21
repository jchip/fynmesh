import * as Fs from "node:fs";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

// ES module equivalent of __dirname
const __dirname = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Which loader pair the demo runs on, chosen by FEDERATION:
 *
 *   FEDERATION=fork      (default) the systemjs fork + federation-js, live from
 *                        the sibling rollup-federation build outputs, so a
 *                        rebuild there shows up on a restart with no copies to
 *                        keep in sync.
 *   FEDERATION=standard  stock SystemJS 6.14.2 + the last federation-js built
 *                        before the overhaul, committed under
 *                        public/loaders/standard and frozen. Needs nothing
 *                        outside this repo. See that directory's PROVENANCE.md.
 *
 * federation-js and the loader under it are one unit: the fork keeps its module
 * registry, name->url, url->module and per-version qualifiers in
 * `System.registrations`, which stock systemjs does not have. So both halves
 * always come from the same variant, and a crossed pair is unreachable through
 * this module -- the demo spent 2026-08-17 to 08-19 serving stock SystemJS
 * against a fork-era federation-js, and the breakage was invisible because the
 * two stale halves agreed with each other.
 *
 * Both entry points resolve the pair here -- the dev server (src/dev-proxy.ts)
 * and the deployed-site build (scripts/build-demo-site.mts) -- so `fyn start`
 * and `fyn publish-demo` cannot disagree about which loader the demo runs on.
 */
export interface LoaderVariant {
  /** the FEDERATION value in effect */
  name: "fork" | "standard";
  /** holds system.js, system.min.js and system.min.js.map */
  systemDir: string;
  /** federation-js dist, used whole: the page picks .dev.js or .min.js by URL */
  federationDist: string;
}

/**
 * Resolve the loader pair FEDERATION selects, and prove it is on disk.
 *
 * @param log where the variant + build-time report goes
 * @returns the directories both halves come from
 * @throws if FEDERATION names no variant, or the variant's build is missing
 */
export function resolveLoaderVariant(
  log: (message: string) => void = console.log
): LoaderVariant {
  const name = process.env.FEDERATION ?? "fork";
  if (name !== "fork" && name !== "standard") {
    throw new Error(`FEDERATION=${name} is not a loader variant; use "fork" or "standard"`);
  }

  const standardDir = Path.join(__dirname, "../public/loaders/standard");
  const fedRepo = Path.join(__dirname, "../../../rollup-federation");
  const variant: LoaderVariant =
    name === "standard"
      ? { name, systemDir: standardDir, federationDist: standardDir }
      : {
          name,
          systemDir: Path.join(fedRepo, "systemjs/dist"),
          federationDist: Path.join(fedRepo, "federation-js/dist"),
        };

  // Report what is actually in play, with mtimes -- a stale build should be
  // readable off the log rather than inferred from browser symptoms.
  log(`federation loader variant: ${name}`);
  for (const file of [
    Path.join(variant.systemDir, "system.js"),
    Path.join(variant.federationDist, "federation-js.dev.js"),
  ]) {
    if (!Fs.existsSync(file)) {
      const remedy =
        name === "fork"
          ? "Build rollup-federation (fyn build in systemjs/ and federation-js/)," +
            " or fall back with FEDERATION=standard."
          : "public/loaders/standard is committed and should be complete; restore it from git.";
      throw new Error(`MISSING ${file}\nFEDERATION=${name} cannot be used. ${remedy}`);
    }
    log(`  ${file}  built ${Fs.statSync(file).mtime.toISOString()}`);
  }

  return variant;
}
