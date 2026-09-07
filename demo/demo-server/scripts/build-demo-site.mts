
import nunjucks from "nunjucks";
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    collectShellPreloadModules,
    collectShellBundleMaps,
    readBundles,
    carriersOf,
} from "./shell-preload.mts";
import { generateCacheHeaders } from "./cache-headers.mts";
import { resolveLoaderVariant } from "../src/loader-variant.ts";
import { getDemoTemplateData } from "./demo-template-data.mts";

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
    /** Whether this is a production build */
    isProduction?: boolean;
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
 * The federation chunks each built FynApp declares, checked against what was
 * actually copied into the output.
 *
 * {@link findMissingLocalRefs} is the FYM-199 guard, and it only sees `src=` and
 * `href=` in the generated pages. The chunks that carry the FynApps are not in
 * any page: `fynapp-6-react`'s federation.json names `main-DWprtUVa.js`, and
 * that string appears in no HTML at all -- the loader reads the manifest and
 * fetches the chunk at runtime. So the assets that actually load the apps sat
 * entirely outside the guard (FYM-392), which is the same shape as the two P1
 * bugs that already shipped, FYM-155 and FYM-199.
 *
 * The failure mode is worth the check. Cloudflare Pages answers an unknown path
 * with 200 and the landing page HTML rather than a 404, so a missing chunk
 * reaches the browser as `text/html` for a `.js` request and the page dies on an
 * undefined global far from the cause. Worse, the generated `_headers` rule
 * `/:pkg/dist/main-*` is a glob that matches a chunk which does not exist, so
 * that wrong HTML is cached `immutable` for a year at a content-hashed url that
 * never changes -- a redeploy cannot heal it for whoever got it.
 *
 * A chunk resolves when its own file is present OR when the combined file
 * carrying it is. That is exactly how the runtime resolves one, and it is read
 * through the same {@link readBundles} the preload pass uses, so this cannot
 * disagree with what the shell page preloads.
 *
 * @param outputDir - the built site
 * @returns list of `app/dist/federation.json -> missing chunk` descriptions
 */
function findMissingChunkRefs(outputDir: string): string[] {
    const missing: string[] = [];

    for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const distDir = path.join(outputDir, entry.name, "dist");
        const manifestPath = path.join(distDir, "federation.json");
        if (!existsSync(manifestPath)) continue;

        const where = `${entry.name}/dist/federation.json`;
        let manifest: any;
        try {
            manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch (err) {
            missing.push(`${where} -> unreadable (${(err as Error).message})`);
            continue;
        }

        const bundles = readBundles(distDir, entry.name, msg => missing.push(`${where} -> ${msg}`));
        const carrierOf = carriersOf(bundles);
        const present = (file: string) => existsSync(path.join(distDir, file));
        const resolves = (file: string) => {
            if (present(file)) return true;
            const carrier = carrierOf.get(file);
            return carrier !== undefined && present(carrier);
        };

        const check = (what: string, file: unknown) => {
            if (typeof file !== "string" || !file) return;
            if (!resolves(file)) missing.push(`${where} -> ${file} (${what})`);
        };

        // The container entry is what the kernel imports; everything else hangs
        // off it, so its absence is the loudest possible version of this bug.
        check("container entry", manifest.filename);

        for (const [name, exposed] of Object.entries<any>(manifest.exposes ?? {})) {
            for (const chunk of exposed?.chunks ?? []) check(`exposes ${name}`, chunk);
        }
        for (const [name, shared] of Object.entries<any>(manifest.shared ?? {})) {
            for (const chunk of shared?.chunks ?? []) check(`shared ${name}`, chunk);
        }
        // A carrier that is itself missing takes every member down with it.
        for (const carrier of Object.keys(bundles)) check("combined bundle", carrier);
    }

    return missing;
}

