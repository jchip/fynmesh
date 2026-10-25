import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import federation from "rollup-plugin-federation";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  fynmeshShareScope,
  setupDummyEntryPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
  setupTypeScriptPlugins,
  createEnrichManifest,
  createEmitFederationMeta,
} from "create-fynapp";
import { defineConfig } from "rollup";

// ui-kit must use the one React the legacy page runs. UI_KIT_REACT=18 builds
// against React 18 into dist-react18/ (the demo's version switch).
const react18 = process.env.UI_KIT_REACT === "18";
const reactRange = react18 ? "^18.0.0" : "^19.0.0";

// The React provider follows the build variant, not package.json devDependencies.
const enrich = createEnrichManifest();
const enrichManifest = async (...args: Parameters<typeof enrich>) => {
  const manifest = await enrich(...args);
  manifest["shared-providers"] = {
    "fynapp-react-lib": { semver: reactRange, provides: ["esm-react"] },
  };
  return manifest;
};

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: { ...setupFynAppOutputConfig().output, dir: react18 ? "dist-react18" : "dist" },
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      newRollupPlugin(federation)({
        name: "fynapp-ui-kit",
        shareScope: fynmeshShareScope,
        filename: fynappEntryFilename,
        exposes: {},
        shared: {
          "ui-kit": { import: "./src/index.js", singleton: false, semver: "^1.4.0" },
          "esm-react": { import: false, singleton: false, semver: reactRange },
        },
        enrichManifest,
        emitFederationMeta: createEmitFederationMeta(),
      }),
      ...setupReactAliasPlugins(),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
