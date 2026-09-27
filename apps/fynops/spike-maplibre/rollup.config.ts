import postcss from "rollup-plugin-postcss";
import { rollup, type Plugin } from "rollup";
import { createRequire } from "node:module";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig } from "create-fynapp";

const require = createRequire(import.meta.url);

/**
 * maplibre-gl v6 ships as three native ES modules: the main API, a shared
 * chunk, and a module worker that imports the shared chunk. The main API is
 * bundled into this FynApp's SystemJS chunks like any dependency, but a worker
 * can't run SystemJS, so the worker is bundled on its own into one native ES
 * module file and emitted into dist/ next to our chunks.
 *
 * `import "maplibre-worker-url"` gives the app that file's URL, resolved
 * against the chunk's own URL at runtime, never the page's.
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
  name: "spike-maplibre",
  framework: "vanilla",
  typescript: true,
  exposes: {
    "./main": "./src/main.ts",
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
