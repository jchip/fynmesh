import { nodeResolve } from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";

import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappEntryFilename,
  setupMinifyPlugins,
  setupFederationPlugins,
  setupReactAliasPlugins,
  fynmeshShareScope,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

// Modeled on demo/fynapp-ag-grid-lib: a shared React-using library provider.
// fynops-ui-kit's own "react" imports are left untouched by tsc, so they are
// still literally "react" here. They must bind to the shared React 19
// (fynapp-react-lib / esm-react), not a bundled copy, or two React copies
// load and React throws error #525 / "invalid hook call".
export default [
  defineConfig({
    input: ["src/index.ts", fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    external: ["esm-react"],
    plugins: [
      newRollupPlugin(nodeResolve)({
        extensions: [".js", ".jsx", ".ts", ".tsx"],
        mainFields: ["module", "main"],
        preferBuiltins: false,
        browser: true,
        exportConditions: [env, "default"],
      }),
      newRollupPlugin(replace)({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      // fynops-ui-kit's dist code imports plain "react"; alias it to the
      // shared esm-react before federation binds it (see comment above).
      ...setupReactAliasPlugins(),
      ...setupTypeScriptPlugins(),
      ...setupFederationPlugins({
        name: "fynops-ui",
        shareScope: fynmeshShareScope,
        exposes: {},
        shared: {
          // Consumed, not provided: fapp-react-lib provides esm-react.
          "esm-react": {
            import: false,
            singleton: false,
            semver: "^19.0.0",
          },
          "fynops-ui-kit": {
            singleton: true,
            semver: "^1.0.0",
            requiredVersion: {
              "esm-react": "^19.0.0",
            },
          },
        },
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
