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
    legacyAmd: "legacy-amd.html",
    docs: "section-index.html",
    guides: "section-index.html",
    demos: "demos.html",
};

const day = (iso: string) => iso.slice(0, 10);
const newest = (dates: string[]) => dates.filter(Boolean).sort().pop() ?? "";

/**
 * One entry per page that exists in `outputDir`: the PAGE_SEO pages (not the
 * 404), every content page, and any `extra` pages such as the API reference.
 * `lastmod` is the newest commit date of the page's sources, or the build
 * date when git has none.
 */
export function buildSitemapEntries(opts: {
    outputDir: string;
    contentPages: ContentPage[];
    /** pages not built from templates: an extensionless path and the repo files it comes from */
    extra?: { path: string; sources: string[] }[];
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

    for (const page of opts.extra ?? []) {
        entries.push({ loc: siteUrl(page.path), lastmod: day(newest(page.sources.map(gitDate))) || buildDay });
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
export function buildLlmsTxt(contentPages: ContentPage[], opts: { apiUrl?: string } = {}): string {
    const listed = (kind: "pages" | "docs" | "guides") =>
        contentPages
            .filter(p => p.kind === kind && p.slug !== "changelog")
            .map(p => link(p.title, siteUrl(p.canonicalPath), p.description));
    const demo = (key: "demo" | "shell" | "fynops" | "legacyAmd") =>
        link(PAGE_SEO[key].title, siteUrl(PAGE_SEO[key].canonicalPath), PAGE_SEO[key].metaDescription);
    const changelog = contentPages.find(p => p.slug === "changelog");

    const sections: [string, string[]][] = [
        ["Overview", listed("pages")],
        ["Docs", listed("docs")],
        ["Guides", listed("guides")],
        [
            "Demos",
            [
                link(PAGE_SEO.demos.title, siteUrl("demos"), PAGE_SEO.demos.metaDescription),
                demo("demo"),
                demo("shell"),
                demo("fynops"),
                demo("legacyAmd"),
            ],
        ],
        [
            "Optional",
            [
                link(PAGE_SEO.features.title, siteUrl("features"), PAGE_SEO.features.metaDescription),
                ...(opts.apiUrl
                    ? [link("API reference", opts.apiUrl, "TypeDoc reference for the kernel, federation-js and the Rollup plugin.")]
                    : []),
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
        `FynMesh loads independently deployed apps, called FynApps, into one page and shares ` +
            `their dependencies at runtime. The links below are the overview pages, docs, guides ` +
            `and live demos.`,
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
    // overview pages first, then docs and guides
    const ordered = [...contentPages].sort((a, b) => Number(b.kind === "pages") - Number(a.kind === "pages"));
    for (const p of ordered.filter(p => p.inLlmsFull)) {
        out.push(``, `---`, ``, `# ${p.title}`, ``, `URL: ${siteUrl(p.canonicalPath)}`, ``, p.bodyMarkdown.trim());
    }
    return out.join("\n") + "\n";
}
