import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupFederationPlugins,
  setupMinifyPlugins,
  setupTypeScriptPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

/*
 * Four exposes, all of them small on purpose.
 *
 * `combineDist` only takes chunks at or below `maxModuleSize` (2 KB), needs at
 * least `minGroupSize` of them, and this app has no framework to drag a large
 * chunk in -- so every expose lands in the one combined file, which is what
 * makes the bundle observable at all. `./getInfo` is deliberately never
 * imported at runtime, so the bundle is partly loaded rather than wholly
 * loaded and a member-count that ignored module stage would read wrong.
 */
export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
        extensions: [".mjs", ".js", ".json", ".node", ".ts"],
      }),
      ...setupFederationPlugins({
        name: "fynapp-bundled",
        exposes: {
          "./main": "./src/main.ts",
          "./hello": "./src/hello.ts",
          "./banner": "./src/banner.ts",
          "./getInfo": "./src/getInfo.ts",
        },
        shared: {},
      }),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
