import { NixClap } from "@fynjs/cli-args";
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
          exec: (command) => {
            received = getCommandOptions(command);
          },
        },
      },
    );

    await cli.parseAsync(["--name", "test-app", "--skip-install"], 0);

    expect(received).toMatchObject({ name: "test-app", "skip-install": true });
  });

  // cli-args pre-scans raw argv to decide whether to insert the default
  // command, and 1.0.0 read every option's separated value as a command
  // argument -- so a second `--opt value` pair suppressed `create` entirely and
  // the bin died with "No command given" (FYM-256 / upstream FJM-137). The
  // `--name=x` and bare-flag forms never broke, so cover the separated form.
  it("still runs the default command when options carry separated values", async () => {
    let received: Record<string, unknown> | undefined;
    const cli = new NixClap({ defaultCommand: "create" });
    cli.init(
      {
        name: { args: "< string>" },
        framework: { args: "< string>" },
      },
      {
        create: {
          exec: (command) => {
            received = getCommandOptions(command);
          },
        },
      },
    );

    await cli.parseAsync(["--name", "vue-app", "--framework", "vue"], 0);

    expect(received).toMatchObject({ name: "vue-app", framework: "vue" });
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
          exec: (command) => {
            received = getCommandOptions(command);
          },
        },
      },
    );

    await cli.parseAsync(["validate", "--no-build"], 0);

    expect(received?.build).toBe(false);
  });
});
