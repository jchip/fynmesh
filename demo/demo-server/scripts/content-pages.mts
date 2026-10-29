import MarkdownIt from "markdown-it";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { GITHUB_URL, SITE_ORIGIN, pageSeo, type PageSeo } from "./page-seo.mts";

/**
 * Docs and guides: markdown rendered into site pages at build time.
 *
 * Both site builds call `renderContentSite`, so the dev server's `public/`
 * shows the same pages as the deployed site. Docs come from repo files listed
 * in `DOCS`. Guides are hand-written files in `content/guides/`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const CONTENT_DIR = path.resolve(__dirname, "../content");

const RAW_URL = "https://raw.githubusercontent.com/jchip/fynmesh/main";

/** Site pages a root-relative link may point at. */
const SITE_SECTIONS = new Set([
    "demo", "shell", "fynops", "legacy-amd", "demos", "features", "docs", "guides", "why-fynmesh", "how-it-works", "faq",
]);

/** Docs sidebar and index groups, in display order. */
export const DOC_GROUPS = ["Start here", "Concepts", "Reference", "Releases"] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

export interface DocEntry {
    slug: string;
    group: DocGroup;
    /** repo-relative source file */
    source: string;
    title: string;
    pageName: string;
    metaDescription: string;
}

export const DOCS: DocEntry[] = [
    {
        slug: "getting-started",
        group: "Start here",
        source: "dev-tools/create-fynapp/README.md",
        title: "Getting Started: Create a FynApp",
        pageName: "Getting Started",
        metaDescription:
            "Scaffold a FynApp with create-fynapp, run it next to other apps, and ship it. " +
            "The quickest path from an empty folder to a working micro frontend.",
    },
    {
        slug: "fynapp-guide",
        group: "Start here",
        source: "dev-tools/create-fynapp/agent/GUIDE.md",
        title: "FynApp Guide: Create or Modify an App",
        pageName: "FynApp Guide",
        metaDescription:
            "A step by step guide to create a new FynApp or change an existing one. " +
            "It is written for developers and for coding agents that follow the FynApp contract.",
    },
    {
        slug: "fynapp-contract",
        group: "Concepts",
        source: "dev-tools/create-fynapp/agent/CONTRACT.md",
        title: "The FynApp Contract",
        pageName: "FynApp Contract",
        metaDescription:
            "The rules every FynApp follows: exports, lifecycle, shared dependencies and " +
            "middleware. Read it before you write an app or ask an agent to write one.",
    },
    {
        slug: "kernel",
        group: "Reference",
        source: "core/kernel/README.md",
        title: "FynMesh Kernel API and Concepts",
        pageName: "Kernel",
        metaDescription:
            "How the FynMesh kernel loads FynApps, runs their lifecycle, wires middleware and " +
            "connects apps with FynBus. API reference with the core concepts.",
    },
    {
        slug: "federation-js",
        group: "Reference",
        source: "rollup-federation/federation-js/README.md",
        title: "federation-js: Runtime Module Federation",
        pageName: "federation-js",
        metaDescription:
            "federation-js is the small runtime that loads federated modules in the browser. " +
            "It resolves shared dependencies by semver range, so versions can coexist.",
    },
    {
        slug: "rollup-plugin-federation",
        group: "Reference",
        source: "rollup-federation/rollup-plugin-federation/README.md",
        title: "rollup-plugin-federation: Module Federation for Rollup",
        pageName: "rollup-plugin-federation",
        metaDescription:
            "Configure the Rollup plugin that builds FynApps: what to expose, what to share, " +
            "and how version ranges decide which copy of a library each app gets.",
    },
    {
        slug: "federation-inspector",
        group: "Reference",
        source: "dev-tools/federation-inspector/README.md",
        title: "Federation Inspector: Debug Shared Modules",
        pageName: "Federation Inspector",
        metaDescription:
            "A browser tool that shows which shared modules each app loaded and which version " +
            "won. Use it to debug dependency sharing on a live page.",
    },
    {
        slug: "changelog",
        group: "Releases",
        source: "CHANGELOG.md",
        title: "FynMesh Changelog and Release Notes",
        pageName: "Changelog",
        metaDescription:
            "Release notes for FynMesh packages, grouped by date. Each entry lists the " +
            "published package versions and the changes behind them.",
    },
];

