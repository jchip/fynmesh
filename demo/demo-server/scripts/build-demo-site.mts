
import nunjucks from "nunjucks";
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { collectShellPreloadModules } from "./shell-preload.mts";
import { generateCacheHeaders } from "./cache-headers.mts";
import { resolveLoaderVariant } from "../src/loader-variant.ts";

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Options for building the demo site
 */
interface BuildDemoSiteOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Path prefix for deployment (e.g., "/" for the custom domain root) */
    pathPrefix?: string;
    /** Output directory for built files */
    outputDir?: string;
    /** Template directory */
    templateDir?: string;
}

/**
 * Recursively copy directory with file filtering
 */
function copyDirFiltered(src: string, dest: string, filter: (file: string) => boolean) {
    if (!existsSync(src)) return;
    
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }
    
    const entries = readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirFiltered(srcPath, destPath, filter);
        } else if (filter(entry.name)) {
            writeFileSync(destPath, readFileSync(srcPath));
        }
    }
}

/**
 * Verify every local asset a generated page references actually shipped.
 *
 * A missing file is not a soft failure in production: Cloudflare Pages answers
 * an unknown path with its HTML 404 body, so the browser gets `text/html` for
 * a `.js` request and refuses it on MIME grounds. The page then dies on an
 * undefined global far from the real cause. Fail the build instead.
 *
 * @returns list of `page -> missing ref` descriptions (empty when all resolve)
 */
