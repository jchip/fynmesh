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
const SITE_SECTIONS = new Set(["demo", "shell", "fynops", "features", "docs", "guides"]);

export interface DocEntry {
    slug: string;
    /** repo-relative source file */
    source: string;
    title: string;
    pageName: string;
    metaDescription: string;
}

export const DOCS: DocEntry[] = [
    {
        slug: "getting-started",
        source: "dev-tools/create-fynapp/README.md",
        title: "Getting Started: Create a FynApp",
        pageName: "Getting Started",
        metaDescription:
            "Scaffold a FynApp with create-fynapp, run it next to other apps, and ship it. " +
            "The quickest path from an empty folder to a working micro frontend.",
    },
    {
        slug: "fynapp-guide",
        source: "dev-tools/create-fynapp/agent/GUIDE.md",
        title: "FynApp Guide: Create or Modify an App",
        pageName: "FynApp Guide",
        metaDescription:
            "A step by step guide to create a new FynApp or change an existing one. " +
            "It is written for developers and for coding agents that follow the FynApp contract.",
    },
    {
        slug: "fynapp-contract",
        source: "dev-tools/create-fynapp/agent/CONTRACT.md",
        title: "The FynApp Contract",
        pageName: "FynApp Contract",
        metaDescription:
            "The rules every FynApp follows: exports, lifecycle, shared dependencies and " +
            "middleware. Read it before you write an app or ask an agent to write one.",
    },
    {
        slug: "kernel",
        source: "core/kernel/README.md",
        title: "FynMesh Kernel API and Concepts",
        pageName: "Kernel",
        metaDescription:
            "How the FynMesh kernel loads FynApps, runs their lifecycle, wires middleware and " +
            "connects apps with FynBus. API reference with the core concepts.",
    },
    {
        slug: "federation-js",
        source: "rollup-federation/federation-js/README.md",
        title: "federation-js: Runtime Module Federation",
        pageName: "federation-js",
        metaDescription:
            "federation-js is the small runtime that loads federated modules in the browser. " +
            "It resolves shared dependencies by semver range, so versions can coexist.",
    },
    {
        slug: "rollup-plugin-federation",
        source: "rollup-federation/rollup-plugin-federation/README.md",
        title: "rollup-plugin-federation: Module Federation for Rollup",
        pageName: "rollup-plugin-federation",
        metaDescription:
            "Configure the Rollup plugin that builds FynApps: what to expose, what to share, " +
            "and how version ranges decide which copy of a library each app gets.",
    },
    {
        slug: "federation-inspector",
        source: "dev-tools/federation-inspector/README.md",
        title: "Federation Inspector: Debug Shared Modules",
        pageName: "Federation Inspector",
        metaDescription:
            "A browser tool that shows which shared modules each app loaded and which version " +
            "won. Use it to debug dependency sharing on a live page.",
    },
    {
        slug: "changelog",
        source: "CHANGELOG.md",
        title: "FynMesh Changelog and Release Notes",
        pageName: "Changelog",
        metaDescription:
            "Release notes for FynMesh packages, grouped by date. Each entry lists the " +
            "published package versions and the changes behind them.",
    },
];

export type ContentKind = "docs" | "guides";

export const SECTION_INTRO: Record<ContentKind, string> = {
    docs:
        "Reference docs for the FynMesh kernel, the federation runtime and the Rollup plugin. " +
        "Start with Getting Started to scaffold an app. The FynApp contract lists the rules " +
        "every app follows. The changelog tracks each release.",
    guides:
        "Short how-tos for common micro frontend problems. Each guide starts with the direct " +
        "answer, then shows how it works in FynMesh.",
};

export interface TocEntry {
    id: string;
    text: string;
}

export interface ContentPage {
    kind: ContentKind;
    slug: string;
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
    entry: { slug: string; title: string; pageName: string; description: string; source: string },
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
    const canonicalPath = `${kind}/${entry.slug}`;
    const dateModified = gitDate(sourceAbs) || now.toISOString();
    return {
        kind,
        slug: entry.slug,
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
        seo: {
            canonicalPath,
            title: entry.title,
            pageName: entry.pageName,
            metaDescription: entry.description,
            crumbs: [{ name: kind === "docs" ? "Docs" : "Guides", path: kind }],
            schemaType: "TechArticle",
            headline: entry.title,
            dateModified,
        },
    };
}

