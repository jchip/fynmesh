/**
 * Generate the ESM builds of React from the CJS builds shipped in node_modules/react.
 *
 * React's CJS bundles assign everything onto a `exports` object. We wrap that body in a
 * `defReact(exports)` factory, call it once with a fresh object, and re-export the result as
 * ESM. That keeps a single React instance per module while giving federated consumers real
 * named exports to import.
 *
 * Run `fyn build` after bumping the `react` devDependency.
 */
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const require = createRequire(import.meta.url);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// react's "exports" map hides ./cjs/*, so resolve via its package.json instead.
const cjsDir = join(dirname(require.resolve("react/package.json")), "cjs");
const outDir = join(pkgRoot, "src");

// trailingComma "none" matches React's own bundle formatting, so bumps produce a diff of real
// changes rather than a wall of comma churn.
const PRETTIER_OPTIONS = { parser: "babel", printWidth: 100, trailingComma: "none" };
const USE_STRICT = '"use strict";\n';

// The dev bundle guards its whole body behind a NODE_ENV check; strip the guard so the factory
// is unconditional (the file is only ever loaded through the "development" export condition).
const DEV_PROLOGUE = '"production" !== process.env.NODE_ENV &&\n  (function () {\n';
const DEV_EPILOGUE = "})();\n";

/** Split a CJS bundle into its license header and the body after "use strict". */
function splitBundle(source, file) {
  const at = source.indexOf(USE_STRICT);
  if (at < 0) throw new Error(`${file}: no "use strict" prologue found`);
  return {
    header: source.slice(0, at).trimEnd(),
    body: source.slice(at + USE_STRICT.length),
  };
}

function unwrapDevGuard(body, file) {
  if (!body.startsWith(DEV_PROLOGUE)) {
    throw new Error(
      `${file}: expected the NODE_ENV guard prologue - React's bundle format changed`,
    );
  }
  const inner = body.slice(DEV_PROLOGUE.length).trimEnd();
  if (!inner.endsWith(DEV_EPILOGUE.trimEnd())) {
    throw new Error(`${file}: expected the IIFE epilogue - React's bundle format changed`);
  }
  return inner.slice(0, -DEV_EPILOGUE.trimEnd().length);
}

/** Collect every `exports.<name> =` assignment in a bundle. */
function exportNames(source) {
  return [...source.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
}

function render({ header, body, version, names }) {
  return `${header}

"use strict";

function defReact(exports) {
${body}

  return exports;
}

const React = defReact({});

export default React;
export const __esmModule = true;

console.log("ESM_REACT_VERSION ${version}");

export const {
${names.map((n) => `  ${n},`).join("\n")}
} = React;
`;
}

const version = require("react/package.json").version;
if (!version.startsWith("19.")) {
  throw new Error(`react ${version} resolved, but this package only generates the 19.x ESM build`);
}

const sources = {};
for (const env of ["production", "development"]) {
  const file = `react.${env}.js`;
  sources[env] = { file, ...splitBundle(await readFile(join(cjsDir, file), "utf8"), file) };
}
sources.development.body = unwrapDevGuard(sources.development.body, sources.development.file);

// The dev bundle exports a few extras (act, captureOwnerStack). Export the union from both builds
// so consumers can import the same names regardless of which condition resolved - the extras are
// simply `undefined` in production rather than a hard import error.
const names = [
  ...new Set([...exportNames(sources.production.body), ...exportNames(sources.development.body)]),
].sort(); // plain ASCII order: PascalCase first, then __internals, then camelCase

await mkdir(outDir, { recursive: true });
for (const [env, { header, body }] of Object.entries(sources)) {
  const out = join(outDir, `react-esm-19.${env}.js`);
  await writeFile(
    out,
    await prettier.format(render({ header, body, version, names }), PRETTIER_OPTIONS),
  );
  console.log(`generated ${out} (react ${version}, ${names.length} named exports)`);
}
