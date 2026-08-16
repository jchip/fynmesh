/**
 * Where the combined-bundle declaration lands in the shell page.
 *
 * Placement is the whole point. The declaration has to run after federation-js
 * has created the global, or it throws, and before the loader starts pulling
 * FynApps, or it is too late to affect anything — between those two script tags
 * is the only correct place, and nothing in the template makes that self-evident.
 */
import { describe, it, expect } from "vitest";
import nunjucks from "nunjucks";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const templateDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../templates"
);

type BundleMaps = Array<{ base: string; bundles: Record<string, string[]> }>;
type PreloadHints = Array<{ href: string; priority?: "low" }>;

function shell(
    bundleMaps: BundleMaps,
    isProduction = false,
    preloadModules: PreloadHints = []
): string {
    const env = nunjucks.configure(templateDir, { autoescape: true, noCache: true });
    return env.render("pages/shell.html", {
        title: "FynMesh Shell Demo",
        isProduction,
        pathPrefix: "/",
        preloadModules,
        bundleMaps,
    });
}

const MAPS: BundleMaps = [
    {
        base: "/fynapp-1/dist/",
        bundles: { "combo-CCCCCCCC.js": ["hello-AAAAAAAA.js", "getInfo-BBBBBBBB.js"] },
    },
];

const preloadLinks = (html: string): string[] =>
    html.match(/<link rel="preload" as="script"[^>]*>/g) ?? [];

describe("the shell's bundle-map declaration", () => {
    it("declares an app's map against its dist base", () => {
        expect(shell(MAPS)).toContain(
            'Federation.declareBundles({"combo-CCCCCCCC.js":["hello-AAAAAAAA.js","getInfo-BBBBBBBB.js"]}, "/fynapp-1/dist/");'
        );
    });

    it("runs after federation-js and before the first FynApp is loaded", () => {
        const html = shell(MAPS);

        const federation = html.indexOf("federation-js.dev.js");
        const declare = html.indexOf("Federation.declareBundles");
        const firstLoad = html.indexOf("fynMeshKernel.loadFynApp");

        expect(federation).toBeGreaterThan(-1);
        expect(firstLoad).toBeGreaterThan(-1);
        expect(declare).toBeGreaterThan(federation);
        expect(firstLoad).toBeGreaterThan(declare);
    });

    it("keeps that order in the production script set too", () => {
        const html = shell(MAPS, true);

        expect(html.indexOf("Federation.declareBundles")).toBeGreaterThan(
            html.indexOf("federation-js.min.js")
        );
        expect(html.indexOf("fynMeshKernel.loadFynApp")).toBeGreaterThan(
            html.indexOf("Federation.declareBundles")
        );
    });

    it("guards the call, because FEDERATION=standard serves a loader without it", () => {
        expect(shell(MAPS)).toContain("if (Federation.declareBundles)");
    });

    it("emits nothing at all when no startup app was combined", () => {
        expect(shell([])).not.toContain("declareBundles");
    });
});

describe("the shell's preload hints", () => {
    it("renders low-priority hints as classic-script preloads", () => {
        const html = shell([], false, [
            { href: "/fynapp-react-18/dist/fynapp-entry.js", priority: "low" },
        ]);
        const links = preloadLinks(html);

        expect(links).toContain(
            '<link rel="preload" as="script" href="/fynapp-react-18/dist/fynapp-entry.js" fetchpriority="low">'
        );
        expect(html).not.toContain('rel="modulepreload"');
        expect(links.join("\n")).not.toContain("crossorigin");
    });

    it("omits fetchpriority from critical-path hints", () => {
        const html = shell([], false, [
            { href: "/fynapp-react-19/dist/fynapp-entry.js" },
        ]);
        const links = preloadLinks(html);

        expect(links).toContain(
            '<link rel="preload" as="script" href="/fynapp-react-19/dist/fynapp-entry.js">'
        );
        expect(links.join("\n")).not.toContain("fetchpriority=");
    });
});
