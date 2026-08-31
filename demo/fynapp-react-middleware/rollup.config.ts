import resolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
  setupReactFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      ...setupReactFederationPlugins({
        debugging: true,
        name: "fynapp-react-middleware",
        exposes: {
          "./middleware/react-context": "./src/middleware/react-context.tsx",
          "./hooks/useSharedCounter": "./src/hooks/useSharedCounter.ts",
        },
        shared: {},
        entry: {
          header: `
console.log('fynapp-react-middleware entry header');
`,
          footer: `
console.log('fynapp-react-middleware entry footer');
`,
        },
      }),
      ...setupReactAliasPlugins(),
      newRollupPlugin(esbuild)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
