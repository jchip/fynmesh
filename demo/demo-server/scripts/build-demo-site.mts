
import nunjucks from "nunjucks";
import { existsSync, mkdirSync, writeFileSync, cpSync, readFileSync } from "node:fs";
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
 * Build the demo site with configurable path prefix
 */
async function buildDemoSite(options: BuildDemoSiteOptions = {}): Promise<boolean> {
    const {
        verbose = false,
        pathPrefix = process.env.PATH_PREFIX || "/",
        outputDir = path.join(__dirname, "../public"),
        templateDir = path.join(__dirname, "../templates")
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
            noCache: process.env.NODE_ENV !== "production",
        });

        // Template data
        const templateData = {
            title: "FynMesh Micro Frontend Demo",
            isProduction: process.env.NODE_ENV === "production",
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
                    description: "Support for React, Vue, Preact, Solid, and Marko frameworks running together.",
                    color: "success",
                },
            ],
        };

        log("Rendering template...");

        // Build the main page
        const html = env.render("pages/index.html", templateData);

        // Ensure output directory exists
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
            log(`Created output directory: ${outputDir}`);
        }

        const outputPath = path.join(outputDir, "index.html");
        writeFileSync(outputPath, html);

        log("📄 Generated: " + outputPath);

        // Copy all required static assets for GitHub Pages (skip index.html since we build it directly)
        log("📁 Copying static assets...");

        // Copy system.js files from public directory
        const systemFiles = ["system.js", "system.min.js", "system.min.js.map"];
        const publicDir = path.join(__dirname, "../public");
        systemFiles.forEach(file => {
            const src = path.join(publicDir, file);
            const dest = path.join(outputDir, file);
            if (existsSync(src)) {
                writeFileSync(dest, readFileSync(src));
                log(`📄 Copied: ${file}`);
            }
        });

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
            { name: "fynapp-x1-v1", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-x1-v2", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-18", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-19", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-react-middleware", basePath: path.join(__dirname, "../..") },
            { name: "fynapp-design-tokens", basePath: path.join(__dirname, "../..") }
        ];

        packages.forEach(pkg => {
            const srcDist = path.join(pkg.basePath, pkg.name, "dist");
            const dest = path.join(outputDir, pkg.name, "dist");
            if (existsSync(srcDist)) {
                cpSync(srcDist, dest, { recursive: true });
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
