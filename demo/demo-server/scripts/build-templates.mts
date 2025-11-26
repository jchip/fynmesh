import nunjucks from "nunjucks";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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
        log(`📄 Generated: ${landingOutputPath}`);

        // Build the demo page (demo.html)
        const demoHtml = env.render("pages/demo.html", templateData);
        const demoOutputPath = path.join(outputDir, "demo.html");
        writeFileSync(demoOutputPath, demoHtml);
        log(`📄 Generated: ${demoOutputPath}`);

        // Build the shell page (shell.html)
        const shellHtml = env.render("pages/shell.html", {
            title: "FynMesh Shell Demo",
            isProduction,
            pathPrefix,
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