/**
 * Empty `outputDir` so the build starts from nothing, and return it ready to
 * write into.
 *
 * A build directory has to start empty. The publish flow builds into
 * `.temp/docs`, which is gitignored and so survives between runs -- whatever an
 * earlier build left there ships. That is how 86 stale `.map` files reached the
 * first live deploy, and content-hashed chunk names strand exactly the same way.
 *
 * The guard is not optional. `buildDemoSite` defaults `outputDir` to
 * demo-server's own `public/`, which is also the *source* of the static file
 * copy -- cleaning that would delete checked-in assets. When the two resolve to
 * the same directory this leaves it alone and says so.
 *
 * @param outputDir - directory the build writes into
 * @param sourceDir - directory static assets are copied *from*; never cleaned
 * @param log - verbose logger
 * @returns true if the directory was cleaned, false if the guard declined
 */
function prepareOutputDir(outputDir: string, sourceDir: string, log: (m: string) => void): boolean {
    const isSourceDir = path.resolve(outputDir) === path.resolve(sourceDir);

    if (isSourceDir) {
        log(`⚠️  Not cleaning ${outputDir}: it is the source public/ directory`);
    } else if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
        log(`Cleaned output directory: ${outputDir}`);
    }

    mkdirSync(outputDir, { recursive: true });
    return !isSourceDir;
}

/**
 * Build the demo site with configurable path prefix
 */
async function buildDemoSite(options: BuildDemoSiteOptions = {}): Promise<boolean> {
    const {
        verbose = false,
        pathPrefix = process.env.PATH_PREFIX || "/",
        outputDir = path.join(__dirname, "../public"),
        templateDir = path.join(__dirname, "../templates"),
        isProduction = process.env.NODE_ENV === "production"
    } = options;

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
            noCache: !isProduction,
        });

        // Template data
        const templateData = getDemoTemplateData({
            isProduction,
            pathPrefix,
        });

        log("Rendering templates...");

        // Start from an empty output directory -- see prepareOutputDir.
        const publicDir = path.join(__dirname, "../public");
        prepareOutputDir(outputDir, publicDir, log);

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
        log(`🔗 Shell preload hints: ${preloadModules.length}`);

        const bundleMaps = collectShellBundleMaps(
            path.join(__dirname, "../.."),
            pathPrefix,
            msg => log(`⚠️  bundle map: ${msg}`)
        );
        log(`📦 Shell bundle maps: ${bundleMaps.length}`);

        const shellHtml = env.render("pages/shell.html", {
            title: "FynMesh Shell Demo",
            isProduction,
            pathPrefix,
            preloadModules,
            bundleMaps,
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

        // The inspector ships from its own dist, like the loader above: the
        // page asks for .min.js in production and .js in development, so only
        // the one the generated HTML references is copied. It is optional --
        // a tree where it has not been built ships a site without the badge,
        // which is why this does not throw. (findMissingLocalRefs below will
        // still catch a page that references a file nobody copied.)
        const inspectorFile = isProduction
            ? "federation-inspector.min.js"
            : "federation-inspector.js";
        const inspectorSrc = path.join(
            __dirname,
            "../../../dev-tools/federation-inspector/dist",
            inspectorFile
        );
        if (existsSync(inspectorSrc)) {
            writeFileSync(path.join(outputDir, inspectorFile), readFileSync(inspectorSrc));
            log(`📄 Copied: ${inspectorFile}`);
        } else {
            log(`⚠️  Skipped: ${inspectorFile} (not built)`);
        }

        // Note: no CNAME file — Cloudflare Pages configures the custom domain
        // (www.fynmesh.win) in its dashboard, so a CNAME file is not used.

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

        const missingRefs = [
            ...findMissingLocalRefs(outputDir, pathPrefix),
            ...findMissingChunkRefs(outputDir),
        ];
        if (missingRefs.length > 0) {
            throw new Error(
                `${missingRefs.length} referenced asset(s) missing from the build output:\n` +
                missingRefs.map(m => `    ${m}`).join("\n") +
                "\n  A page ref needs the file in `staticFiles` or the `packages` copy list;" +
                "\n  a federation.json ref means the app's dist did not ship what it declares."
            );
        }
        log("🔎 Verified: every referenced local asset and federation chunk is present");

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
export { buildDemoSite, findMissingLocalRefs, findMissingChunkRefs, prepareOutputDir };
