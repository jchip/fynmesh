import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GITHUB_URL, NPM_URL, PAGE_SEO, SITE_DEFINITION, siteUrl } from "./page-seo.mts";
import { gitDate, type ContentPage } from "./content-pages.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE_DIR = path.join(__dirname, "../templates");

export interface SitemapEntry {
    loc: string;
    /** YYYY-MM-DD */
    lastmod: string;
}

const TEMPLATE_OF: Record<string, string> = {
    landing: "landing.html",
    demo: "demo.html",
    features: "features.html",
    shell: "shell.html",
    fynops: "fynops.html",
    docs: "section-index.html",
    guides: "section-index.html",
};

const day = (iso: string) => iso.slice(0, 10);
const newest = (dates: string[]) => dates.filter(Boolean).sort().pop() ?? "";

/**
 * One entry per page that exists in `outputDir`: the PAGE_SEO pages (not the
 * 404) and every docs and guides page. `lastmod` is the newest commit date of
 * the page's sources, or the build date when git has none.
 */
export function buildSitemapEntries(opts: {
    outputDir: string;
    contentPages: ContentPage[];
    templateDir?: string;
    now?: Date;
}): SitemapEntry[] {
    const { outputDir, contentPages } = opts;
    const templateDir = opts.templateDir ?? DEFAULT_TEMPLATE_DIR;
    const buildDay = day((opts.now ?? new Date()).toISOString());
    const templateDate = (name: string) => gitDate(path.join(templateDir, "pages", name));
    const entries: SitemapEntry[] = [];

    for (const [key, seo] of Object.entries(PAGE_SEO)) {
        if (key === "notFound") continue;
        const file = seo.canonicalPath ? `${seo.canonicalPath}.html` : "index.html";
        if (!existsSync(path.join(outputDir, file))) continue;
        const kind = contentPages.filter(p => p.kind === key);
        const dates = [templateDate(TEMPLATE_OF[key]), ...kind.map(p => p.dateModified)];
        entries.push({ loc: siteUrl(seo.canonicalPath), lastmod: day(newest(dates)) || buildDay });
    }

    for (const page of contentPages) {
        if (!existsSync(path.join(outputDir, `${page.canonicalPath}.html`))) continue;
        const dates = [templateDate("content.html"), page.dateModified];
        entries.push({ loc: siteUrl(page.canonicalPath), lastmod: day(newest(dates)) || buildDay });
    }
    return entries;
}

export function renderSitemap(entries: SitemapEntry[]): string {
    const urls = entries.map(e =>
        [`    <url>`, `        <loc>${e.loc}</loc>`, `        <lastmod>${e.lastmod}</lastmod>`, `    </url>`].join("\n"),
    );
    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${urls.join("\n")}\n</urlset>\n`
    );
}

const link = (title: string, url: string, description: string) =>
    `- [${title}](${url}): ${description}`;

/** llms.txt, following the llmstxt.org layout. */
export function buildLlmsTxt(contentPages: ContentPage[]): string {
    const listed = (kind: "docs" | "guides") =>
        contentPages
            .filter(p => p.kind === kind && p.slug !== "changelog")
            .map(p => link(p.title, siteUrl(p.canonicalPath), p.description));
    const demo = (key: "demo" | "shell" | "fynops") =>
        link(PAGE_SEO[key].title, siteUrl(PAGE_SEO[key].canonicalPath), PAGE_SEO[key].metaDescription);
    const changelog = contentPages.find(p => p.slug === "changelog");

    const sections: [string, string[]][] = [
        ["Docs", listed("docs")],
        ["Guides", listed("guides")],
        ["Demos", [demo("demo"), demo("shell"), demo("fynops")]],
        [
            "Optional",
            [
                link(PAGE_SEO.features.title, siteUrl("features"), PAGE_SEO.features.metaDescription),
                ...(changelog ? [link(changelog.title, siteUrl(changelog.canonicalPath), changelog.description)] : []),
                link("Source code", GITHUB_URL, "The FynMesh repository on GitHub."),
                link("npm package", NPM_URL, "The @fynmesh/kernel package on npm."),
            ],
        ],
    ];

    const out = [
        `# FynMesh`,
        ``,
        `> ${SITE_DEFINITION}`,
        ``,
        `FynMesh loads independently deployed apps, called FynApps, into one page. ` +
            `Each app can bring its own React or other framework version. ` +
            `The links below are the docs, guides and live demos.`,
    ];
    for (const [name, items] of sections) {
        if (items.length === 0) continue;
        out.push(``, `## ${name}`, ``, ...items);
    }
    return out.join("\n") + "\n";
}

/** llms-full.txt: the definition, then every doc and guide as markdown. */
export function buildLlmsFull(contentPages: ContentPage[]): string {
    const out = [`# FynMesh`, ``, `> ${SITE_DEFINITION}`];
    for (const p of contentPages.filter(p => p.inLlmsFull)) {
        out.push(``, `---`, ``, `# ${p.title}`, ``, `URL: ${siteUrl(p.canonicalPath)}`, ``, p.bodyMarkdown.trim());
    }
    return out.join("\n") + "\n";
}
