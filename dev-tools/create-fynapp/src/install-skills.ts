import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the skills bundled in this package.
 * (dist/install-skills.js → ../skills)
 */
function packageSkillsDir(): string {
  return path.resolve(__dirname, "..", "skills");
}

/**
 * Copy the Claude Code skills bundled with create-fynapp into a project's
 * `.claude/skills/` directory. Opt-in: a consumer of the released package runs
 * `cfa install-skills` to make `/fynapp-modify` and `/fynapp-migrate-kernel`
 * available in their own repo. These are never force-committed by this package.
 *
 * @param targetDir project root to install into (default: cwd)
 * @param options.force overwrite an existing skill of the same name
 * @returns the names of the skills installed
 */
export function installSkills(
  targetDir: string = process.cwd(),
  options: { force?: boolean } = {},
): string[] {
  const src = packageSkillsDir();
  if (!fs.existsSync(src)) {
    throw new Error(`Bundled skills not found at ${src}`);
  }

  const destRoot = path.join(targetDir, ".claude", "skills");
  fs.mkdirSync(destRoot, { recursive: true });

  const installed: string[] = [];
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    if (!fs.statSync(from).isDirectory()) continue;
    const to = path.join(destRoot, name);
    if (fs.existsSync(to) && !options.force) {
      console.warn(`  ⚠️  skipped ${name} (already exists; use --force to overwrite)`);
      continue;
    }
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    installed.push(name);
  }
  return installed;
}

/**
 * Install skills and print a report.
 */
export function runInstallSkills(
  targetDir: string = process.cwd(),
  options: { force?: boolean } = {},
): void {
  const installed = installSkills(targetDir, options);
  const dest = path.join(targetDir, ".claude", "skills");
  if (installed.length === 0) {
    console.log("No skills installed (all already present — use --force to overwrite).");
  } else {
    console.log(`✅ Installed ${installed.length} skill(s) into ${dest}:`);
    for (const s of installed) console.log(`   - /${s}`);
    console.log("Restart Claude Code in this project to pick them up.");
  }
}
