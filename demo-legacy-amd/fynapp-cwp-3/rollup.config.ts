import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
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

// A CWP release builds from its own package.json and cwp.json. Each CWP dir
// uses this one config, run from that dir.
const name = "fynapp-cwp";
const { version } = JSON.parse(readFileSync("package.json", "utf-8"));

// cwp.json: the legacy webpack externals, each AMD id -> the npm specifier behind
// it. A specifier may be a subpath such as `preact/hooks`.
const { externals }: { externals: Record<string, string> } = JSON.parse(readFileSync("cwp.json", "utf-8"));
const pkgOf = (spec: string) =>
  spec
    .split("/")
    .slice(0, spec.startsWith("@") ? 2 : 1)
    .join("/");
const installed = (pkg: string): string =>
  JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf-8")).version;

// Each package is a share at its installed version. The CWP provides it and
// consumes it at that exact version, so legacy code gets the tested copy. A
// subpath shares its package's share.
const shared = Object.fromEntries(
  [...new Set(Object.values(externals).map(pkgOf))].map((pkg) => [pkg, { singleton: false, semver: installed(pkg) }]),
);

// One expose per AMD id, `./amd/<id>`, so each lib loads only when legacy code asks for it.
const genDir = "src/amd-gen";
rmSync(genDir, { recursive: true, force: true });
mkdirSync(genDir, { recursive: true });
const exposes: Record<string, string> = {};
Object.entries(externals).forEach(([id, spec], i) => {
  const file = `${genDir}/m${i}.ts`;
  writeFileSync(
    file,
    `// generated from cwp.json: AMD id ${JSON.stringify(id)}\n` +
      `// @ts-ignore\nimport * as ns from ${JSON.stringify(spec)};\nexport { ns };\n`,
  );
  exposes[`./amd/${id}`] = `./${file}`;
});

// requirejs.config call the AMD add-on reads: which CWP and expose serve each AMD id.
const emitAmdMeta = {
  name: "emit-amd-meta",
  generateBundle(this: any) {
    const modules = Object.fromEntries(
      Object.entries(externals).map(([id, spec]) => [
        id,
        { fynapp: name, version, expose: `./amd/${id}`, share: pkgOf(spec), shareVersion: installed(pkgOf(spec)) },
      ]),
    );
    this.emitFile({
      type: "asset",
      fileName: "amd-meta.js",
      source:
        `// generated from cwp.json: the AMD ids ${name}@${version} serves\n` +
        `requirejs.config({ config: { fynmesh: { modules: ${JSON.stringify(modules, null, 2)} } } });\n`,
    });
  },
};

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: setupFynAppOutputConfig().output,
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        browser: true,
        exportConditions: [env, "default"],
      }),
      newRollupPlugin(replace)({
        preventAssignment: true,
        "process.env.NODE_ENV": JSON.stringify(env),
      }),
      newRollupPlugin(federation)({
        name,
        shareScope: fynmeshShareScope,
        filename: fynappEntryFilename,
        exposes,
        shared,
        enrichManifest: createEnrichManifest(),
        emitFederationMeta: createEmitFederationMeta(),
      }),
      // ui-kit's `react` import goes through the same share as the legacy widgets'.
      ...setupReactAliasPlugins(),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
      emitAmdMeta,
    ],
  }),
];
