import { createHash } from "node:crypto";
import { rollup, type Plugin } from "rollup";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import postcssUrl from "postcss-url";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig, env } from "create-fynapp";

const WORKER_ID = "virtual:monaco-editor-worker";

/**
 * Builds monaco's editor worker as its own classic-script file and resolves
 * `virtual:monaco-editor-worker` to its url.
 *
 * The worker is bundled by a nested rollup run into one IIFE, then emitted at
 * the top of dist/ as `editor.worker-<hash>.js`. A top-level hashed name is
 * what the site's `/:pkg/dist/<stem>-*` immutable cache rule matches, and an
 * explicit fileName keeps it out of rollup's nested `assets/` default.
 *
 * The module exports `import.meta.ROLLUP_FILE_URL_<ref>`, which rollup's system
 * output turns into `new URL(file, module.meta.url)`. SystemJS sets that
 * meta url to the chunk's own url, so the worker resolves against
 * /spike-monaco/dist/ and never against the host page.
 */
function monacoWorker(): Plugin {
  return {
    name: "monaco-worker",
    resolveId(id) {
      return id === WORKER_ID ? `\0${WORKER_ID}` : null;
    },
    async load(id) {
      if (id !== `\0${WORKER_ID}`) return null;
      const bundle = await rollup({
        input: "monaco-editor/editor/editor.worker.js",
        plugins: [nodeResolve()],
        onwarn: (warning, warn) => warning.code !== "CIRCULAR_DEPENDENCY" && warn(warning),
      });
      const { output } = await bundle.generate({
        format: "iife",
        name: "monacoEditorWorker",
        inlineDynamicImports: true,
        plugins: env === "production" ? [terser()] : [],
      });
      await bundle.close();
      const code = output[0].code;
      const hash = createHash("sha256").update(code).digest("hex").slice(0, 8);
      const ref = this.emitFile({ type: "asset", fileName: `editor.worker-${hash}.js`, source: code });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}

export default createFynAppRollupConfig({
  name: "spike-monaco",
  framework: "vanilla",
  typescript: true,
  exposes: {
    "./main": "./src/main.ts",
  },
  extraPlugins: [
    monacoWorker(),
    // Monaco's modules import their own CSS. codicon.css points at
    // codicon.ttf with a relative url, which would resolve against the host
    // page once injected, so it is inlined as a data url instead.
    newRollupPlugin(postcss)({
      inject: true,
      extract: false,
      plugins: [postcssUrl({ url: "inline" })],
    }),
  ],
});
