import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
    env,
    setupFynAppOutputConfig,
    fynappDummyEntryName,
    fynappEntryFilename,
    setupDummyEntryPlugins,
    setupMinifyPlugins,
    setupReactFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    plugins: [
        ...setupDummyEntryPlugins(),
        newRollupPlugin(resolve)({
            exportConditions: [env],
        }),
        ...setupReactFederationPlugins({
            name: "fynapp-design-tokens",
            exposes: {
                "./middleware/design-tokens": "./src/middleware/design-tokens.ts",
            },
            shared: {
            },
            entry: {
                header: `
console.log('fynapp-design-tokens entry header');
export {config} from "./src/config.ts";
`,
            },
        }),
        newRollupPlugin(typescript)({
            tsconfig: "./tsconfig.json",
            sourceMap: true,
            inlineSources: true,
        }),
        ...setupMinifyPlugins(),

    ],
    external: [],
});
