import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nunjucks from "nunjucks";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    DOCS,
    GUIDE_GROUPS,
    PAGES,
    assertNoMf2,
    faqEntities,
    filterChangelog,
    loadContentPages,
    renderContentSite,
    rewriteLink,
} from "../scripts/content-pages.mts";
import { buildLlmsFull, buildLlmsTxt, buildSitemapEntries, renderSitemap } from "../scripts/seo-files.mts";
import { findMissingLocalRefs } from "../scripts/build-demo-site.mts";
import { buildTemplates } from "../scripts/build-templates.mts";
import { SITE_ORIGIN, pageSeo, siteUrl } from "../scripts/page-seo.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(here, "../templates");
const ctx = (htmlExt = "") => ({
    prefix: "/",
    htmlExt,
    source: "core/kernel/README.md",
    repoRoot: path.resolve(here, "../../.."),
    docBySource: new Map(DOCS.map(d => [d.source, d.slug])),
});

let tmp: string;
beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "fynmesh-seo-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("link rewriting", () => {
    it("adds the prefix and htmlExt to root-relative site links", () => {
        expect(rewriteLink("/demo", ctx())).toBe("/demo");
        expect(rewriteLink("/docs/kernel#x", ctx(".html"))).toBe("/docs/kernel.html#x");
        expect(rewriteLink("/", ctx())).toBe("/");
    });

    it("maps a link to another doc source to its doc page", () => {
        const c = { ...ctx(), source: "dev-tools/create-fynapp/agent/GUIDE.md" };
        expect(rewriteLink("./CONTRACT.md", c)).toBe("/docs/fynapp-contract");
        expect(rewriteLink("../../../core/kernel/README.md#a", c)).toBe("/docs/kernel#a");
    });

    it("maps a directory holding a doc README to the doc page", () => {
        const c = { ...ctx(), source: "rollup-federation/federation-js/README.md" };
        expect(rewriteLink("../rollup-plugin-federation", c)).toBe("/docs/rollup-plugin-federation");
    });

    it("sends other relative links to GitHub blob or tree urls", () => {
        expect(rewriteLink("../../notes/BUILD-ARTIFACTS.md", ctx())).toBe(
            "https://github.com/jchip/fynmesh/blob/main/notes/BUILD-ARTIFACTS.md",
        );
        expect(rewriteLink("../../demo/demo-server", ctx())).toBe(
            "https://github.com/jchip/fynmesh/tree/main/demo/demo-server",
        );
    });

    it("leaves absolute and fragment links alone", () => {
        expect(rewriteLink("https://x.dev/a", ctx())).toBe("https://x.dev/a");
        expect(rewriteLink("#top", ctx())).toBe("#top");
    });
});

describe("changelog and guards", () => {
    const sample = [
        "# 9/22/2026",
        "-   FYM-423: add demo links (FYM-1, FYM-2) [commit](/commit/abc123)",
        "-   docs: trace MF2 shared tree-shaking [commit](/commit/def456)",
        "-   retarget demo domain from lm360.ai to fynmesh.win",
        "-   keep FYM-9 ( ) this",
    ].join("\n");

    it("drops MF2 and other-domain lines, strips tickets, absolutizes commit links", () => {
        const out = filterChangelog(sample);
        expect(out).not.toMatch(/MF2|lm360|fynmesh\.win|FYM-/);
        expect(out).toContain("-   add demo links [commit](https://github.com/jchip/fynmesh/commit/abc123)");
        expect(out).toContain("keep this");
    });

    it("fails the guard on MF2, Module Federation 2 and foreign domains", () => {
        expect(() => assertNoMf2([{ name: "a", text: "all good, www.fynmesh.fyi" }])).not.toThrow();
        for (const bad of ["MF2 rocks", "Module Federation 2.0", "https://fynmesh.win", "lm360.ai", "https://fynmesh.fyi/x"]) {
            expect(() => assertNoMf2([{ name: "a", text: bad }]), bad).toThrow();
        }
    });
});

