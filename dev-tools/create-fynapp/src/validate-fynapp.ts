import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fynappEntryFilename } from "./index.ts";

/**
 * Result of validating a FynApp.
 */
export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Locate the local `rollup` binary for an app, preferring the app's own
 * node_modules, then walking up to the monorepo root. Avoids `npm`/`npx`.
 */
function findRollupBin(appDir: string): string | null {
  let dir = appDir;
  for (let i = 0; i < 6; i++) {
    const bin = path.join(dir, "node_modules", ".bin", "rollup");
    if (fs.existsSync(bin)) return bin;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Build a FynApp by invoking its local rollup binary (`rollup -c`).
 */
function buildWithRollup(appDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = findRollupBin(appDir);
    if (!bin) {
      reject(new Error("Could not find local `rollup` binary. Run `fyn install` first."));
      return;
    }
    const child = spawn(bin, ["-c"], { cwd: appDir, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`rollup exited with code ${code}`));
    });
  });
}

/**
 * Validate that a directory is a well-formed FynApp: it builds and emits the
 * federation entry + a manifest declaring name/version and the `./main` expose.
 *
 * This is the check an LLM coding agent runs to VERIFY an edit — it exercises
 * the real build and inspects the runtime contract, not just types.
 */
export async function validateFynApp(
  appDir: string,
  options: { build?: boolean } = {},
): Promise<ValidateResult> {
  const { build = true } = options;
  const errors: string[] = [];
  const warnings: string[] = [];

  const pkgPath = path.join(appDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, errors: [`No package.json in ${appDir} — not a FynApp.`], warnings };
  }

  if (build) {
    try {
      await buildWithRollup(appDir);
    } catch (e: any) {
      return { ok: false, errors: [`Build failed: ${e.message}`], warnings };
    }
  }

  const distDir = path.join(appDir, "dist");
  const entryPath = path.join(distDir, fynappEntryFilename);
  const manifestPath = path.join(distDir, "fynapp.manifest.json");

  if (!fs.existsSync(entryPath)) {
    errors.push(`Missing federation entry: dist/${fynappEntryFilename}`);
  }

  if (!fs.existsSync(manifestPath)) {
    errors.push("Missing dist/fynapp.manifest.json");
  } else {
    let manifest: any;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (e: any) {
      errors.push(`dist/fynapp.manifest.json does not parse: ${e.message}`);
    }
    if (manifest) {
      if (!manifest.name) errors.push("manifest is missing `name`");
      if (!manifest.version) errors.push("manifest is missing `version`");
      if (!manifest.exposes || !manifest.exposes["./main"]) {
        errors.push('manifest.exposes is missing the required "./main" module');
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Run validation and print a human-readable report. Returns the result.
 */
export async function runValidation(
  appDir: string,
  options: { build?: boolean } = {},
): Promise<ValidateResult> {
  const name = path.basename(appDir);
  console.log(`\n🔎 Validating FynApp: ${name}`);
  const result = await validateFynApp(appDir, options);

  for (const w of result.warnings) console.warn(`  ⚠️  ${w}`);
  if (result.ok) {
    console.log(`  ✅ ${name} is a valid FynApp (entry + manifest + ./main expose present).`);
  } else {
    console.error(`  ❌ ${name} failed validation:`);
    for (const e of result.errors) console.error(`     - ${e}`);
  }
  return result;
}
