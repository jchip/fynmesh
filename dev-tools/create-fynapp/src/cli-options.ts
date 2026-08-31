interface ParsedCommand {
  jsonMeta: {
    opts: Record<string, unknown>;
  };
  cmdChain: ParsedCommand[];
}

/**
 * Merge a command's own options with those of its ancestors, nearest last.
 *
 * `jsonMeta.opts` only carries the options parsed on that one node, so top-level
 * options shared into a sub-command still have to be collected from the chain.
 * `cmdChain` is the root-to-command node list that `exec` handlers used to be
 * handed directly, before the second `exec` argument became the parse result.
 */
export function getCommandOptions(command: ParsedCommand): Record<string, any> {
  return Object.assign({}, ...command.cmdChain.map((item) => item.jsonMeta.opts));
}