function findMissingLocalRefs(outputDir: string, pathPrefix: string): string[] {
    const missing: string[] = [];
    const pages = readdirSync(outputDir).filter(f => f.endsWith(".html"));

    for (const page of pages) {
        const html = readFileSync(path.join(outputDir, page), "utf8");
        const refs = new Set<string>();

        for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
            // Skip absolute URLs, protocol-relative, data/mailto, and fragments
            if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
            refs.add(ref.split(/[?#]/)[0]);
        }

        for (const ref of refs) {
            if (!ref) continue;
            const rel = ref.startsWith(pathPrefix)
                ? ref.slice(pathPrefix.length)
                : ref.replace(/^\//, "");
            if (!existsSync(path.join(outputDir, rel))) {
                missing.push(`${page} -> ${ref}`);
            }
        }
    }

    return missing;
}

/**
 * Build the demo site with configurable path prefix
 */
async function buildDemoSite(options: BuildDemoSiteOptions = {}): Promise<boolean> {
    const {
        verbose = false,
        pathPrefix = process.env.PATH_PREFIX || "/",
        outputDir = path.join(__dirname, "../public"),
        templateDir = path.join(__dirname, "../templates")
    } = options;

    const isProduction = process.env.NODE_ENV === "production";

    const log = (message: string) => {
        if (verbose) {
            console.log(`[Build Demo Site] ${message}`);
        }
    };

    try {
        log(`Starting build with path prefix: "${pathPrefix}"`);

        // Configure Nunjucks
        const env = nunjucks.configure(templateDir, {
            autoescape: true,
            noCache: process.env.NODE_ENV !== "production",
        });

        // Template data
        const templateData = {
            title: "FynMesh Micro Frontend Demo",
            isProduction,
            pathPrefix,
            features: {
                "react-18": true,
                "react-19": true,
                "fynapp-1": true,
                "fynapp-1-b": true,
                "fynapp-2-react18": true,
                "fynapp-3-marko": true,
                "fynapp-4-vue": true,
                "fynapp-5-preact": true,
                "fynapp-6-react": true,
                "fynapp-7-solid": true,
                "fynapp-8-svelte": true,
                "design-tokens": true,
            },
            fynApps: [
                {
                    id: "fynapp-1",
                    name: "FynApp 1 (React 19)",
                    framework: "React 19",
                    color: "fynapp-1",
                    badge: "primary",
                },
                {
                    id: "fynapp-1-b",
                    name: "FynApp 1-B (React 19)",
                    framework: "React 19",
                    color: "fynapp-1-b",
                    badge: "success",
                },
                {
                    id: "fynapp-2-react18",
                    name: "FynApp 2",
                    framework: "React 18",
                    color: "fynapp-2",
                    badge: "secondary",
                },
                {
                    id: "fynapp-6-react",
                    name: "FynApp 6",
                    framework: "React",
                    color: "fynapp-6",
                    badge: "info",
                },
                {
                    id: "fynapp-5-preact",
                    name: "FynApp 5",
                    framework: "Preact",
                    color: "fynapp-5",
                    badge: "warning",
                },
                {
                    id: "fynapp-7-solid",
                    name: "FynApp 7",
                    framework: "Solid",
                    color: "fynapp-7",
                    badge: "primary",
                },
                {
                    id: "fynapp-8-svelte",
                    name: "FynApp 8",
                    framework: "Svelte",
                    color: "fynapp-8",
                    badge: "error",
                },
                { id: "fynapp-4-vue", name: "FynApp 4", framework: "Vue", color: "fynapp-4", badge: "success" },
                {
                    id: "fynapp-3-marko",
                    name: "FynApp 3",
                    framework: "Marko",
                    color: "fynapp-3",
                    badge: "warning",
                },
            ],
            infoCards: [
                {
                    icon: "bi-boxes",
                    title: "Independent Deployment",
                    description:
                        "Each micro-frontend can be developed and deployed independently by different teams.",
                    color: "primary",
                },
                {
                    icon: "bi-code-square",
                    title: "Module Federation",
                    description:
                        "Share code and dependencies between applications at runtime using Module Federation.",
                    color: "secondary",
                },
                {
                    icon: "bi-lightning-charge",
                    title: "Multi-Framework",
                    description: "Support for React, Vue, Preact, Solid, Svelte, and Marko frameworks running together.",
                    color: "success",
                },
            ],
        };

        log("Rendering templates...");

        // Ensure output directory exists
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
            log(`Created output directory: ${outputDir}`);
        }

        // Build the landing page (index.html)
        const landingHtml = env.render("pages/landing.html", {
            title: "FynMesh - Enterprise Micro Frontend Framework",
            isProduction,
            pathPrefix,
        });
        const landingOutputPath = path.join(outputDir, "index.html");
        writeFileSync(landingOutputPath, landingHtml);
        log("📄 Generated: " + landingOutputPath);

        // Build the demo page (demo.html)
        const demoHtml = env.render("pages/demo.html", templateData);
        const demoOutputPath = path.join(outputDir, "demo.html");
        writeFileSync(demoOutputPath, demoHtml);
        log("📄 Generated: " + demoOutputPath);

        // Build the shell page (shell.html).
        // The preload hints collapse the shell's startup request waterfall; see
        // scripts/shell-preload.mts and notes/SHELL_LOAD_PERF.md.
        const preloadModules = collectShellPreloadModules(
            path.join(__dirname, "../.."),
            pathPrefix,
            msg => log(`⚠️  preload: ${msg}`)
        );
        log(`🔗 Shell modulepreload hints: ${preloadModules.length}`);
        const shellHtml = env.render("pages/shell.html", {
            title: "FynMesh Shell Demo",
            isProduction,
            pathPrefix,
            preloadModules,
        });
        const shellOutputPath = path.join(outputDir, "shell.html");
        writeFileSync(shellOutputPath, shellHtml);
        log("📄 Generated: " + shellOutputPath);

        // Copy all required static assets (skip index.html since we build it directly)
        log("📁 Copying static assets...");

        // Copy static files from public directory
        let staticFiles = [
            // No page registers a service worker any more, but sw.js must keep
            // shipping: a caching service worker was deployed here previously,
            // and sw.js is the unregister stub that tears it down. Browsers
            // re-fetch the script on navigation for clients that still have one
            // active, so those self-heal without a registration call. Removing
            // this file would strand them on a stale worker permanently.
            "sw.js",
            "lazy-loader.js",  // Defines LazyLoader, used by the demo page's fynapp loader
            "favicon.ico",     // Favicon
            "sitemap.xml",     // SEO: XML Sitemap
            "robots.txt"       // SEO: Robots.txt
            // Note: shell.html is now generated from template
        ];
        
        // In production, exclude .map files
        if (isProduction) {
            staticFiles = staticFiles.filter(f => !f.endsWith('.map'));
        }
        
        const publicDir = path.join(__dirname, "../public");
        staticFiles.forEach(file => {
            const src = path.join(publicDir, file);
            const dest = path.join(outputDir, file);
            if (existsSync(src)) {
                writeFileSync(dest, readFileSync(src));
                log(`📄 Copied: ${file}`);
            }
        });

        // The loader ships from the FEDERATION variant (fork by default), the
        // same source the dev server mounts -- never from public/ or from
        // node_modules/federation-js, which is whatever `fyn install` happened
        // to lay down. system.js and federation-js are one unit and always ship
        // together; see src/loader-variant.ts.
        const loader = resolveLoaderVariant(log);
        ["system.js", "system.min.js", "system.min.js.map"]
            .filter(file => !(isProduction && file.endsWith(".map")))
            .forEach(file => {
                const src = path.join(loader.systemDir, file);
                if (existsSync(src)) {
                    writeFileSync(path.join(outputDir, file), readFileSync(src));
                    log(`📄 Copied: ${file} (${loader.name})`);
                }
            });

        // Note: no CNAME file — Cloudflare Pages configures the custom domain
        // (www.lm360.ai) in its dashboard, so a CNAME file is not used.

        // Copy Google verification file
        const googleVerifySource = path.join(__dirname, "../googlee9bcb5713536aa25.html");
        if (existsSync(googleVerifySource)) {
            const googleVerifyDest = path.join(outputDir, "googlee9bcb5713536aa25.html");
            writeFileSync(googleVerifyDest, readFileSync(googleVerifySource));
            log(`📄 Copied: googlee9bcb5713536aa25.html (Google verification)`);
        }

        // Copy dist directories from various packages
        const packages = [
            // node_modules packages (federation-js is not here: it ships from
            // the loader variant, paired with the system.js copied above)
            { name: "spectre.css", basePath: path.join(__dirname, "../node_modules") },
            // core packages
            { name: "kernel", basePath: path.join(__dirname, "../../../core") },
            // demo packages
            { name: "fynapp-1", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-1-b", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-2-react18", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-3-marko", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-4-vue", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-5-preact", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-6-react", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-7-solid", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-8-svelte", basePath: path.join(__dirname, "../..") },
            // sidebar-selectable apps + AG Grid shared library dependency
            { name: "fynapp-ag-grid", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-ag-grid-lib", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-notes", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-x1-v1", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-x1-v2", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-18", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-19", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-middleware", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-design-tokens", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-shell-mw", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-sidebar", basePath: path.join(__dirname, "../..") }
        ];

        // Define file filter based on production mode
        const fileFilter = (fileName: string) => {
            // In production, exclude .d.ts and .map files
            if (isProduction) {
                if (fileName.endsWith('.d.ts') || fileName.endsWith('.map')) {
                    return false;
                }
            }
            return true;
        };

        // Special filter for federation-js: only .min.js in production
        const federationFilter = (fileName: string) => {
            if (isProduction) {
                // Only include .min.js files in production
                if (fileName.endsWith('.js') && !fileName.endsWith('.min.js')) {
                    return false;
                }
                // Exclude .d.ts and .map files
                if (fileName.endsWith('.d.ts') || fileName.endsWith('.map')) {
                    return false;
                }
            }
            return true;
        };

        packages.forEach(pkg => {
            const srcDist = path.join(pkg.basePath, pkg.name, "dist");
            const dest = path.join(outputDir, pkg.name, "dist");
            if (existsSync(srcDist)) {
                copyDirFiltered(srcDist, dest, fileFilter);
                log(`📁 Copied: ${pkg.name}/dist/`);
            }
        });

        // federation-js, the other half of the loader pair. In the `standard`
        // variant both halves live in one directory, so skip the system.js
        // copies (already shipped at the root above) and the provenance note.
        copyDirFiltered(
            loader.federationDist,
            path.join(outputDir, "federation-js", "dist"),
            fileName =>
                !fileName.startsWith("system.") &&
                !fileName.endsWith(".md") &&
                federationFilter(fileName)
        );
        log(`📁 Copied: federation-js/dist/ (${loader.name})`);

        // Emit _headers last: it is derived from the dist files just copied, so
        // it always describes what actually shipped.
        const cacheHeaders = generateCacheHeaders(outputDir, msg => log(`⚠️  _headers: ${msg}`));
        if (cacheHeaders) {
            writeFileSync(path.join(outputDir, "_headers"), cacheHeaders);
            const ruleCount = (cacheHeaders.match(/^\/:pkg\//gm) || []).length;
            log(`📄 Generated: _headers (${ruleCount} immutable chunk rules)`);
        } else {
            log("⚠️  No content-hashed chunks found — skipped _headers");
        }

        const missingRefs = findMissingLocalRefs(outputDir, pathPrefix);
        if (missingRefs.length > 0) {
            throw new Error(
                `${missingRefs.length} referenced asset(s) missing from the build output:\n` +
                missingRefs.map(m => `    ${m}`).join("\n") +
                "\n  Add the file to `staticFiles` or to the `packages` copy list."
            );
        }
        log("🔎 Verified: every referenced local asset is present");

        log("✅ Demo site built successfully with all assets!");
        log(`🌐 Path prefix: ${pathPrefix}`);
        log(`📁 Output directory: ${outputDir}`);

        return true;

    } catch (error) {
        console.error("❌ Demo site build failed:", error instanceof Error ? error.message : error);
        if (verbose && error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

// ES module exports
export { buildDemoSite, findMissingLocalRefs };
