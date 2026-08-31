// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";
import { templatedFrameworks } from "../../src/frameworks";

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

  // The guide's option line has to list exactly the frameworks that ship a
  // template, and say that the others still scaffold -- an agent that reads
  // "react | vue" as the legal set will not try the framework it actually
  // wants (FYM-273).
  it("documents every templated framework and the open-framework fallback", () => {
    const guide = read("agent/GUIDE.md");
    const readme = read("README.md");
    const migration = read("agent/MIGRATION.md");

    expect(guide).toContain(`templates:\n#            ${templatedFrameworks.join(" | ")}`);
    for (const doc of [guide, readme]) {
      expect(doc).toContain("AGENT-TODO.md");
      expect(doc).toMatch(/accepts any name|takes \*\*any\*\* framework name/);
    }
    for (const framework of templatedFrameworks) {
      expect(readme).toContain(`\`${framework}\``);
    }

    expect(migration).toContain("nvx tsc --build tsconfig.lib.json");
    expect(migration).not.toContain("node_modules/.bin/");
  });
});
