import fs from "node:fs";
import path from "node:path";

const packageDir = path.resolve(__dirname, "../..");

describe("published package artifact", () => {
  it("does not include development examples", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.files).not.toContain("examples");
  });

  it("includes only the supported framework templates", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.files).toContain("templates/react");
    expect(pkg.files).not.toContain("templates");
  });

  it("does not make generated apps depend on repository demo packages", () => {
    const templateDir = path.join(packageDir, "templates/react");
    const templatePkg = JSON.parse(
      fs.readFileSync(path.join(templateDir, "package.json.template"), "utf-8")
    );
    const mainTemplate = fs.readFileSync(path.join(templateDir, "src/main.ts.template"), "utf-8");

    expect(templatePkg.devDependencies).not.toHaveProperty("fynapp-shell-mw");
    expect(mainTemplate).not.toContain('from "fynapp-shell-mw/');
  });
});
