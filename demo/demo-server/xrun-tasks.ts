import { loadTasks } from "@xarc/module-dev";

// Load default tasks
loadTasks();

// Custom tasks for demo site building
const { buildDemoSite } = require("./scripts/build-demo-site.js");

export const build_demo_site = {
    desc: "Build static demo site for GitHub Pages deployment",
    async task() {
        console.log("Starting demo site build...");
        const success = await buildDemoSite({ verbose: true });
        if (!success) {
            throw new Error("Demo site build failed");
        }
    }
};

export const build_demo_site_skip_validation = {
    desc: "Build demo site without validating that all fynapp builds are present",
    async task() {
        console.log("Starting demo site build (skipping validation)...");
        const success = await buildDemoSite({
            skipValidation: true,
            verbose: true
        });
        if (!success) {
            throw new Error("Demo site build failed");
        }
    }
};

export const build_demo_site_github_pages = {
    desc: "Build demo site for GitHub Pages with /fynmesh/ base path",
    env: {
        GITHUB_PAGES_BASE_PATH: "/fynmesh/"
    },
    async task() {
        console.log("Starting demo site build for GitHub Pages (/fynmesh/)...");
        const success = await buildDemoSite({ verbose: true });
        if (!success) {
            throw new Error("Demo site build failed");
        }
    }
};
