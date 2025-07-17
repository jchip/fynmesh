#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const nunjucks = require("nunjucks");

const pathPrefix = process.env.PATH_PREFIX || "/";

/**
 * Configuration for the demo site build
 */
const buildConfig = {
  // Source directories
  sourceDir: path.join(__dirname, ".."),
  templatesDir: path.join(__dirname, "../templates"),
  publicDir: path.join(__dirname, "../public"),

  // Output directory (GitHub Pages docs directory)
  outputDir: path.join(__dirname, "../../../docs"),

  // Required build directories and their sources
  buildSources: {
    kernel: path.join(__dirname, "../../../core/kernel"),
    "fynapp-1": path.join(__dirname, "../../fynapp-1"),
    "fynapp-1-b": path.join(__dirname, "../../fynapp-1-b"),
    "fynapp-2-react18": path.join(__dirname, "../../fynapp-2-react18"),
    "fynapp-3-marko": path.join(__dirname, "../../fynapp-3-marko"),
    "fynapp-4-vue": path.join(__dirname, "../../fynapp-4-vue"),
    "fynapp-5-preact": path.join(__dirname, "../../fynapp-5-preact"),
    "fynapp-6-react": path.join(__dirname, "../../fynapp-6-react"),
    "fynapp-7-solid": path.join(__dirname, "../../fynapp-7-solid"),
    "fynapp-x1-v1": path.join(__dirname, "../../fynapp-x1-v1"),
    "fynapp-x1-v2": path.join(__dirname, "../../fynapp-x1-v2"),
    "fynapp-react-18": path.join(__dirname, "../../fynapp-react-18"),
    "fynapp-react-19": path.join(__dirname, "../../fynapp-react-19"),
    "fynapp-react-middleware": path.join(__dirname, "../../fynapp-react-middleware"),
    "fynapp-design-tokens": path.join(__dirname, "../../fynapp-design-tokens"),
  },

  // Node modules to copy
  nodeModules: {
    "spectre.css": {
      source: path.join(__dirname, "../node_modules/spectre.css/dist"),
      destination: "spectre.css/dist", // Copy only the dist directory
    },
    "federation-js": {
      source: path.join(__dirname, "../node_modules/federation-js/dist"),
      destination: "federation-js/dist", // Copy only the dist directory
    },
  },

  // Static assets from public directory
  staticAssets: ["system.js", "system.min.js", "system.min.js.map"],
};

/**
 * Template data for rendering HTML
 *
 * Environment variables:
 * - GITHUB_PAGES_BASE_PATH: Base path for GitHub Pages deployment
 *   Examples:
 *   - "./" for relative paths (default)
 *   - "/fynmesh/" for project pages like username.github.io/fynmesh/
 *   - "/" for user/org pages like username.github.io
 */
const templateData = {
  title: "FynMesh Micro Frontend Demo",
  isProduction: true, // Always production for static build
  pathPrefix, // Configurable base path for GitHub Pages
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
      title: "Independent Deployment",
      description:
        "Each micro-frontend can be developed and deployed independently by different teams.",
      icon: "bi-boxes",
      color: "primary",
    },
    {
      title: "Module Federation",
      description:
        "Share code and dependencies between applications at runtime using Module Federation.",
      icon: "bi-code-square",
      color: "secondary",
    },
    {
      title: "Multi-Framework",
      description: "Mix and match different frontend frameworks in a single application.",
      icon: "bi-layers",
      color: "success",
    },
  ],
};

/**
 * Utility functions
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) {
    console.warn(`Warning: Source directory ${source} does not exist`);
    return;
  }

  ensureDir(destination);
  const items = fs.readdirSync(source);

  for (const item of items) {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destination, item);

    if (fs.statSync(sourcePath).isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      copyFile(sourcePath, destPath);
    }
  }
}

/**
 * Main build functions
 */

/**
 * Clean the output directory
 */
function cleanOutput() {
  console.log("🧹 Cleaning output directory...");
  if (fs.existsSync(buildConfig.outputDir)) {
    fs.rmSync(buildConfig.outputDir, { recursive: true, force: true });
  }
  ensureDir(buildConfig.outputDir);
}

/**
 * Copy static assets from public directory
 */
