import { loadTasks } from "@xarc/module-dev";

const xrun = loadTasks();
const { load, exec, serial } = xrun;

load({
    "build-templates": {
        desc: "Build templates for local development",
        task: async () => {
            // Dynamic import of the TypeScript build function
            const { buildTemplates } = await import("./scripts/build-templates.mts");

            console.log("🚀 Building templates for local development...");

            const success = await buildTemplates({
                verbose: true
            });

            if (!success) {
                throw new Error("Template build failed");
            }

            console.log("✅ Template build completed successfully!");
        }
    },

    "build-demo-site": {
        desc: "Build demo site for custom domain (www.fynetiq.com) with root path",
        task: async () => {
            const fs = await import("node:fs");
            const path = await import("node:path");
            
            // Ensure .temp directory exists
            const tempDir = path.resolve("../../.temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // Dynamic import of the TypeScript build function
            const { buildDemoSite } = await import("./scripts/build-demo-site.mts");

            console.log("🚀 Building demo site for custom domain (www.fynetiq.com)...");

            const success = await buildDemoSite({
                verbose: true,
                pathPrefix: "/",
                outputDir: "../../.temp/docs"
            });

            if (!success) {
                throw new Error("Demo site build failed");
            }

            console.log("✅ Demo site build completed successfully!");
        }
    },

    "gh-publish": {
        desc: "Publish demo site to gh-pages branch",
        task: () => {
            // Generate timestamp in MM/DD/YYYY HH:MM format
            const now = new Date();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timestamp = `${month}/${day}/${year} ${hours}:${minutes}`;
            
            return serial([
                // Step 1: Build demo site in main branch to .temp/docs directory
                "build-demo-site",
                // Step 2: Switch to gh-pages branch
                //         (.temp/docs persists because .temp is in .gitignore)
                exec("git checkout gh-pages"),
                // Step 3: Delete old docs directory from gh-pages
                exec("rm -rf ../../docs"),
                // Step 4: Move the freshly built docs from .temp/docs to docs
                exec("mv ../../.temp/docs ../../docs"),
                // Step 5: Force add docs directory (it's in .gitignore on main)
                exec("git add -f ../../docs"),
                // Step 6: Commit the changes with timestamp
                exec(`git commit -m "update demo site to gh pages ${timestamp}"`)
                // Note: User must manually run 'git push' after this
            ])
        }
    }
});

