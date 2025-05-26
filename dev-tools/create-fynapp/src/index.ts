// Export plugin wrapper utilities
export { newRollupPlugin, getPluginMeta, FYNMESH_META } from "./rollup-plugin-wrapper.js";

// Export core functionality for programmatic use
export { generateApp } from "./generator.js";
export { promptForMissingInfo } from "./prompts.js";
export { ConfigManager } from "./config.js";
export { fileExists } from "./utils.js";
export { buildFynApp } from "./builder.js";
export { updateDependencies } from "./updater.js";

// Export configuration types and utilities
export type { FynAppConfigOptions } from "./config-ast.js";
export { RollupConfigManager } from "./config-ast.js";
