import { NixClap } from "nix-clap";
import { getCommandOptions } from "../../src/cli-options";

describe("NixClap option delivery", () => {
  it("merges root options into the default create command", async () => {
    let received: Record<string, unknown> | undefined;
    const cli = new NixClap({ defaultCommand: "create" });
    cli.init(
      {
        name: { args: "< string>" },
        "skip-install": { argDefault: "false" },
      },
      {
        create: {
          exec: (command, commands) => {
            received = getCommandOptions(command, commands);
          },
        },
      },
    );

    await cli.parseAsync(["--name", "test-app", "--skip-install"], 0);

    expect(received).toMatchObject({ name: "test-app", "skip-install": true });
  });

  it("parses --no-build as build false", async () => {
    let received: Record<string, unknown> | undefined;
    const cli = new NixClap();
    cli.init(
      {},
      {
        validate: {
          options: {
            build: { argDefault: "true" },
          },
          exec: (command, commands) => {
            received = getCommandOptions(command, commands);
          },
        },
      },
    );

    await cli.parseAsync(["validate", "--no-build"], 0);

    expect(received?.build).toBe(false);
  });
});
