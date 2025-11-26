
import nunjucks from "nunjucks";
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ES module equivalents for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Options for building the demo site
 */
interface BuildDemoSiteOptions {
    /** Enable verbose logging */
    verbose?: boolean;
    /** Path prefix for deployment (e.g., "/fynmesh/" for GitHub Pages) */
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

        // Build the shell page (shell.html)
        const shellHtml = env.render("pages/shell.html", {
            title: "FynMesh Shell Demo",
            isProduction,
            pathPrefix,
        });
        const shellOutputPath = path.join(outputDir, "shell.html");
        writeFileSync(shellOutputPath, shellHtml);
        log("📄 Generated: " + shellOutputPath);

        // Copy all required static assets for GitHub Pages (skip index.html since we build it directly)
        log("📁 Copying static assets...");

        // Copy static files from public directory
        let staticFiles = [
            "system.js",
            "system.min.js",
            "system.min.js.map",
            "sw.js",           // Service Worker
            "sw-utils.js",     // Service Worker Utilities
            "favicon.ico"      // Favicon
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

        // Copy CNAME file for custom domain (GitHub Pages)
        const cnameSource = path.join(__dirname, "../CNAME");
        if (existsSync(cnameSource)) {
            const cnameDest = path.join(outputDir, "CNAME");
            writeFileSync(cnameDest, readFileSync(cnameSource));
            log(`📄 Copied: CNAME (custom domain: ${readFileSync(cnameSource, 'utf-8').trim()})`);
        }

        // Copy Google verification file
        const googleVerifySource = path.join(__dirname, "../googlee9bcb5713536aa25.html");
        if (existsSync(googleVerifySource)) {
            const googleVerifyDest = path.join(outputDir, "googlee9bcb5713536aa25.html");
            writeFileSync(googleVerifyDest, readFileSync(googleVerifySource));
            log(`📄 Copied: googlee9bcb5713536aa25.html (Google verification)`);
        }

        // Copy dist directories from various packages
        const packages = [
            // node_modules packages
            { name: "federation-js", basePath: path.join(__dirname, "../node_modules") },
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
                // Use special filter for federation-js
                const filter = pkg.name === "federation-js" ? federationFilter : fileFilter;
                copyDirFiltered(srcDist, dest, filter);
                log(`📁 Copied: ${pkg.name}/dist/`);
            }
        });

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
export { buildDemoSite };
