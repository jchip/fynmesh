interface ParsedCommand {
  jsonMeta: {
    opts: Record<string, unknown>;
  };
}

export function getCommandOptions(
  command: ParsedCommand,
  commands: ParsedCommand[] = [command],
): Record<string, any> {
  return Object.assign({}, ...commands.map((item) => item.jsonMeta.opts));
}
