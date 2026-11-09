// TypeDoc HTML for every published package that ships types, under <out>/api.
// One run in packages mode, the way ~/dev/fynjs/site/build.mjs does it. It lives
// in its own package so TypeDoc resolves the TypeScript it supports, not the
// monorepo's. Packages must be built first: TypeDoc reads their declarations.
import Fs from "node:fs";
import Path from "node:path";
import { Application, KindRouter } from "typedoc";

const HERE = import.meta.dirname;

/**
 * TypeDoc's "kind" router with extensionless links. Files are still written as
 * `modules/x.html`, but every href, the search index and the navigation data
 * say `modules/x`, and `index.html` becomes the directory. Cloudflare Pages
 * serves `modules/x` from `modules/x.html` directly, whereas a link to
 * `modules/x.html` is a 308 to the extensionless url first. With the stock
 * router every API page was reached through that redirect, which Search
 * Console reported as "Page with redirect" (33 pages, Nov 2026).
 *
 * The output file name is `page.url` from `buildPages`, which the overrides
 * below do not touch; the built-in `KindDirRouter` relies on the same split.
 */
class CleanKindRouter extends KindRouter {
  fixLink(link) {
    return link
      .replace(/(^|\/)index\.html(#|$)/, "$1$2")
      .replace(/\.html(#|$)/, "$1");
  }
  getFullUrl(refl) {
    return this.fixLink(super.getFullUrl(refl));
  }
  relativeUrl(from, to) {
    return this.fixLink(super.relativeUrl(from, to));
  }
  baseRelativeUrl(from, target) {
    // "./" rather than "" for the root page's own link to itself
    return this.fixLink(super.baseRelativeUrl(from, target)) || "./";
  }
}
export const ROUTER_NAME = "clean-kind";

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
  // typedoc.json names this router; the name is only resolved at render time
  app.renderer.defineRouter(ROUTER_NAME, CleanKindRouter);
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
