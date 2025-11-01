import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
  setupReactFederationPlugins,
} from "create-fynapp";

export default [
  {
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      postcss({
        inject: true,
        extract: false,
      }),
      // commonjs({ transformMixedEsModules: true }),
      ...setupReactFederationPlugins({
        debugging: true,
        name: "fynapp-1",
        exposes: {
          "./hello": "./src/hello.ts",
          "./getInfo": "./src/getInfo.ts",
          "./App": "./src/App.tsx",
          "./component": "./src/component.ts",
        },
        shared: {},
        entry: {
          header: `
console.log('fynapp-1 entry header');
`,
          footer: `
console.log('fynapp-1 entry footer');
`,
        },
      }),
      ...setupReactAliasPlugins(),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupMinifyPlugins(),
    ],
  },
];
