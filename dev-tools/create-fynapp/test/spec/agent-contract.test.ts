// @ts-nocheck -- this worktree intentionally reuses dependencies from the source checkout.
import fs from "fs";

describe("agent contract", () => {
  const contract = fs.readFileSync("agent/CONTRACT.md", "utf8");
  const migration = fs.readFileSync("agent/MIGRATION.md", "utf8");
  const anchor = fs.readFileSync("src/fynapp-contract.ts", "utf8");

  it("documents the current runtime and lifecycle surface", () => {
    expect(contract).toContain("bus?: FynBus");
    expect(contract).toContain("suspend?(runtime: FynUnitRuntime)");
    expect(contract).toContain("resume?(runtime: FynUnitRuntime)");
    expect(contract).not.toContain("contains **only** `fynApp` and `middlewareContext`");
  });

  it("anchors selected members without overstating additive drift coverage", () => {
    expect(anchor).toContain('Pick<FynUnitRuntime, "fynApp" | "middlewareContext" | "bus">');
    expect(anchor).toContain('Pick<FynUnit, "initialize" | "execute" | "shutdown" | "suspend" | "resume">');
    expect(migration).toContain("does not detect newly added members");
  });
});
