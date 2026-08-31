import fs from "node:fs";
import path from "node:path";
import { genericTemplateName, templatedFrameworks } from "../../src/frameworks";

const packageDir = path.resolve(__dirname, "../..");

describe("published package artifact", () => {
  it("does not include development examples", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    expect(pkg.files).not.toContain("examples");
  });

  // templates/ is listed per framework rather than wholesale, so an incomplete
  // template in the working tree can never reach the tarball.
  it("includes every templated framework plus the generic fallback", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"));

    for (const framework of templatedFrameworks) {
      expect(pkg.files).toContain(`templates/${framework}`);
    }
    // Without this the CLI accepts any framework and then finds no template to
    // scaffold from, in the published package only (FYM-273).
    expect(pkg.files).toContain(`templates/${genericTemplateName}`);
    expect(pkg.files).not.toContain("templates");
  });

  it("ships a generic template that carries the agent brief", () => {
    const genericDir = path.join(packageDir, "templates", genericTemplateName);

    for (const file of [
      "package.json.template",
      "rollup.config.ts.template",
      "tsconfig.json.template",
      "AGENT-TODO.md.template",
      "src/main.ts.template",
    ]) {
      expect(fs.existsSync(path.join(genericDir, file))).toBe(true);
    }
  });

  // The demo packages (fynapp-shell-mw, the esm-* React adapters) only resolve
  // inside this monorepo, so a scaffolded app that depends on one installs
  // nowhere else. Holds for every framework we scaffold.
  it.each([...templatedFrameworks])(
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

    // react18 exists to scaffold React 18 specifically, so the pin is the
    // whole point of the template.
    const react18 = readTemplatePkg("react18");
    expect(react18.devDependencies.react).toBe("^18.3.1");
    expect(react18.devDependencies["react-dom"]).toBe("^18.3.1");
    expect(react18.devDependencies["@types/react"]).toBe("^18.3.0");

    const vue = readTemplatePkg("vue");
    expect(vue.devDependencies.vue).toBe("^3.3.4");

    expect(readTemplatePkg("preact").dependencies.preact).toBe("^10.18.1");
    expect(readTemplatePkg("solid").dependencies["solid-js"]).toBe("^1.8.15");
    expect(readTemplatePkg("svelte").dependencies.svelte).toBe("^4.2.0");
    expect(readTemplatePkg("marko").dependencies.marko).toBe("^5.37.31");
    expect(readTemplatePkg("vanilla").dependencies).toEqual({});
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
