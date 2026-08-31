// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../../src/index", () => ({ fynappEntryFilename: "fynapp-entry.js" }));

import { checkFynApp } from "../../src/check-fynapp";

describe("checkFynApp", () => {
  it("accepts an existing entry and manifest without rebuilding", async () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfa-check-"));
    fs.writeFileSync(path.join(appDir, "package.json"), '{"name":"example","version":"1.0.0"}');
    fs.mkdirSync(path.join(appDir, "dist"));
    fs.writeFileSync(path.join(appDir, "dist/fynapp-entry.js"), "export {};");
    fs.writeFileSync(
      path.join(appDir, "dist/fynapp.manifest.json"),
      '{"name":"example","version":"1.0.0","exposes":{"./main":"./src/main.ts"}}',
    );

    try {
      await expect(checkFynApp(appDir, { build: false })).resolves.toMatchObject({ ok: true });
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
  });

  it("uses neutral terminology across the public check surface", () => {
    const publicFiles = [
      "src/check-fynapp.ts",
      "src/cfa.ts",
      "src/index.ts",
      "agent/CONTRACT.md",
      "agent/GUIDE.md",
      "agent/MIGRATION.md",
      "skills/fynapp-modify/SKILL.md",
      "skills/fynapp-migrate-kernel/SKILL.md",
      "../../notes/FYNAPP-HOWTO.md",
    ];
    const publicSurface = publicFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

    expect(publicSurface).not.toMatch(/cfa validate|validateFynApp|runValidation|ValidateResult|validate-fynapp/i);
    expect(publicSurface).not.toMatch(/\bverif(?:y|ies|ied|ication)\b/i);
    expect(fs.existsSync("src/validate-fynapp.ts")).toBe(false);
  });
});
