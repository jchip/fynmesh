import { readFileSync } from "node:fs";

/**
 * Per-page SEO identity, owned in one place.
 *
 * Two builds render the same templates: `build-demo-site.mts` produces the
 * deployed site, and `build-templates.mts` produces the dev server's `public/`.
 * These values used to live only in the former, so every dev-server page fell
 * back to `layouts/base.html`'s generic defaults and claimed a canonical of the
 * site root -- the two render paths silently disagreed about what each page is.
 *
 * That drift is the same failure that let `pages/shell.html` sit outside the
 * base layout and quietly miss its Schema.org blocks. One definition, imported
 * by both builds, is the fix for the class rather than the instance.
 *
 * `canonicalPath` is the EXTENSIONLESS form, because Cloudflare Pages 308s
 * `/demo.html` -> `/demo`; `""` is the site root.
 */

/** Origin the deployed site is served from; the base of every canonical url. */
export const SITE_ORIGIN = "https://www.fynmesh.fyi";

export const GITHUB_URL = "https://github.com/jchip/fynmesh";
export const NPM_URL = "https://www.npmjs.com/package/@fynmesh/kernel";

/**
 * The one sentence that says what FynMesh is. Descriptions, JSON-LD,
 * llms.txt and the footer all reuse it, so search engines and AI answer
 * engines see the same claim everywhere.
 */
export const SITE_DEFINITION =
    "FynMesh is an open source micro frontend framework built on Module Federation and Rollup.";

const kernelPkg = JSON.parse(
    readFileSync(new URL("../../../core/kernel/package.json", import.meta.url), "utf8"),
);

/** The released kernel version, stamped into the site's structured data. */
export const KERNEL_VERSION: string = kernelPkg.version;

/** A breadcrumb step above the current page. `path` is extensionless. */
export interface Crumb {
    name: string;
    path: string;
}

/**
 * The SEO half of a page's render context.
 *
 * `title` is the `<title>`. Social titles default to it, so the two cannot
 * drift apart the way they did when each template set its own.
 */
export interface PageSeo {
    /** Extensionless path for canonical / og:url / twitter:url. `""` is root. */
    canonicalPath: string;
    /** `<title>`. Keep it under 60 characters. */
    title: string;
    /** Short page name for breadcrumbs and the WebPage node. */
    pageName: string;
    /** Pages between home and this one, for BreadcrumbList. */
    crumbs?: Crumb[];
    /** Social title; defaults to `title`. */
    ogTitle?: string;
    /** Social description; defaults to `metaDescription`. */
    ogDescription?: string;
    /** `<meta name="description">`. Keep it near 155 characters. */
    metaDescription: string;
    /** Schema.org type of the page node: WebPage by default. */
    schemaType?: string;
    /** Extra JSON-LD nodes for this page, e.g. a TechArticle or FAQPage. */
    schemaExtra?: Record<string, unknown>[];
    /** Article headline; set on TechArticle pages. */
    headline?: string;
    /** ISO date of the last change to the page's source. */
    dateModified?: string;
    /** Extra properties on the page node itself, e.g. an FAQPage's mainEntity. */
    pageProps?: Record<string, unknown>;
    /** Set on pages that must not be indexed (the 404). */
    noindex?: boolean;
}

export const PAGE_SEO = {
    landing: {
        canonicalPath: "",
        title: "FynMesh: Micro Frontends with Module Federation",
        pageName: "FynMesh",
        metaDescription:
            "FynMesh is an open source micro frontend framework built on Module Federation and " +
            "Rollup. Apps join a page by loading and are addressed by name and version range.",
    },
    // Claims no canonical of its own and is noindex; this only keeps og:url
    // resolving to the site root rather than to a not-found path.
    notFound: {
        canonicalPath: "",
        title: "Page Not Found | FynMesh",
        pageName: "Page Not Found",
        metaDescription: "This page does not exist. Find FynMesh docs, guides and live demos here.",
        noindex: true,
    },
    demo: {
        canonicalPath: "demo",
        title: "FynMesh Demo: Six Frameworks on One Page",
        pageName: "Six frameworks",
        crumbs: [{ name: "Demos", path: "demos" }],
        metaDescription:
            "Live FynMesh demo: thirteen FynApps written in React, Vue, Preact, Solid, Svelte " +
            "and Marko load into one page and share dependencies at runtime.",
    },
    features: {
        canonicalPath: "features",
        title: "FynMesh Features: Module Federation for Micro Frontends",
        pageName: "Features",
        metaDescription:
            "What FynMesh does: apps that join by loading, version-range addressing, semver " +
            "sharing, ordered boot, lifecycle, middleware, FynBus and the Federation Inspector.",
    },
    shell: {
        canonicalPath: "shell",
        title: "FynMesh Shell Demo: Middleware-Driven Micro Frontend Layout",
        pageName: "Shell layout",
        crumbs: [{ name: "Demos", path: "demos" }],
        metaDescription:
            "FynMesh shell demo: a micro frontend layout composed at runtime from independently " +
            "deployed FynApps, using FynMesh middleware and Module Federation.",
    },
    fynops: {
        canonicalPath: "fynops",
        title: "FynOps: A Logistics Console Built from FynApps",
        pageName: "FynOps",
        crumbs: [{ name: "Demos", path: "demos" }],
        metaDescription:
            "FynOps is a FynMesh demo app: a logistics console built from ten FynApps that load " +
            "per route and share React, AG Grid and ECharts at runtime.",
    },
    legacyAmd: {
        canonicalPath: "legacy-amd",
        title: "FynMesh Demo: Legacy RequireJS Widgets on Federated React",
        pageName: "Legacy RequireJS widgets",
        crumbs: [{ name: "Demos", path: "demos" }],
        metaDescription:
            "Webpack AMD widgets loaded by RequireJS get React and their UI kit from Module " +
            "Federation through a bridge FynApp, with no rebuild, and share React with FynApps.",
    },
    docs: {
        canonicalPath: "docs",
        title: "FynMesh Docs: Kernel, Federation and Tooling",
        pageName: "Docs",
        schemaType: "CollectionPage",
        metaDescription:
            "FynMesh docs: getting started, the FynApp contract, reference for the kernel, " +
            "federation-js, the Rollup plugin and the inspector, and the release notes.",
    },
    guides: {
        canonicalPath: "guides",
        title: "FynMesh Guides: Micro Frontend How-Tos",
        pageName: "Guides",
        schemaType: "CollectionPage",
        metaDescription:
            "FynMesh guides: share dependencies by semver range, run two React versions, " +
            "upgrade one app at a time, and build micro frontends with Rollup.",
    },
    demos: {
        canonicalPath: "demos",
        title: "FynMesh Demos: Live Micro Frontend Examples",
        pageName: "Demos",
        schemaType: "CollectionPage",
        metaDescription:
            "Live FynMesh demos: six frameworks on one page, a middleware-driven shell, the " +
            "FynOps logistics console, the Perf Lab load analysis and legacy RequireJS widgets.",
    },
} satisfies Record<string, PageSeo>;