/**
 * Guides in display order. Every file in content/guides must be listed here
 * and every slug here must have a file, so a guide cannot go missing.
 */
export const GUIDE_GROUPS: { name: string; slugs: string[] }[] = [
    {
        name: "Versions and sharing",
        slugs: [
            "run-multiple-react-versions",
            "share-dependencies-semver",
            "upgrade-react-incrementally",
            "legacy-requirejs-on-module-federation",
        ],
    },
    { name: "Building", slugs: ["micro-frontends-with-rollup", "module-federation-without-webpack"] },
];

/**
 * Top-level prose pages from content/pages, in display order, with the
 * header section each one marks current. Same completeness rule as guides.
 */
export const PAGES: { slug: string; navSection: string; schemaType: string }[] = [
    { slug: "why-fynmesh", navSection: "why", schemaType: "WebPage" },
    { slug: "how-it-works", navSection: "how", schemaType: "TechArticle" },
    { slug: "faq", navSection: "faq", schemaType: "FAQPage" },
];

export type ContentKind = "docs" | "guides" | "pages";

export const SECTION_INTRO: Record<"docs" | "guides", string> = {
    docs:
        "Start with Getting Started to build your first FynApp. Read the FynApp contract next, " +
        "and keep the reference open while you work.",
    guides:
        "Each guide answers one question about running micro frontends with FynMesh. It starts " +
        "with the short answer, then shows the config and code behind it.",
};

export interface TocEntry {
    id: string;
    text: string;
}

export interface ContentPage {
    kind: ContentKind;
    slug: string;
    /** sidebar and index group */
    group: string;
    title: string;
    pageName: string;
    description: string;
    /** repo-relative source file */
    source: string;
    bodyHtml: string;
    /** markdown with absolute links and no leading h1, for llms-full.txt */
    bodyMarkdown: string;
    toc: TocEntry[];
    canonicalPath: string;
    /** ISO date of the last commit that touched the source */
    dateModified: string;
    /** the changelog is a log, not an explainer: keep it out of llms-full.txt */
    inLlmsFull: boolean;
    seo: PageSeo;
}

export interface ContentOptions {
    pathPrefix: string;
    /** "" on the deployed site, ".html" for the dev server */
    htmlExt: string;
    repoRoot?: string;
    contentDir?: string;
    now?: Date;
}

const dateCache = new Map<string, string>();

