// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";
import path from "path";

describe("published examples", () => {
  it("declares the middleware provider used by the consumer", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve("examples/middleware-consumer/package.json"), "utf8"),
    );

    expect(packageJson.dependencies?.["fynapp-design-tokens"]).toBe("^1.0.0");
  });
});
