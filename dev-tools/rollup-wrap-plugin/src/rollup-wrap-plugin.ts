/**
 * Plugin wrapper system for rollup configs
 *
 * This module provides a generic plugin wrapper that preserves plugin configuration
 * metadata while maintaining the exact same user syntax and full type safety.
 */

/**
 * Symbol used to store metadata on plugin instances
 * Using a symbol ensures no conflicts with plugin properties
 */
export const ROLLUP_WRAP_PLUGIN_META = Symbol("rollup.wrap.plugin.meta");

/**
 * Metadata stored on each wrapped plugin instance
 */
export interface PluginMetadata {
  /** Unique identifier for this plugin instance */
  id: string;
  /** All arguments passed to the plugin constructor */
  args: any[];
  /** First argument (typically the config object) */
  config: any;
  /** Name of the plugin (from plugin.name property) */
  pluginName: string;
  /** Timestamp when plugin was created */
  created: number;
}

/**
 * Safe cloning function that handles functions and non-cloneable values
 */
function safeClone(obj: any): any {
  try {
    return structuredClone(obj);
  } catch {
    // If structuredClone fails (e.g., due to functions), return original
    return obj;
  }
}

/**
 * Generic plugin wrapper function
 *
 * Wraps any plugin constructor to preserve configuration metadata while
 * maintaining the exact same syntax and full type safety.
 *
 * @example
 * ```typescript
 * const wrappedFederation = newRollupPlugin(federation);
 *
 * // Usage remains exactly the same
 * const federationPlugin = wrappedFederation({
 *   name: "my-app",
 *   exposes: { "./App": "./src/App.tsx" }
 * });
 *
 * // But now you can access the original config
 * const meta = getPluginMeta(federationPlugin);
 * console.log(meta?.config.name); // "my-app"
 * ```
 */
export function newRollupPlugin<T extends (...args: any[]) => any>(
  pluginConstructor: T
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args: Parameters<T>): ReturnType<T> => {
    // Call the original plugin constructor
    const pluginInstance = pluginConstructor(...args);

    // Generate unique ID for this plugin instance
    const pluginName = pluginInstance?.name || "unknown";
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const id = `${pluginName}_${timestamp}_${randomSuffix}`;

    // Store metadata using symbol key
    const metadata: PluginMetadata = {
      id,
      args: args.map(safeClone), // Deep clone all arguments
      config: safeClone(args[0]), // Convenience property for first argument
      pluginName,
      created: timestamp,
    };

    // Attach metadata to plugin instance
    pluginInstance[ROLLUP_WRAP_PLUGIN_META] = metadata;

    return pluginInstance;
  };
}

export default newRollupPlugin;

/**
 * Extract metadata from a wrapped plugin instance
 *
 * @param pluginInstance - Plugin instance created by wrapped constructor
 * @returns Plugin metadata or undefined if not a wrapped plugin
 */
export function getPluginMeta(pluginInstance: any): PluginMetadata | undefined {
  return pluginInstance?.[ROLLUP_WRAP_PLUGIN_META];
}
