import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf-8"));

describe("published package artifact", () => {
  it("installs dependencies referenced by public declarations", () => {
    expect(pkg.dependencies["federation-js"]).toBe("^1.0.0");
    expect(pkg.devDependencies["federation-js"]).toBeUndefined();
  });

  it("does not advertise CommonJS without a CommonJS artifact", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.exports["."]).not.toHaveProperty("require");
  });
});
