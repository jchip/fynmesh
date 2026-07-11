import { spawn } from "node:child_process";

/**
 * Run fyn in a child process while streaming its output to the current terminal.
 */
export function runFynCommand(
  cwd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("fyn", args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`fyn ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}
