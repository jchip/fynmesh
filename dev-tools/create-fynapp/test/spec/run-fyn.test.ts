import type { Mock } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { runFynCommand } from "../../src/run-fyn";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

describe("runFynCommand", () => {
  it("spawns fyn with inherited stdio and the supplied environment", async () => {
    const child = new EventEmitter();
    (spawn as Mock).mockReturnValue(child);

    const result = runFynCommand("/app", ["run", "build"], { NODE_ENV: "production" });
    child.emit("close", 0);

    await expect(result).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledWith("fyn", ["run", "build"], {
      cwd: "/app",
      env: expect.objectContaining({ NODE_ENV: "production" }),
      stdio: "inherit",
    });
  });

  it("rejects a nonzero fyn exit", async () => {
    const child = new EventEmitter();
    (spawn as Mock).mockReturnValue(child);

    const result = runFynCommand("/app", ["install"]);
    child.emit("close", 2);

    await expect(result).rejects.toThrow("fyn install exited with code 2");
  });
});