describe("content pages and builds", () => {
    const pages = () => loadContentPages({ pathPrefix: "/", htmlExt: "" });

    it("loads every registered doc and the guides", () => {
        const all = pages();
        for (const d of DOCS) expect(all.some(p => p.kind === "docs" && p.slug === d.slug)).toBe(true);
        expect(all.filter(p => p.kind === "guides").length).toBeGreaterThan(0);
        for (const p of all) {
            expect(p.bodyHtml).not.toMatch(/<h1[ >]/);
            expect(p.dateModified).toMatch(/^\d{4}-\d\d-\d\dT/);
        }
    });

    it("renders json-ld that parses and names the page", () => {
        const env = nunjucks.configure(templateDir, { autoescape: true });
        renderContentSite(env, { outputDir: tmp, isProduction: false, pathPrefix: "/", htmlExt: "" });
        for (const p of pages()) {
            const html = readFileSync(path.join(tmp, `${p.canonicalPath}.html`), "utf8");
            const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
            const node = JSON.parse(json)["@graph"].find((n: any) => n["@id"] === `${siteUrl(p.canonicalPath)}#webpage`);
            expect(node["@type"]).toBe(PAGES.find(x => x.slug === p.slug)?.schemaType ?? "TechArticle");
            expect(html).toContain(`<title>${p.title.replace(/&/g, "&amp;")}</title>`);
        }
        for (const idx of ["docs", "guides", "demos"]) {
            const html = readFileSync(path.join(tmp, `${idx}.html`), "utf8");
            const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
            const node = JSON.parse(json)["@graph"].find((n: any) => n["@type"] === "CollectionPage");
            expect(node.url).toBe(siteUrl(idx));
        }
    });

    it("uses htmlExt for links: clean on the site, .html for the dev server", () => {
        const env = nunjucks.configure(templateDir, { autoescape: true });
        const clean = path.join(tmp, "clean");
        const dev = path.join(tmp, "dev");
        renderContentSite(env, { outputDir: clean, isProduction: false, pathPrefix: "/", htmlExt: "" });
        renderContentSite(env, { outputDir: dev, isProduction: false, pathPrefix: "/", htmlExt: ".html" });
        expect(readFileSync(path.join(clean, "docs.html"), "utf8")).toContain('href="/docs/kernel"');
        expect(readFileSync(path.join(dev, "docs.html"), "utf8")).toContain('href="/docs/kernel.html"');
    });

    it("dev template build always links with .html", async () => {
        const out = path.join(tmp, "dev-build");
        expect(await buildTemplates({ outputDir: out, pathPrefix: "/", isProduction: false })).toBe(true);
        expect(readFileSync(path.join(out, "index.html"), "utf8")).toContain("features.html");
        expect(existsSync(path.join(out, "docs/kernel.html"))).toBe(true);
        expect(existsSync(path.join(out, "guides.html"))).toBe(true);
    });

    it("resolves extensionless refs to .html files in findMissingLocalRefs", () => {
        writeFileSync(path.join(tmp, "index.html"), `<a href="/features">f</a><a href="/">h</a><a href="/nope">n</a>`);
        writeFileSync(path.join(tmp, "features.html"), "");
        expect(findMissingLocalRefs(tmp, "/")).toEqual(["index.html -> /nope"]);
    });

    it("checks refs inside docs/ pages too", () => {
        mkdirSync(path.join(tmp, "docs"));
        writeFileSync(path.join(tmp, "docs/a.html"), `<a href="/missing">m</a>`);
        expect(findMissingLocalRefs(tmp, "/")).toEqual(["docs/a.html -> /missing"]);
    });
});

