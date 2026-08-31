vi.mock("inquirer", () => ({
  __esModule: true,
  default: {
    prompt: vi.fn().mockResolvedValue({ components: [] }),
  },
}));

import inquirer from "inquirer";
import { promptForMissingInfo } from "../../src/prompts";

describe("create prompts", () => {
  it("does not prompt when all creation values are supplied", async () => {
    const config = await promptForMissingInfo({
      name: "test-app",
      framework: "react",
      dir: "test-app",
      "skip-install": true,
    });

    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(config).toEqual({
      name: "test-app",
      framework: "react",
      dir: "test-app",
      skipInstall: true,
    });
    expect(config).not.toHaveProperty("components");
  });
});
