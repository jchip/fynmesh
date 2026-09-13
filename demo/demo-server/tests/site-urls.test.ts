import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demoServer = path.join(repoRoot, "demo/demo-server");
const read = (rel: string) => readFileSync(path.join(demoServer, rel), "utf8");

/**
 * FYM-389. Cloudflare Pages 308-redirects `/demo.html` to `/demo` and
 * `/shell.html` to `/shell`, so a canonical or sitemap entry naming the `.html`
 * form points every crawler at a redirect. The `<a href>` links are a different
 * case and must keep their extension: the local dev server serves the `.html`
 * paths, and `findMissingLocalRefs` resolves each local ref to a real file in
 * the output directory.
 */
/**
 * Asserted against the generator rather than a generated `sitemap.xml`, because
 * that file is written into the site build's output directory and never into
 * `public/`. Reading it made these tests depend on someone having run
 * `fyn build-demo` first, so they failed on a clean checkout against a path that
 * is never written -- see the same reasoning behind the 404 tests below, which
 * have always read the build script.
 */
const sitemapLocs = (): string[] => {
    const build = read("scripts/build-demo-site.mts");
    const block = /const sitemapPages = \[([\s\S]*?)\];/.exec(build);
    expect(block, "sitemapPages array not found in build-demo-site.mts").toBeTruthy();
    return [...block![1].matchAll(/loc:\s*"([^"]+)"/g)].map(m => m[1]);
};

describe("public URLs", () => {
    it("lists only extensionless page URLs in the sitemap", () => {
        const locs = sitemapLocs();

        expect(locs.length).toBeGreaterThan(1);
        expect(locs.filter(loc => loc.endsWith(".html"))).toEqual([]);
    });

    /**
     * `canonicalPath` is a render variable supplied per page by
     * `build-demo-site.mts` and consumed by `layouts/base.html`, which builds
     * canonical / og:url / twitter:url from it. It used to be a
     * `{% block canonical_path %}` in each page template; the assertion moved
     * with the mechanism.
     */
    it("declares extensionless canonicals on the demo and shell pages", () => {
        const build = read("scripts/build-demo-site.mts");
        const paths = [...build.matchAll(/canonicalPath:\s*"([^"]*)"/g)].map(m => m[1]);

        expect(paths).toContain("demo");
        expect(paths).toContain("shell");
        expect(paths.filter(p => p.endsWith(".html"))).toEqual([]);
        expect(read("templates/layouts/base.html")).toContain('<link rel="canonical"');
    });

    it("keeps the .html extension on internal links, which the dev server serves", () => {
        const landing = read("templates/pages/landing.html");

        expect(landing).toContain("{{pathPrefix}}demo.html");
        expect(landing).toContain("{{pathPrefix}}shell.html");
    });
});

/**
 * FYM-390. Cloudflare Pages has no setting for not-found behavior -- it infers
 * it from the deployed files. Without a top-level 404.html it decides the
 * deployment is a single-page application and answers every unmatched path with
 * index.html and a 200, which is how a missing chunk reaches the browser as
 * text/html and kills the page on a MIME refusal instead of 404ing. This file
 * existing IS the fix, so these tests guard it against being tidied away.
 */
describe("404 page", () => {
    const template = read("templates/pages/404.html");

    it("is rendered by the site build, so Pages stops treating the site as an SPA", () => {
        const build = read("scripts/build-demo-site.mts");

        expect(build).toContain('env.render("pages/404.html"');
        expect(build).toContain('path.join(outputDir, "404.html")');
    });

    it("is rendered by the dev template build too, so both paths agree", () => {
        const build = read("scripts/build-templates.mts");

        expect(build).toContain('env.render("pages/404.html"');
        expect(build).toContain('path.join(outputDir, "404.html")');
    });

    it("is noindex and claims no canonical url", () => {
        expect(template).toContain('content="noindex, follow"');
        expect(template).toMatch(/\{%\s*block canonical\s*%\}\{%\s*endblock\s*%\}/);
    });

    it("stays out of the sitemap", () => {
        expect(sitemapLocs().filter(loc => loc.includes("404"))).toEqual([]);
    });

    it("depends on no FynApp, loader or chunk — the things that fail to load", () => {
        expect(template).not.toMatch(/lazy-loader|fynapp-entry|system(\.min)?\.js|federation/);
    });

    it("links back with the .html paths the dev server serves", () => {
        expect(template).toContain("{{pathPrefix}}demo.html");
        expect(template).toContain("{{pathPrefix}}shell.html");
    });
});
