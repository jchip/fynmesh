// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";

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

  it("limits scaffolding to React and uses local tool runners", () => {
    const guide = read("agent/GUIDE.md");
    const migration = read("agent/MIGRATION.md");

    expect(guide).toContain("--framework/-f (react)");
    expect(guide).not.toContain("react|vue|preact|solid|marko");
    expect(migration).toContain("nvx tsc --build tsconfig.lib.json");
    expect(migration).not.toContain("node_modules/.bin/");
  });
});