describe("ordered sections", () => {
    const pages = () => loadContentPages({ pathPrefix: "/", htmlExt: "" });

    it("lists every guide and top-level page in order, under their groups", () => {
        const all = pages();
        expect(all.filter(p => p.kind === "guides").map(p => p.slug)).toEqual(GUIDE_GROUPS.flatMap(g => g.slugs));
        expect(all.filter(p => p.kind === "pages").map(p => p.canonicalPath)).toEqual(PAGES.map(p => p.slug));
    });

    it("fails the build when a guide file is not listed", () => {
        const contentDir = path.join(tmp, "content");
        mkdirSync(path.join(contentDir, "guides"), { recursive: true });
        writeFileSync(path.join(contentDir, "guides", "stray.md"), "---\ntitle: Stray\n---\n\nBody.\n");
        expect(() => loadContentPages({ pathPrefix: "/", htmlExt: "", contentDir })).toThrow(/not listed: stray/);
    });

    it("turns the FAQ's ### questions into FAQPage entities", () => {
        const entities = faqEntities("## Basics\n\n### What is a FynApp?\n\nA micro frontend. See [docs](/docs).\n\n### Is it free?\n\nYes.\n");
        expect(entities).toEqual([
            { "@type": "Question", name: "What is a FynApp?", acceptedAnswer: { "@type": "Answer", text: "A micro frontend. See docs." } },
            { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes." } },
        ]);
        const faq = pages().find(p => p.slug === "faq")!;
        expect((faq.seo.pageProps!.mainEntity as unknown[]).length).toBeGreaterThan(10);
    });
});

describe("demo apps", () => {
    it("carry no site header, footer or GitHub link", () => {
        const env = nunjucks.configure(templateDir, { autoescape: true });
        for (const page of ["shell", "fynops"] as const) {
            const html = env.render(`pages/${page}.html`, { pathPrefix: "/", htmlExt: "", ...pageSeo(page) });
            expect(html, page).not.toMatch(/class="fm-(header|footer|gh)"/);
        }
    });
});

describe("sitemap and llms files", () => {
    it("lists existing pages with YYYY-MM-DD lastmod and no changefreq or priority", () => {
        const env = nunjucks.configure(templateDir, { autoescape: true });
        const contentPages = renderContentSite(env, { outputDir: tmp, isProduction: false, pathPrefix: "/", htmlExt: "" });
        writeFileSync(path.join(tmp, "index.html"), "");
        writeFileSync(path.join(tmp, "404.html"), "");
        const entries = buildSitemapEntries({ outputDir: tmp, contentPages });
        const locs = entries.map(e => e.loc);
        expect(locs).toContain(`${SITE_ORIGIN}/`);
        expect(locs).toContain(siteUrl("docs"));
        expect(locs).toContain(siteUrl("docs/kernel"));
        expect(locs).toContain(siteUrl("guides/run-multiple-react-versions"));
        expect(locs.some(l => l.includes("404") || l.endsWith(".html"))).toBe(false);
        expect(locs).not.toContain(siteUrl("demo"));
        for (const e of entries) expect(e.lastmod).toMatch(/^\d{4}-\d\d-\d\d$/);
        const xml = renderSitemap(entries);
        expect(xml).not.toMatch(/changefreq|priority/);
        expect(xml).toContain("<lastmod>");
    });

    it("builds llms.txt in llmstxt.org shape and llms-full.txt without the changelog", () => {
        const all = loadContentPages({ pathPrefix: "/", htmlExt: "" });
        const txt = buildLlmsTxt(all);
        expect(txt.startsWith("# FynMesh\n\n> FynMesh is an open source")).toBe(true);
        for (const h of ["## Overview", "## Docs", "## Guides", "## Demos", "## Optional"]) expect(txt).toContain(h);
        expect(txt).toContain("(https://www.fynmesh.fyi/faq): ");
        expect(txt).toMatch(/- \[[^\]]+\]\(https:\/\/www\.fynmesh\.fyi\/docs\/kernel\): /);
        expect(txt).not.toMatch(/\.html\)/);
        const full = buildLlmsFull(all);
        expect(full).toContain("URL: https://www.fynmesh.fyi/docs/kernel");
        expect(full).not.toContain("URL: https://www.fynmesh.fyi/docs/changelog");
        expect(() => assertNoMf2([{ name: "llms.txt", text: txt }, { name: "llms-full.txt", text: full }])).not.toThrow();
    });
});
