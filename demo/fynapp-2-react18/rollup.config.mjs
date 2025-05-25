import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import virtual from "@rollup/plugin-virtual";
import noEmit from "rollup-plugin-no-emit";

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

/**
 * Rollup needs at least one entry to get the build started.  We use a virtual entry
 * to satisfy this requirement.  The dummy entry is not used.
 */
const fynappDummyEntryName = "fynapp-dummy-entry";
/**
 * The filename of the entry point for the fynapp's module federation bundle.
 * This is the file that will be used by the fynmesh to load the fynapp.
 */
const fynappEntryFilename = "fynapp-entry.js";
/**
 * The module federation share scope for the fynmesh.  This is the scope that will be used to share
 * modules between the fynmesh and the fynapps.
 */
const fynmeshShareScope = "fynmesh";

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
      virtual({
        [fynappDummyEntryName]: "// fynapp dummy entry\nconsole.log('fynapp dummy entry');",
      }),
      noEmit({
        match: (fileName) => fileName.includes(fynappDummyEntryName),
      }),
      resolve({
        exportConditions: [env],
      }),
      // commonjs({ transformMixedEsModules: true }),
      federation({
        name: "fynapp-2-react18",
        shareScope: fynmeshShareScope,
        // this filename must be in the input config array
        filename: fynappEntryFilename,
        exposes: {
          "./main": "./src/main.ts",
        },
        shared: {
          "esm-react": {
            singleton: true,
            requiredVersion: "^18.0.0",
          },
          "esm-react-dom": {
            singleton: true,
            requiredVersion: "^18.0.0",
          },
        },
      }),
      alias({
        entries: [
          { find: "react", replacement: "esm-react" },
          { find: "react-dom/client", replacement: "esm-react-dom" },
          { find: "react-dom", replacement: "esm-react-dom" },
        ],
      }),
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      isProduction ? terser() : null,
    ].filter(Boolean),
  },
];