/** Absolute url of an extensionless site path; `""` is the root. */
export function siteUrl(path: string): string {
    return `${SITE_ORIGIN}/${path}`;
}

/**
 * The page's JSON-LD as one `@graph`: the site, the software, this page, and
 * its breadcrumbs. Built here rather than templated so the JSON is always
 * valid and escaped.
 */
export function buildJsonLd(seo: PageSeo): string {
    const pageUrl = siteUrl(seo.canonicalPath);
    const siteId = `${SITE_ORIGIN}/#website`;
    const softwareId = `${SITE_ORIGIN}/#software`;
    const graph: Record<string, unknown>[] = [
        {
            "@type": "WebSite",
            "@id": siteId,
            name: "FynMesh",
            url: `${SITE_ORIGIN}/`,
            description: SITE_DEFINITION,
            inLanguage: "en",
        },
        {
            "@type": ["SoftwareApplication", "SoftwareSourceCode"],
            "@id": softwareId,
            name: "FynMesh",
            description: SITE_DEFINITION,
            url: `${SITE_ORIGIN}/`,
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Web",
            softwareVersion: KERNEL_VERSION,
            programmingLanguage: "TypeScript",
            codeRepository: GITHUB_URL,
            license: "https://www.apache.org/licenses/LICENSE-2.0",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            sameAs: [GITHUB_URL, NPM_URL],
            image: `${SITE_ORIGIN}/og-image.png`,
            keywords:
                "micro frontend, microfrontend, module federation, rollup, multiple versions, " +
                "shared dependencies, semver, react, vue, preact, solid, svelte, marko",
        },
    ];

    if (!seo.noindex) {
        const page: Record<string, unknown> = {
            "@type": seo.schemaType ?? "WebPage",
            "@id": `${pageUrl}#webpage`,
            url: pageUrl,
            name: seo.title,
            description: seo.metaDescription,
            isPartOf: { "@id": siteId },
            about: { "@id": softwareId },
            inLanguage: "en",
        };
        if (seo.headline) page.headline = seo.headline;
        if (seo.dateModified) page.dateModified = seo.dateModified;
        Object.assign(page, seo.pageProps);
        if (seo.schemaType === "TechArticle") {
            const org = { "@type": "Organization", name: "FynMesh", url: `${SITE_ORIGIN}/` };
            page.author = org;
            page.publisher = org;
        }
        if (seo.canonicalPath) {
            const steps = [
                { name: "Home", path: "" },
                ...(seo.crumbs ?? []),
                { name: seo.pageName, path: seo.canonicalPath },
            ];
            page.breadcrumb = {
                "@type": "BreadcrumbList",
                itemListElement: steps.map((step, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    name: step.name,
                    item: siteUrl(step.path),
                })),
            };
        }
        graph.push(page, ...(seo.schemaExtra ?? []));
    }

    // `<` escaped so no string in the data can close the script element
    return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2).replace(
        /</g,
        "\\u003c",
    );
}

/** What a page's render context gets from its SEO identity. */
export type PageSeoContext = PageSeo & {
    siteOrigin: string;
    siteDefinition: string;
    githubUrl: string;
    npmUrl: string;
    jsonLd: string;
};

/**
 * A page's SEO context, ready to spread into a nunjucks render.
 *
 * @param seo a `PAGE_SEO` key, or a full `PageSeo` for generated pages (docs, guides)
 */
export function pageSeo(seo: keyof typeof PAGE_SEO | PageSeo): PageSeoContext {
    const entry: PageSeo = typeof seo === "string" ? PAGE_SEO[seo] : seo;
    return {
        ...entry,
        siteOrigin: SITE_ORIGIN,
        siteDefinition: SITE_DEFINITION,
        githubUrl: GITHUB_URL,
        npmUrl: NPM_URL,
        jsonLd: buildJsonLd(entry),
    };
}
