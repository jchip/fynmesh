import fs from "node:fs";
import path from "node:path";
import { supportedFrameworks } from "../../src/frameworks";

const packageDir = path.resolve(__dirname, "../..");

describe("published package artifact", () => {
  it("does not include development examples", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.files).not.toContain("examples");
  });

  // templates/ is listed per framework rather than wholesale, so an incomplete
  // template in the working tree can never reach the tarball.
  it("includes only the supported framework templates", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    for (const framework of supportedFrameworks) {
      expect(pkg.files).toContain(`templates/${framework}`);
    }
    expect(pkg.files).not.toContain("templates");
  });

  // The demo packages (fynapp-shell-mw, the esm-* React adapters) only resolve
  // inside this monorepo, so a scaffolded app that depends on one installs
  // nowhere else. Holds for every framework we scaffold.
  it.each([...supportedFrameworks])(
    "does not make generated %s apps depend on repository demo packages",
    (framework) => {
      const templateDir = path.join(packageDir, "templates", framework);
      const templatePkg = JSON.parse(
        fs.readFileSync(path.join(templateDir, "package.json.template"), "utf-8")
      );
      const mainTemplate = fs.readFileSync(path.join(templateDir, "src/main.ts.template"), "utf-8");

      expect(templatePkg.devDependencies).not.toHaveProperty("fynapp-shell-mw");
      expect(templatePkg.devDependencies).not.toHaveProperty("esm-react");
      expect(templatePkg.devDependencies).not.toHaveProperty("esm-react-dom");
      expect(mainTemplate).not.toContain('from "fynapp-shell-mw/');
    }
  );

  it("pins the framework runtime each template scaffolds against", () => {
    const readTemplatePkg = (framework: string) =>
      JSON.parse(
        fs.readFileSync(
          path.join(packageDir, "templates", framework, "package.json.template"),
          "utf-8"
        )
      );

    const react = readTemplatePkg("react");
    expect(react.devDependencies.react).toBe("^19.1.0");
    expect(react.devDependencies["react-dom"]).toBe("^19.1.0");

    const vue = readTemplatePkg("vue");
    expect(vue.devDependencies.vue).toBe("^3.3.4");
  });

  it("does not link packaged guidance to excluded examples", () => {
    const guidance = [
      "README.md",
      "agent/GUIDE.md",
      "agent/MIGRATION.md",
      "skills/fynapp-modify/SKILL.md",
      "skills/fynapp-migrate-kernel/SKILL.md",
    ].map((file) => fs.readFileSync(path.join(packageDir, file), "utf-8"));

    for (const content of guidance) {
      expect(content).not.toMatch(
        /node_modules\/create-fynapp\/examples|\]\(\.\.?\/examples\/?(?:README\.md)?\)/
      );
    }
  });
});
