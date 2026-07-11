import { execFileSync, spawnSync } from "child_process";
import path from "path";
import { pathToFileURL } from "url";

export const packageDir = path.resolve(__dirname, "../..");
export const distDir = path.join(packageDir, "dist");

export function buildPackage(): void {
  const tscBin =
    process.env.CFA_TSC_BIN || path.join(packageDir, "node_modules", ".bin", "tsc");
  execFileSync(tscBin, ["--project", "tsconfig.json", "--skipLibCheck"], {
    cwd: packageDir,
    stdio: "pipe",
  });
}

export function runBuiltGenerator(config: Record<string, unknown>): void {
  const generatorUrl = pathToFileURL(path.join(distDir, "generator.js")).href;
  const script = `
    import { generateApp } from ${JSON.stringify(generatorUrl)};
    await generateApp(${JSON.stringify(config)});
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: packageDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `generator exited with ${result.status}`);
  }
}
