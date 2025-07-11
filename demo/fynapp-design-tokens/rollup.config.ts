import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import federation from "rollup-plugin-federation";
import {
    env,
    fynappDummyEntryName,
    fynappEntryFilename,
    fynmeshShareScope,
    setupDummyEntryPlugins,
    setupMinifyPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: [
        {
            dir: "dist",
            format: "system",
            sourcemap: true,
        },
    ],
    plugins: [
        ...setupDummyEntryPlugins(),
        newRollupPlugin(resolve)({
            exportConditions: [env],
        }),
        newRollupPlugin(federation)({
            name: "fynapp-design-tokens",
            filename: fynappEntryFilename,
            shareScope: fynmeshShareScope,
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