function copyStaticAssets() {
  console.log("📁 Copying static assets...");

  for (const asset of buildConfig.staticAssets) {
    const sourcePath = path.join(buildConfig.publicDir, asset);
    const destPath = path.join(buildConfig.outputDir, asset);

    if (fs.existsSync(sourcePath)) {
      copyFile(sourcePath, destPath);
      console.log(`  ✓ Copied ${asset}`);
    }
  }
}

/**
 * Copy node modules dependencies
 */
function copyNodeModules() {
  console.log("📦 Copying node modules...");

  for (const [moduleName, moduleConfig] of Object.entries(buildConfig.nodeModules)) {
    // Handle both old string format and new object format
    const sourcePath = typeof moduleConfig === "string" ? moduleConfig : moduleConfig.source;
    const destRelativePath =
      typeof moduleConfig === "string" ? `node_modules/${moduleName}` : moduleConfig.destination;
    const destPath = path.join(buildConfig.outputDir, destRelativePath);

    if (fs.existsSync(sourcePath)) {
      copyDirectory(sourcePath, destPath);
      console.log(`  ✓ Copied ${moduleName} to ${destRelativePath}`);
    } else {
      console.warn(`  ⚠️  Module ${moduleName} not found at ${sourcePath}`);
    }
  }
}

/**
 * Copy fynapp dist directories
 */
function copyFynAppBuilds() {
  console.log("🚀 Copying FynApp builds...");

  for (const [appName, appPath] of Object.entries(buildConfig.buildSources)) {
    const distPath = path.join(appPath, "dist");
    const destPath = path.join(buildConfig.outputDir, appName, "dist");

    if (fs.existsSync(distPath)) {
      copyDirectory(distPath, destPath);
      console.log(`  ✓ Copied ${appName}/dist`);
    } else {
      console.warn(`  ⚠️  ${appName} dist not found - run 'npm run build' in ${appPath}`);
    }
  }
}

/**
 * Generate HTML from templates
 */
function generateHTML() {
  console.log("🎨 Generating HTML from templates...");

  // Configure Nunjucks
  const env = nunjucks.configure(buildConfig.templatesDir, {
    autoescape: true,
    noCache: true,
  });

  // Render the main page
  const html = env.render("pages/index.html", templateData);
  const outputPath = path.join(buildConfig.outputDir, "index.html");

  fs.writeFileSync(outputPath, html, "utf8");
  console.log("  ✓ Generated index.html");
}

/**
 * Validate that all required builds are present
 */
function validateBuilds() {
  console.log("🔍 Validating builds...");

  const missing = [];

  for (const [appName, appPath] of Object.entries(buildConfig.buildSources)) {
    const distPath = path.join(appPath, "dist");
    if (!fs.existsSync(distPath)) {
      missing.push(appName);
    }
  }

  if (missing.length > 0) {
    console.warn("⚠️  Missing builds for:", missing.join(", "));
    console.warn("   Run build commands for these apps before deploying");
    return false;
  }

  console.log("✅ All builds validated");
  return true;
}

/**
 * Main build function - orchestrates the entire process
 */
async function buildDemoSite(options = {}) {
  const { skipValidation = false, verbose = false } = options;

  console.log("🔨 Building FynMesh Demo Site...");
  console.log(`📂 Output: ${buildConfig.outputDir}`);

  try {
    // Validate builds unless skipped
    if (!skipValidation && !validateBuilds()) {
      throw new Error("Build validation failed");
    }

    // Execute build steps
    cleanOutput();
    copyStaticAssets();
    copyNodeModules();
    copyFynAppBuilds();
    generateHTML();

    console.log("✅ Demo site built successfully!");
    console.log(`🌐 Deploy from: ${buildConfig.outputDir}`);

    return true;
  } catch (error) {
    console.error("❌ Build failed:", error.message);
    if (verbose) {
      console.error(error.stack);
    }
    return false;
  }
}

/**
 * CLI interface when run directly
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    skipValidation: args.includes("--skip-validation"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };

  buildDemoSite(options)
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
}

// Export for use as a module
module.exports = {
  buildDemoSite,
  buildConfig,
  templateData,
  cleanOutput,
  copyStaticAssets,
  copyNodeModules,
  copyFynAppBuilds,
  generateHTML,
  validateBuilds,
};
