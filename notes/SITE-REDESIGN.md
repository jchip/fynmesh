# fynmesh.fyi redesign

Approved 2026-10-24. Mockup: https://claude.ai/artifact/RfYmjXqLgtntHEB8tidPNT

## Site map

| Page | Url | Holds |
| --- | --- | --- |
| Home | `/` | Hero, what makes FynMesh different, how it works in four steps, demos strip, top four questions |
| Why FynMesh | `/why-fynmesh` | The differences that matter, and when FynMesh may not fit |
| How it works | `/how-it-works` | Build, manifest, resolver, loading, shared modules, boot, lifecycle, middleware, FynBus |
| Features | `/features` | Feature tour, restyled on the shared tokens |
| Docs | `/docs`, `/docs/*` | Start, Concepts, Reference, Changelog |
| API | `/api/` | TypeDoc HTML for every published package that ships types |
| Guides | `/guides`, `/guides/*` | Five task guides |
| Demos | `/demos` | Launch page: what each demo shows and what to try |
| Demo apps | `/demo`, `/shell`, `/fynops` | The app only, plus a FynMesh logo at the top left that goes home |
| FAQ | `/faq` | All questions, grouped, each with an anchor |

Every url that was already published keeps its address.

## Design system

One stylesheet, `public/site.css`, holds the tokens and every shared component. Pages do not define their own colors or type.

- Color: ink `#0f172a` (header, footer, code), navy `#1e3a5f` (hero), blue `#2563eb` (links, primary), amber `#fbbf24` (brand mark only), surface `#f8fafc`, text `#1f2937`, muted `#475569`, border `#e2e8f0`.
- Type: system sans and system mono. Display 48, H1 36, H2 26, H3 19, body 17 / 1.7.
- Spacing 8 to 96. Radius 8 for cards and code, 6 for buttons. Content width 1120, reading width 720.

## Templates

- Shared header (nav: Why FynMesh, How it works, Features, Docs, Guides, Demos, FAQ) and footer, on every page except the demo apps.
- Floating GitHub icon on every page except the demo apps.
- Prose: sidebar, article, "On this page" rail. Docs, guides, why, how, FAQ.
- Section index: grouped cards. `/docs`, `/guides`.
- Demos launch page.
- Demo apps: no site chrome.

## Docs sources

- Narrative pages render from package READMEs at build time. Fix the README when the page is wrong.
- API reference is TypeDoc HTML, one run in packages mode, the way `~/dev/fynjs/site/build.mjs` does it. `navigationLinks` lead back to the site, and `customCss` applies the site tokens.
- Getting Started and the concept pages are READMEs too, ordered by the docs registry.

## Copy rules

Plain and concrete. FynMesh is "an open source micro frontend framework built on Module Federation and Rollup". Running several versions of one app is one feature, not the headline. Differences are stated on their own merits, never against another tool.
