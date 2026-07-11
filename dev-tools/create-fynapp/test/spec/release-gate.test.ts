import fs from "node:fs";
import path from "node:path";

const packageDir = path.resolve(__dirname, "../..");

describe("release gate configuration", () => {
  it("loads tasks without the incompatible local TypeScript loader", () => {
    expect(fs.existsSync(path.join(packageDir, "xrun-tasks.ts"))).toBe(false);
  });

  it("enables ESLint in the prepublish check", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg["@xarc/module-dev"].features).toContain("eslint");
    expect(pkg.scripts.prepublishOnly).toContain("xarc/check");
    expect(fs.existsSync(path.join(packageDir, ".eslintrc.cjs"))).toBe(true);
  });
});
