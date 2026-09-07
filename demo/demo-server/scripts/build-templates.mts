import nunjucks from "nunjucks";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { collectShellPreloadModules, collectShellBundleMaps } from "./shell-preload.mts";
import { getDemoTemplateData } from "./demo-template-data.mts";

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Options for building templates
 */
interface BuildTemplatesOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Path prefix for deployment (e.g., "/fynmesh/" for GitHub Pages) */
    pathPrefix?: string;
    /** Output directory for built files */
    outputDir?: string;
    /** Template directory */
    templateDir?: string;
    /** Whether this is a production build */
    isProduction?: boolean;
}

/**
 * Build templates with configurable options
 */
async function buildTemplates(options: BuildTemplatesOptions = {}): Promise<boolean> {
    const {
        verbose = false,
        pathPrefix = process.env.PATH_PREFIX || "/",
        outputDir = path.join(__dirname, "../public"),
        templateDir = path.join(__dirname, "../templates"),
        isProduction = process.env.NODE_ENV === "production"
    } = options;

    const log = (message: string) => {
        if (verbose) {
            console.log(`[Build Templates] ${message}`);
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
        log(`📄 Generated: ${landingOutputPath}`);

        // Build the demo page (demo.html)
        /*
         * The 404 page. Cloudflare Pages infers its not-found behavior from the
         * deployed files: with no top-level 404.html it treats the deployment as
         * a single-page application and answers every unmatched path with
         * index.html and a 200, so a missing asset reaches the browser as
         * text/html instead of an error (FYM-390). Shipping this file is the
         * whole switch -- there is no project setting for it.
         */
        const notFoundHtml = env.render("pages/404.html", {
            isProduction,
            pathPrefix,
        });
        const notFoundOutputPath = path.join(outputDir, "404.html");
        writeFileSync(notFoundOutputPath, notFoundHtml);
        log("📄 Generated: " + notFoundOutputPath);

        const demoHtml = env.render("pages/demo.html", templateData);
        const demoOutputPath = path.join(outputDir, "demo.html");
        writeFileSync(demoOutputPath, demoHtml);
        log(`📄 Generated: ${demoOutputPath}`);

        // Build the shell page (shell.html).
        // Hints are read off the FynApps' dist dirs, so they are only present if
        // those have been built — a template-only build just gets fewer hints.
        const preloadModules = collectShellPreloadModules(
            path.join(__dirname, "../.."),
            pathPrefix,
            msg => log(`⚠️  preload: ${msg}`)
        );
        log(`🔗 Shell preload hints: ${preloadModules.length}`);
        // The maps behind those hints, declared in the page so the runtime knows
        // which file carries which module before any FynApp entry has run.
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
        log(`📄 Generated: ${shellOutputPath}`);

        log("✅ Templates compiled successfully!");
        log(`🌐 Path prefix: ${pathPrefix}`);

        return true;

    } catch (error) {
        console.error("❌ Template compilation failed:", error instanceof Error ? error.message : error);
        if (verbose && error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

// ES module exports
export { buildTemplates };
