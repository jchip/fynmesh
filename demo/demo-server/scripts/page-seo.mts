/**
 * Per-page SEO identity, owned in one place.
 *
 * Two builds render the same four templates: `build-demo-site.mts` produces the
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
 * `/demo.html` -> `/demo`; `""` is the site root. Pages that omit the social and
 * description fields inherit base's defaults deliberately -- those defaults are
 * the homepage's own copy, so repeating them here would be duplication, not
 * configuration.
 */

/** Origin the deployed site is served from; the base of every canonical url. */
export const SITE_ORIGIN = "https://www.fynmesh.fyi";

/**
 * The SEO half of a page's render context.
 *
 * Deliberately carries no `title`: the demo page's comes from
 * `getDemoTemplateData`, and the shell's is hardcoded in its own
 * `{% block title %}`. Owning it here too would give two places the chance to
 * disagree, which is the problem this module exists to remove.
 */
export interface PageSeo {
    /** Extensionless path for canonical / og:url / twitter:url. `""` is root. */
    canonicalPath: string;
    /** Social title; falls back to base's default when omitted. */
    ogTitle?: string;
    /** Social description; falls back to base's default when omitted. */
    ogDescription?: string;
    /** `<meta name="description">`; falls back to base's default when omitted. */
    metaDescription?: string;
}

export const PAGE_SEO = {
    landing: {
        canonicalPath: "",
    },
    // Claims no canonical of its own: base's `canonical` block is overridden to
    // empty in pages/404.html, so this only keeps og:url / twitter:url resolving
    // to the site root rather than to a not-found path.
    notFound: {
        canonicalPath: "",
    },
    demo: {
        canonicalPath: "demo",
        ogTitle: "FynMesh Demo - Six Frameworks, One Page",
        ogDescription:
            "A live micro frontend demo: React, Vue, Preact, Solid, Svelte and Marko apps " +
            "loaded independently into one page, sharing dependencies through Module Federation.",
        metaDescription:
            "Live FynMesh demo running React, Vue, Preact, Solid, Svelte and Marko micro " +
            "frontends together on one page, sharing dependencies through Module Federation " +
            "with independent deployment.",
    },
    features: {
        canonicalPath: "features",
        ogTitle: "FynMesh + federation-js at a Glance",
        ogDescription:
            "A quick visual tour of FynMesh and federation-js: multiple versions of the same app " +
            "on one page, semver-range sharing, any framework, ordered boot and middleware.",
        metaDescription:
            "FynMesh features: run multiple versions of the same micro frontend side by side, " +
            "share dependencies by semver range, and mix React, Vue, Preact, Solid, Svelte " +
            "and Marko on one small loader.",
    },
    shell: {
        canonicalPath: "shell",
        ogTitle: "FynMesh Shell Demo - Middleware-Driven Layout",
        ogDescription:
            "A micro frontend shell that composes its layout from independently deployed " +
            "FynApps using FynMesh middleware and Module Federation.",
        metaDescription:
            "FynMesh shell demo: a middleware-driven micro frontend layout composed from " +
            "independently deployed FynApps using Module Federation with Rollup.",
    },
} satisfies Record<string, PageSeo>;

/**
 * A page's SEO context, ready to spread into a nunjucks render.
 *
 * @param page which page to describe
 * @returns the page's SEO fields plus the shared `siteOrigin`
 */
export function pageSeo(page: keyof typeof PAGE_SEO): PageSeo & { siteOrigin: string } {
    return { ...PAGE_SEO[page], siteOrigin: SITE_ORIGIN };
}
