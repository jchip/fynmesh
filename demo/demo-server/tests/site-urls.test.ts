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
describe("public URLs", () => {
    it("lists only extensionless page URLs in the sitemap", () => {
        const locs = [...read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

        expect(locs.length).toBeGreaterThan(1);
        expect(locs.filter(loc => loc.endsWith(".html"))).toEqual([]);
    });

    it("declares extensionless canonicals on the demo and shell pages", () => {
        expect(read("templates/pages/demo.html")).toContain(
            "{% block canonical_path %}demo{% endblock %}"
        );
        expect(read("templates/pages/shell.html")).toContain(
            'href="https://www.fynmesh.win/shell"'
        );
    });

    it("keeps the .html extension on internal links, which the dev server serves", () => {
        const landing = read("templates/pages/landing.html");

        expect(landing).toContain("{{pathPrefix}}demo.html");
        expect(landing).toContain("{{pathPrefix}}shell.html");
    });
});
