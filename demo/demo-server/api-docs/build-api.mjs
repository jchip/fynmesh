// TypeDoc HTML for every published package that ships types, under <out>/api.
// One run in packages mode, the way ~/dev/fynjs/site/build.mjs does it. It lives
// in its own package so TypeDoc resolves the TypeScript it supports, not the
// monorepo's. Packages must be built first: TypeDoc reads their declarations.
import Fs from "node:fs";
import Path from "node:path";
import { Application } from "typedoc";

const HERE = import.meta.dirname;

/** Published packages with types, repo-relative. Each needs a `types` entry in package.json. */
export const API_PACKAGES = [
  "core/kernel",
  "rollup-federation/federation-js",
  "rollup-federation/rollup-plugin-federation",
];

/**
 * @param {{ outDir: string, repoRoot: string }} opts
 * @returns {Promise<{ path: string, sources: string[] }[]>} the pages written, extensionless, with
 *   the repo dirs each one documents (for sitemap lastmod)
 */
export async function buildApiDocs({ outDir, repoRoot }) {
  // real paths: TypeDoc skips a package reached through a symlink
  const dirs = API_PACKAGES.map(d => Fs.realpathSync(Path.join(repoRoot, d)));
  for (const dir of dirs) {
    const pkg = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8"));
    if (!pkg.types || !Fs.existsSync(Path.join(dir, pkg.types))) {
      throw new Error(`${dir}: no built declarations at "${pkg.types}"; build the package before the site`);
    }
  }
  const app = await Application.bootstrapWithPlugins({
    options: Path.join(HERE, "typedoc.json"),
    entryPoints: dirs,
  });
  const project = await app.convert();
  if (!project) throw new Error("TypeDoc failed to convert the packages");
  const apiDir = Path.join(outDir, "api");
  await app.generateDocs(project, apiDir);

  // TypeDoc names a package's page after its npm name, with @ and / turned into _
  const pages = [{ path: "api/", sources: dirs }];
  for (const dir of dirs) {
    const name = JSON.parse(Fs.readFileSync(Path.join(dir, "package.json"), "utf8")).name;
    const page = `modules/${name.replace(/[@/]/g, "_")}`;
    if (Fs.existsSync(Path.join(apiDir, `${page}.html`))) pages.push({ path: `api/${page}`, sources: [dir] });
  }
  return pages;
}