/** ISO date of the last commit touching `file`, or "" when git has none. */
export function gitDate(file: string): string {
    const cached = dateCache.get(file);
    if (cached !== undefined) return cached;
    let out = "";
    try {
        out = execFileSync("git", ["log", "-1", "--format=%cI", "--", path.basename(file)], {
            cwd: path.dirname(file),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    } catch {
        out = "";
    }
    dateCache.set(file, out);
    return out;
}

// ---------------------------------------------------------------- links

interface LinkContext {
    /** prefix for site links: "/" on the site, the absolute origin for llms files */
    prefix: string;
    htmlExt: string;
    /** repo-relative path of the markdown file the link is written in */
    source: string;
    repoRoot: string;
    /** repo-relative doc source -> doc slug */
    docBySource: Map<string, string>;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function repoLink(repoPath: string, repoRoot: string, isDir?: boolean): string {
    const abs = path.join(repoRoot, repoPath);
    const dir = isDir ?? (existsSync(abs) && statSync(abs).isDirectory());
    return `${GITHUB_URL}/${dir ? "tree" : "blob"}/main/${repoPath.replace(/\/$/, "")}`;
}

/** Map one link target written in a source file to a site or GitHub url. */
export function rewriteLink(href: string, ctx: LinkContext): string {
    if (!href || EXTERNAL.test(href)) return href;
    const m = /^([^?#]*)([?#].*)?$/.exec(href)!;
    const target = m[1];
    const tail = m[2] ?? "";

    if (target.startsWith("/")) {
        const p = target.replace(/^\/+/, "").replace(/\.html$/, "");
        if (p === "") return ctx.prefix + tail;
        // the TypeDoc reference is a directory of its own html, served as is
        if (p === "api" || p.startsWith("api/")) return `${ctx.prefix}${target.replace(/^\/+/, "")}${tail}`;
        if (SITE_SECTIONS.has(p.split("/")[0])) return `${ctx.prefix}${p}${ctx.htmlExt}${tail}`;
        return href;
    }

    const repoPath = path.posix.normalize(path.posix.join(path.posix.dirname(ctx.source), target));
    if (repoPath.startsWith("..")) return href;
    const abs = path.join(ctx.repoRoot, repoPath);
    const isDir = target.endsWith("/") || (existsSync(abs) && statSync(abs).isDirectory());
    const asFile = isDir ? `${repoPath.replace(/\/$/, "")}/README.md` : repoPath;
    const slug = ctx.docBySource.get(asFile);
    if (slug) return `${ctx.prefix}docs/${slug}${ctx.htmlExt}${tail}`;
    return repoLink(repoPath, ctx.repoRoot, isDir) + tail;
}

function rewriteImage(src: string, ctx: LinkContext): string {
    if (!src || EXTERNAL.test(src)) return src;
    const target = src.split(/[?#]/)[0];
    const repoPath = path.posix.normalize(
        target.startsWith("/")
            ? target.slice(1)
            : path.posix.join(path.posix.dirname(ctx.source), target),
    );
    return repoPath.startsWith("..") ? src : `${RAW_URL}/${repoPath}`;
}

/** Rewrite every `href` and `src` in rendered html. */
function rewriteHtml(html: string, ctx: LinkContext): string {
    return html.replace(/\b(href|src)="([^"]*)"/g, (_all, attr: string, value: string) => {
        const decoded = value.replace(/&amp;/g, "&");
        const out = attr === "src" ? rewriteImage(decoded, ctx) : rewriteLink(decoded, ctx);
        return `${attr}="${out.replace(/&/g, "&amp;")}"`;
    });
}

/** Rewrite every inline markdown link and image. */
function rewriteMarkdownLinks(md: string, ctx: LinkContext): string {
    return md.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)/g, (_all, bang: string, text: string, url: string) => {
        const out = bang ? rewriteImage(url, ctx) : rewriteLink(url, ctx);
        return `${bang}[${text}](${out}`;
    });
}

// ------------------------------------------------------------ changelog

const MF2 = /MF2|Module Federation 2/i;
/** Other domains, and the apex domain without "www.": the site is www.fynmesh.fyi only. */
const OTHER_DOMAIN = /fynmesh\.win|lm360\.ai|(?<!www\.)fynmesh\.fyi/i;
const TICKET = "(?:FYM|CFA)-\\d+";

/**
 * Prepare CHANGELOG.md for the site: drop lines that must not be public,
 * strip ticket ids and point commit links at GitHub.
 */
export function filterChangelog(md: string): string {
    return md
        .split("\n")
        .filter(line => !MF2.test(line) && !/fynmesh\.win|lm360\.ai/i.test(line))
        .map(line => {
            let out = line.replace(
                /\]\(\/commit\/([0-9a-f]+)\)/g,
                `](${GITHUB_URL}/commit/$1)`,
            );
            if (!new RegExp(TICKET).test(out)) return out;
            out = out
                .replace(new RegExp(`\\s*[(\\[]\\s*${TICKET}(?:[\\s,/&]+${TICKET})*\\s*[)\\]]`, "g"), "")
                .replace(new RegExp(`${TICKET}(?:[\\s,/&]+${TICKET})*:?\\s*`, "g"), "")
                .replace(/\(\s*\)/g, "")
                .replace(/\[\s*\](?!\()/g, "");
            // collapse the gaps the removals left, keeping leading indentation
            const lead = /^\s*(?:[-*]\s+)?/.exec(out)![0];
            return lead + out.slice(lead.length).replace(/(\S) {2,}/g, "$1 ").replace(/ +$/, "");
        })
        .join("\n");
}

// ------------------------------------------------------------- markdown

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

function slugify(text: string): string {
    const s = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-");
    return s || "section";
}

interface Rendered {
    html: string;
    toc: TocEntry[];
}

/**
 * Render markdown with heading ids and an h2 table of contents.
 *
 * @param dropH1 remove the first h1, since the page template renders the title
 * @param shift add to every heading level (the changelog's date headings are h1)
 */
function renderMarkdown(src: string, dropH1: boolean, shift: number): Rendered {
    const tokens = md.parse(src, {});
    const out = [];
    let dropped = !dropH1;
    for (let i = 0; i < tokens.length; i++) {
        if (!dropped && tokens[i].type === "heading_open" && tokens[i].tag === "h1") {
            dropped = true;
            i += 2;
            continue;
        }
        out.push(tokens[i]);
    }

    const used = new Map<string, number>();
    const toc: TocEntry[] = [];
    for (let i = 0; i < out.length; i++) {
        const t = out[i];
        if (t.type !== "heading_open") continue;
        const level = Math.min(6, Number(t.tag.slice(1)) + shift);
        const text = (out[i + 1].children ?? [])
            .filter(c => c.type === "text" || c.type === "code_inline")
            .map(c => c.content)
            .join("");
        const base = slugify(text);
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n === 0 ? base : `${base}-${n}`;
        t.tag = `h${level}`;
        t.attrSet("id", id);
        // the matching close tag is always two tokens on: open, inline, close
        out[i + 2].tag = `h${level}`;
        if (level === 2) toc.push({ id, text });
    }
    return { html: md.renderer.render(out, md.options, {}), toc };
}

/** Markdown with its first h1 line removed. */
function stripFirstH1(src: string): string {
    return src.replace(/^# .*\n+/m, "");
}

// ---------------------------------------------------------------- guides

function parseFrontMatter(src: string): { meta: Record<string, string>; body: string } {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
    if (!m) return { meta: {}, body: src };
    const meta: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
        if (kv) meta[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, "$2").trim();
    }
    return { meta, body: src.slice(m[0].length) };
}

// ----------------------------------------------------------------- pages

function makePage(
    kind: ContentKind,
    entry: {
        slug: string;
        group: string;
        title: string;
        pageName: string;
        description: string;
        source: string;
        schemaType?: string;
    },
    body: string,
    opts: Required<Pick<ContentOptions, "pathPrefix" | "htmlExt">> & { repoRoot: string },
    docBySource: Map<string, string>,
    isChangelog: boolean,
    now: Date,
): ContentPage {
    const sourceAbs = path.join(opts.repoRoot, entry.source);
    const ctx: LinkContext = {
        prefix: opts.pathPrefix,
        htmlExt: opts.htmlExt,
        source: entry.source,
        repoRoot: opts.repoRoot,
        docBySource,
    };
    // some package READMEs still name old or apex site urls
    body = body.replace(/https?:\/\/(?:www\.)?fynmesh\.(?:win|fyi)/gi, SITE_ORIGIN);
    const rendered = renderMarkdown(body, !isChangelog, isChangelog ? 1 : 0);
    const absCtx: LinkContext = { ...ctx, prefix: `${SITE_ORIGIN}/`, htmlExt: "" };
    // top-level pages live at the root; docs and guides under their section
    const canonicalPath = kind === "pages" ? entry.slug : `${kind}/${entry.slug}`;
    const dateModified = gitDate(sourceAbs) || now.toISOString();
    const schemaType = entry.schemaType ?? "TechArticle";
    const seo: PageSeo = {
        canonicalPath,
        title: entry.title,
        pageName: entry.pageName,
        metaDescription: entry.description,
        crumbs: kind === "pages" ? [] : [{ name: kind === "docs" ? "Docs" : "Guides", path: kind }],
        schemaType,
        dateModified,
    };
    if (schemaType === "TechArticle") seo.headline = entry.title;
    if (schemaType === "FAQPage") seo.pageProps = { mainEntity: faqEntities(body) };
    return {
        kind,
        slug: entry.slug,
        group: entry.group,
        title: entry.title,
        pageName: entry.pageName,
        description: entry.description,
        source: entry.source,
        bodyHtml: rewriteHtml(rendered.html, ctx),
        bodyMarkdown: rewriteMarkdownLinks(isChangelog ? body : stripFirstH1(body), absCtx),
        toc: rendered.toc,
        canonicalPath,
        dateModified,
        inLlmsFull: !isChangelog,
        seo,
    };
}

/** Plain text of a markdown fragment, for structured data. */
function plainText(mdText: string): string {
    return mdText
        .replace(/```[\s\S]*?```/g, "")
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

/** schema.org Question nodes: each `###` heading and the text under it. */
export function faqEntities(body: string): Record<string, unknown>[] {
    const entities: Record<string, unknown>[] = [];
    for (const block of body.split(/^### /m).slice(1)) {
        const nl = block.indexOf("\n");
        const question = plainText(block.slice(0, nl));
        const answer = plainText(block.slice(nl + 1).split(/^#{1,3} /m)[0]);
        if (question && answer) {
            entities.push({
                "@type": "Question",
                name: question,
                acceptedAnswer: { "@type": "Answer", text: answer },
            });
        }
    }
    return entities;
}

/** Front-matter pages from `dir`, in `order`; throws when a file and the list disagree. */
function loadOrdered(
    dir: string,
    order: string[],
    what: string,
): { slug: string; meta: Record<string, string>; body: string; file: string }[] {
    const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith(".md")) : [];
    const slugs = files.map(f => f.replace(/\.md$/, ""));
    const unlisted = slugs.filter(s => !order.includes(s));
    const missing = order.filter(s => !slugs.includes(s));
    if (unlisted.length || missing.length) {
        throw new Error(
            `${what} list out of sync with ${dir}: ` +
                (unlisted.length ? `not listed: ${unlisted.join(", ")}. ` : "") +
                (missing.length ? `no file for: ${missing.join(", ")}.` : ""),
        );
    }
    return order.map(slug => {
        const file = path.join(dir, `${slug}.md`);
        return { slug, file, ...parseFrontMatter(readFileSync(file, "utf8")) };
    });
}

/** All docs, then guides, then top-level pages, rendered with links for the given build. */
export function loadContentPages(options: ContentOptions): ContentPage[] {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const contentDir = options.contentDir ?? CONTENT_DIR;
    const now = options.now ?? new Date();
    const opts = { pathPrefix: options.pathPrefix, htmlExt: options.htmlExt, repoRoot };
    const docBySource = new Map(DOCS.map(d => [d.source, d.slug]));
    const pages: ContentPage[] = [];
    const repoPath = (file: string) => path.relative(repoRoot, file).split(path.sep).join("/");

    for (const doc of DOCS) {
        const abs = path.join(repoRoot, doc.source);
        if (!existsSync(abs)) throw new Error(`doc source missing: ${doc.source}`);
        let body = readFileSync(abs, "utf8");
        const isChangelog = doc.slug === "changelog";
        if (isChangelog) body = filterChangelog(body);
        pages.push(
            makePage("docs", { ...doc, description: doc.metaDescription }, body, opts, docBySource, isChangelog, now),
        );
    }

    const guideOrder = GUIDE_GROUPS.flatMap(g => g.slugs);
    for (const g of loadOrdered(path.join(contentDir, "guides"), guideOrder, "GUIDE_GROUPS")) {
        const title = g.meta.title || g.slug;
        const group = GUIDE_GROUPS.find(x => x.slugs.includes(g.slug))!.name;
        pages.push(
            makePage(
                "guides",
                {
                    slug: g.slug,
                    group,
                    title,
                    pageName: g.meta.pageName || title,
                    description: g.meta.description || title,
                    source: repoPath(g.file),
                },
                g.body,
                opts,
                docBySource,
                false,
                now,
            ),
        );
    }

    const pageOrder = PAGES.map(p => p.slug);
    for (const g of loadOrdered(path.join(contentDir, "pages"), pageOrder, "PAGES")) {
        const title = g.meta.title || g.slug;
        pages.push(
            makePage(
                "pages",
                {
                    slug: g.slug,
                    group: "Learn",
                    title,
                    pageName: g.meta.pageName || title,
                    description: g.meta.description || title,
                    source: repoPath(g.file),
                    schemaType: PAGES.find(p => p.slug === g.slug)!.schemaType,
                },
                g.body,
                opts,
                docBySource,
                false,
                now,
            ),
        );
    }
    return pages;
}

/** "Oct 24, 2026" from an ISO date. */
function displayDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Write the docs, guides and top-level prose pages, their two index pages and
 * the demos launch page into `outputDir`. Fails when any page mentions a term
 * that must stay out of public text.
 */
export function renderContentSite(
    env: { render(name: string, ctx: object): string },
    options: ContentOptions & { outputDir: string; isProduction: boolean },
): ContentPage[] {
    const { outputDir, isProduction, pathPrefix, htmlExt } = options;
    const pages = loadContentPages(options);
    const base = { isProduction, pathPrefix, htmlExt };
    const hrefOf = (p: { canonicalPath: string }) => `${pathPrefix}${p.canonicalPath}${htmlExt}`;
    const written: { name: string; text: string }[] = [];

    const write = (rel: string, html: string) => {
        const file = path.join(outputDir, rel);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, html);
        written.push({ name: rel, text: html });
    };

    /** Sidebar groups for a section, in order, plus fixed links a section shows. */
    const sidebarOf = (kind: ContentKind, current: string) => {
        const groups: { name: string; items: { title: string; href: string; current: boolean }[] }[] = [];
        for (const p of pages.filter(x => x.kind === kind)) {
            let g = groups.find(x => x.name === p.group);
            if (!g) groups.push((g = { name: p.group, items: [] }));
            g.items.push({ title: p.pageName, href: hrefOf(p), current: p.slug === current });
        }
        if (kind === "docs") {
            groups
                .find(g => g.name === "Concepts")
                ?.items.push({ title: "How it works", href: `${pathPrefix}how-it-works${htmlExt}`, current: false });
            groups
                .find(g => g.name === "Reference")
                ?.items.push({ title: "API reference", href: `${pathPrefix}api/`, current: false });
        }
        if (kind === "pages") {
            groups[0].items.splice(2, 0, { title: "Features", href: `${pathPrefix}features${htmlExt}`, current: false });
        }
        return groups;
    };

    for (const page of pages) {
        const siblings = pages.filter(p => p.kind === page.kind);
        const i = siblings.indexOf(page);
        const link = (p?: ContentPage) => p && { title: p.pageName, href: hrefOf(p) };
        write(
            `${page.canonicalPath}.html`,
            env.render("pages/content.html", {
                ...base,
                ...pageSeo(page.seo),
                navSection: page.kind === "pages" ? PAGES.find(p => p.slug === page.slug)!.navSection : page.kind,
                sectionName: page.kind === "docs" ? "Docs" : page.kind === "guides" ? "Guides" : "",
                sectionHref: `${pathPrefix}${page.kind}${htmlExt}`,
                lede: page.description,
                toc: page.toc,
                body: page.bodyHtml,
                updated: displayDate(page.dateModified),
                isChangelog: page.slug === "changelog",
                sourceUrl: `${GITHUB_URL}/${page.slug === "changelog" ? "blob" : "edit"}/main/${page.source}`,
                sidebar: sidebarOf(page.kind, page.slug),
                prev: link(siblings[i - 1]),
                next: link(siblings[i + 1]),
            }),
        );
    }

    const cardsOf = (kind: ContentKind) => {
        const groups: { name: string; cards: { title: string; description: string; href: string }[] }[] = [];
        for (const p of pages.filter(x => x.kind === kind)) {
            let g = groups.find(x => x.name === p.group);
            if (!g) groups.push((g = { name: p.group, cards: [] }));
            g.cards.push({ title: p.pageName, description: p.description, href: hrefOf(p) });
        }
        return groups;
    };

    const docGroups = cardsOf("docs");
    docGroups
        .find(g => g.name === "Concepts")
        ?.cards.push({
            title: "How it works",
            description: "From build to boot: manifests, loading by range, shared modules and boot order.",
            href: `${pathPrefix}how-it-works${htmlExt}`,
        });
    docGroups
        .find(g => g.name === "Reference")
        ?.cards.push({
            title: "API reference",
            description: "Every exported type and function of the kernel, federation-js and the Rollup plugin.",
            href: `${pathPrefix}api/`,
        });

    for (const kind of ["docs", "guides"] as const) {
        write(
            `${kind}.html`,
            env.render("pages/section-index.html", {
                ...base,
                ...pageSeo(kind),
                navSection: kind,
                heading: kind === "docs" ? "Docs" : "Guides",
                intro: SECTION_INTRO[kind],
                groups: kind === "docs" ? docGroups : cardsOf(kind),
            }),
        );
    }

    write("demos.html", env.render("pages/demos.html", { ...base, ...pageSeo("demos"), navSection: "demos" }));

    assertNoMf2(written);
    return pages;
}

/** Throw when any file mentions MF2, Module Federation 2 or a domain other than www.fynmesh.fyi. */
export function assertNoMf2(files: { name: string; text: string }[]): void {
    const bad = files.filter(f => MF2.test(f.text) || OTHER_DOMAIN.test(f.text)).map(f => f.name);
    if (bad.length > 0) {
        throw new Error(
            `Public text must not mention MF2, Module Federation 2 or a site domain other than ` +
                `www.fynmesh.fyi. Found in:\n` +
                bad.map(n => `    ${n}`).join("\n"),
        );
    }
}
