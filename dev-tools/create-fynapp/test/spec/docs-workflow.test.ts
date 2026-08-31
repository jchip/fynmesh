// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";
import { supportedFrameworks } from "../../src/frameworks";

describe("documented workflows", () => {
  const read = (file: string) => fs.readFileSync(file, "utf8");

  it("documents only the release CLI and fyn package workflows", () => {
    const readme = read("README.md");

    expect(readme).toContain("fyn global add create-fynapp");
    expect(readme).toContain("create-fynapp --name my-app --framework react");
    expect(readme).toContain("cfa build");
    expect(readme).toContain("cfa check");
    expect(readme).toContain("cfa install-skills");
    expect(readme).not.toMatch(/\bnpm\b|\bnpx\b/);
    expect(readme).not.toMatch(/cfa update|cfa config|~\/.fynmesh|AST Config Manager|test-utils/);
  });

  // The guide's option line has to list exactly what the allowlist scaffolds.
  // Advertising a framework with no template is the gap FYM-270 closed for vue,
  // and the rest of the union in rollup-config-factory.ts is still unscaffolded.
  it("documents exactly the frameworks the CLI scaffolds, and uses local tool runners", () => {
    const guide = read("agent/GUIDE.md");
    const migration = read("agent/MIGRATION.md");
    const unscaffolded = ["react18", "preact", "solid", "marko", "svelte", "vanilla"].filter(
      (framework) => !supportedFrameworks.includes(framework as any),
    );

    expect(guide).toContain(`--framework/-f (${supportedFrameworks.join(" | ")})`);
    for (const framework of unscaffolded) {
      expect(guide).not.toContain(`--framework ${framework}`);
    }
    expect(migration).toContain("nvx tsc --build tsconfig.lib.json");
    expect(migration).not.toContain("node_modules/.bin/");
  });
});
