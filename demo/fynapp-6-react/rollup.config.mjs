import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";
import alias from "@rollup/plugin-alias";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
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
      postcss(),
      federation({
        name: "fynapp-6-react",
        shareScope: fynmeshShareScope,
        // this filename must be in the input config array
        filename: fynappEntryFilename,
        exposes: {
          "./main": "./src/main.ts",
        },
        shared: {
          "esm-react": {
            import: false,
            singleton: false,
            requiredVersion: "^19.0.0",
          },
          "esm-react-dom": {
            import: false,
            singleton: false,
            requiredVersion: "^19.0.0",
          },
        },
      }),
      alias({
        entries: {
          react: "esm-react",
          "react-dom/client": "esm-react-dom",
          "react-dom": "esm-react-dom",
        },
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
