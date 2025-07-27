import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
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
        external: [],
        plugins: [
            ...setupDummyEntryPlugins(),
            newRollupPlugin(resolve)({
                exportConditions: [env],
            }),
            ...setupReactFederationPlugins({
                debugging: true,
                name: "fynapp-shell-mw",
                exposes: {
                    "./middleware/shell-layout": "./src/middleware/shell-layout.ts",
                    "./main": "./src/main.tsx",
                },
                shared: {},
                entry: {
                    header: `
console.log('fynapp-shell-mw entry header');
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
