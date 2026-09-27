import postcss from "rollup-plugin-postcss";
import { rollup, type Plugin } from "rollup";
import { createRequire } from "node:module";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig } from "create-fynapp";

const require = createRequire(import.meta.url);

/**
 * Bundles maplibre-gl's module worker into one native ES module emitted next
 * to this FynApp's own chunks, and hands the app `import.meta.ROLLUP_FILE_URL_*` so the
 * worker resolves against the chunk's own url (never the page's).
 */
function maplibreWorker(): Plugin {
  const id = "\0maplibre-worker-url";
  return {
    name: "maplibre-worker",
    resolveId: (source) => (source === "maplibre-worker-url" ? id : null),
    async load(loadId) {
      if (loadId !== id) return null;
      const input = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
      const bundle = await rollup({ input });
      const { output } = await bundle.generate({ format: "es" });
      await bundle.close();
      const ref = this.emitFile({
        type: "asset",
        // .js, not .mjs: maplibre still starts it as a module worker (only
        // .cjs means classic), and the site's immutable cache rule only
        // matches hashed `<stem>-<hash>.js` files.
        name: "maplibre-gl-worker.js",
        source: output[0].code,
      });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}

const configs = createFynAppRollupConfig({
  name: "ops-map",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  // Consumed with import: false, never bundled here. The kernel resolves them
  // from the fynops-data / fynops-ui provider FynApps at runtime, found
  // through this package's own dependencies.
  shared: {
    "fynops-data-core": { import: false, singleton: true, semver: "^1.0.0" },
    "fynops-ui-kit": { import: false, singleton: true, semver: "^1.0.0" },
  },
  extraPlugins: [
    maplibreWorker(),
    newRollupPlugin(postcss)({ inject: true, extract: false }),
  ],
});

// Assets default to dist/assets/; the site cache rules only cover top-level
// hashed files (`/:pkg/dist/<stem>-*`), so keep them at the top.
for (const config of configs) {
  (config.output as any).assetFileNames = "[name]-[hash][extname]";
}

export default configs;
