import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Plugin } from "rollup";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig } from "create-fynapp";

const require = createRequire(import.meta.url);

/**
 * `import workerUrl from "pdf-worker-url"` gives the absolute URL of pdf.js's
 * worker inside this app's dist.
 *
 * The worker is copied verbatim: it is a self-contained ES module worker, and
 * pdf.js starts it with `new Worker(url, { type: "module" })`. It must not go
 * through the SystemJS build. The file name is set here, not by rollup's
 * `assetFileNames`, so it lands at the top of dist/ (the site cache rules only
 * match `/:pkg/dist/<stem>-*`).
 *
 * `import.meta.ROLLUP_FILE_URL_*` becomes `new URL(file, module.meta.url)` in
 * SystemJS output, so the URL is relative to the chunk that asks, not the page.
 */
function pdfWorkerUrl(): Plugin {
  const id = "\0pdf-worker-url";
  return {
    name: "pdf-worker-url",
    resolveId: (source) => (source === "pdf-worker-url" ? id : null),
    load(loadId) {
      if (loadId !== id) return null;
      const source = readFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
      const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
      const ref = this.emitFile({ type: "asset", fileName: `pdf-worker-${hash}.mjs`, source });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}

export default createFynAppRollupConfig({
  name: "spike-pdf",
  framework: "vanilla",
  typescript: true,
  // Only "react"/"react18" auto-expose "./main"; every other framework has to
  // list it here (CONTRACT.md §3).
  exposes: {
    "./main": "./src/main.ts",
  },
  extraPlugins: [
    pdfWorkerUrl(),
    // pdf-lib imports pako, which only ships CommonJS, and its standard
    // fonts are .json modules.
    newRollupPlugin(commonjs)(),
    newRollupPlugin(json)(),
    newRollupPlugin(postcss)({ inject: true, extract: false }),
  ],
});
