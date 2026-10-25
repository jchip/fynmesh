import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import { newRollupPlugin } from "rollup-wrap-plugin";
import federation from "rollup-plugin-federation";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  fynmeshShareScope,
  setupDummyEntryPlugins,
  setupMinifyPlugins,
  setupTypeScriptPlugins,
  createEnrichManifest,
  createEmitFederationMeta,
} from "create-fynapp";
import { defineConfig } from "rollup";

// amd-bridge.json is the one place that says which libs and versions legacy AMD code gets.
type Mapping = {
  provider: { name: string; semver: string };
  modules: Record<string, { share: string; semver: string }>;
};
// AMD_BRIDGE=<variant> builds amd-bridge.<variant>.json into dist-<variant>/ (the demo's version switch).
const variant = process.env.AMD_BRIDGE;
const mappingFile = variant ? `amd-bridge.${variant}.json` : "amd-bridge.json";
const outDir = variant ? `dist-${variant}` : "dist";
const mapping: Mapping = JSON.parse(readFileSync(mappingFile, "utf-8"));

// One expose per AMD id, `./amd/<id>`, so each lib loads only when legacy code asks for it.
const genDir = "src/amd-gen";
rmSync(genDir, { recursive: true, force: true });
mkdirSync(genDir, { recursive: true });
const exposes: Record<string, string> = {};
Object.entries(mapping.modules).forEach(([id, m], i) => {
  const file = `${genDir}/m${i}.ts`;
  writeFileSync(
    file,
    `// generated from ${mappingFile}: AMD id ${JSON.stringify(id)}\n` +
      `// @ts-ignore\nimport * as ns from ${JSON.stringify(m.share)};\nexport { ns };\n`,
  );
  exposes[`./amd/${id}`] = `./${file}`;
});

const shared = Object.fromEntries(
  Object.values(mapping.modules).map((m) => [m.share, { import: false, singleton: false, semver: m.semver }]),
);

// The provider comes from the mapping, not from package.json devDependencies.
const enrich = createEnrichManifest();
const enrichManifest = async (...args: Parameters<typeof enrich>) => {
  const manifest = await enrich(...args);
  manifest["shared-providers"] = {
    [mapping.provider.name]: { semver: mapping.provider.semver, provides: Object.keys(shared) },
  };
  return manifest;
};

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    output: { ...setupFynAppOutputConfig().output, dir: outDir },
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      newRollupPlugin(federation)({
        name: "fynapp-amd-bridge",
        shareScope: fynmeshShareScope,
        filename: fynappEntryFilename,
        exposes,
        shared,
        enrichManifest,
        emitFederationMeta: createEmitFederationMeta(),
      }),
      ...setupTypeScriptPlugins(),
      ...setupMinifyPlugins(),
    ],
  }),
];