/** All docs, then all guides, rendered with links for the given build. */
export function loadContentPages(options: ContentOptions): ContentPage[] {
    const repoRoot = options.repoRoot ?? REPO_ROOT;
    const contentDir = options.contentDir ?? CONTENT_DIR;
    const now = options.now ?? new Date();
    const opts = { pathPrefix: options.pathPrefix, htmlExt: options.htmlExt, repoRoot };
    const docBySource = new Map(DOCS.map(d => [d.source, d.slug]));
    const pages: ContentPage[] = [];

    for (const doc of DOCS) {
        const abs = path.join(repoRoot, doc.source);
        if (!existsSync(abs)) throw new Error(`doc source missing: ${doc.source}`);
        let body = readFileSync(abs, "utf8");
        const isChangelog = doc.slug === "changelog";
        if (isChangelog) body = filterChangelog(body);
        pages.push(
            makePage(
                "docs",
                { ...doc, description: doc.metaDescription },
                body,
                opts,
                docBySource,
                isChangelog,
                now,
            ),
        );
    }

    const guidesDir = path.join(contentDir, "guides");
    const files = existsSync(guidesDir)
        ? readdirSync(guidesDir)
              .filter(f => f.endsWith(".md"))
              .sort()
        : [];
    const guides: ContentPage[] = [];
    for (const file of files) {
        const slug = file.replace(/\.md$/, "");
        const { meta, body } = parseFrontMatter(readFileSync(path.join(guidesDir, file), "utf8"));
        const title = meta.title || slug;
        const source = path.relative(repoRoot, path.join(guidesDir, file)).split(path.sep).join("/");
        guides.push(
            makePage(
                "guides",
                {
                    slug,
                    title,
                    pageName: meta.pageName || title,
                    description: meta.description || title,
                    source,
                },
                body,
                opts,
                docBySource,
                false,
                now,
            ),
        );
    }
    guides.sort((a, b) => a.title.localeCompare(b.title));
    return [...pages, ...guides];
}

/**
 * Write docs.html, guides.html and every docs/ and guides/ page into
 * `outputDir`. Fails when any page mentions a term that must stay out of
 * public text.
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

    for (const page of pages) {
        const siblings = pages.filter(p => p.kind === page.kind);
        const other = page.kind === "docs" ? "guides" : "docs";
        write(
            `${page.canonicalPath}.html`,
            env.render("pages/content.html", {
                ...base,
                ...pageSeo(page.seo),
                sectionName: page.kind === "docs" ? "Docs" : "Guides",
                sectionHref: `${pathPrefix}${page.kind}${htmlExt}`,
                otherName: other === "docs" ? "Docs" : "Guides",
                otherHref: `${pathPrefix}${other}${htmlExt}`,
                lede: page.description,
                toc: page.toc,
                body: page.bodyHtml,
                source: page.source,
                isChangelog: page.slug === "changelog",
                sourceUrl: `${GITHUB_URL}/${page.slug === "changelog" ? "blob" : "edit"}/main/${page.source}`,
                related: siblings.map(p => ({
                    title: p.pageName,
                    href: hrefOf(p),
                    current: p.slug === page.slug,
                })),
            }),
        );
    }

    for (const kind of ["docs", "guides"] as const) {
        write(
            `${kind}.html`,
            env.render("pages/section-index.html", {
                ...base,
                ...pageSeo(kind),
                heading: kind === "docs" ? "Docs" : "Guides",
                intro: SECTION_INTRO[kind],
                cards: pages
                    .filter(p => p.kind === kind)
                    .map(p => ({ title: p.title, description: p.description, href: hrefOf(p) })),
                emptyText: "No guides yet. Check back soon.",
            }),
        );
    }

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
