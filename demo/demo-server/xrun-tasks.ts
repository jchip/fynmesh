import xrun from "@fynjs/run";

const { load, exec, serial } = xrun;

load({
    "build-templates": {
        desc: "Build templates for local development",
        task: async () => {
            // Dynamic import of the TypeScript build function
            const { buildTemplates } = await import("./scripts/build-templates.mts");

            console.log("🚀 Building templates for local development...");

            const success = await buildTemplates({
                verbose: true,
                isProduction: process.env.NODE_ENV === "production"
            });

            if (!success) {
                throw new Error("Template build failed");
            }

            console.log("✅ Template build completed successfully!");
        }
    },

    "build-demo-site": {
        desc: "Build demo site for custom domain (www.lm360.ai) with root path",
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

            console.log("🚀 Building demo site for custom domain (www.lm360.ai)...");

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
        desc: "Deploy demo site to Cloudflare Pages via the gh-pages branch",
        task: () => {
            // Generate timestamp in MM/DD/YYYY HH:MM format
            const now = new Date();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timestamp = `${month}/${day}/${year} ${hours}:${minutes}`;

            // gh-pages is a disposable branch: always latest main + a built docs/
            // commit on top, force-pushed. Cloudflare Pages serves the docs/ dir.
            return serial([
                // Step 1: Build demo site (on main) to .temp/docs
                //         (.temp/docs persists because .temp is in .gitignore)
                "build-demo-site",
                // Step 2: Hard reset gh-pages to latest main (creates or resets it)
                exec("git checkout -B gh-pages main"),
                // Step 3: Drop the freshly built docs onto the tree
                exec("rm -rf ../../docs"),
                exec("mv ../../.temp/docs ../../docs"),
                // Step 4: Force add docs directory (it's in .gitignore on main)
                exec("git add -f ../../docs"),
                // Step 5: Commit the built docs with a timestamp
                exec(`git commit -m "build demo site ${timestamp}"`),
                // Step 6: Force push — triggers a Cloudflare Pages deploy
                exec("git push --force origin gh-pages"),
                // Step 7: Return to a clean main
                exec("git checkout -f main"),
                exec("rm -rf ../../docs")
            ])
        }
    }
});

