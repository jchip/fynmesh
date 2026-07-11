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
});
