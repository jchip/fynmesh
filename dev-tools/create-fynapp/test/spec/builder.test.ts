import { buildFynApp } from "../../src/builder";
import { runFynCommand } from "../../src/run-fyn";

jest.mock("../../src/run-fyn", () => ({ runFynCommand: jest.fn() }));

describe("buildFynApp", () => {
  beforeEach(() => {
    (runFynCommand as jest.Mock).mockResolvedValue(undefined);
  });

  it("runs the app build through fyn with production environment", async () => {
    await buildFynApp("/app");

    expect(runFynCommand).toHaveBeenCalledWith("/app", ["run", "build"], {
      NODE_ENV: "production",
    });
  });

  it("streams the app dev watcher through fyn", async () => {
    await buildFynApp("/app", { watch: true, minify: false });

    expect(runFynCommand).toHaveBeenCalledWith("/app", ["run", "dev"], {
      NODE_ENV: "development",
    });
  });
});
