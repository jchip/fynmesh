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
        desc: "Build demo site for custom domain (www.fynmesh.win) with root path",
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

            console.log("🚀 Building demo site for custom domain (www.fynmesh.win)...");

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

    "gh-deploy": {
        desc: "DESTRUCTIVE: publish an already-built .temp/docs to the LIVE site",
        /*
         * Not a build step, and not safe to run for its side effects. This
         * force-pushes to the branch Cloudflare Pages serves, so it changes the
         * live site, and step 6 is a `git checkout -f main` that discards
         * uncommitted work anywhere in the tree. Run it only when publishing is
         * the intent. To produce the artifact without publishing it, use
         * `build-demo-site` (or `fyn build-demo` from the repo root).
         */
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
                // Step 1: Hard reset gh-pages to latest main (creates or resets it)
                exec("git checkout -B gh-pages main"),
                // Step 2: Drop the freshly built docs onto the tree
                exec("rm -rf ../../docs"),
                exec("mv ../../.temp/docs ../../docs"),
                // Step 3: Force add docs directory (it's in .gitignore on main)
                exec("git add -f ../../docs"),
                // Step 4: Commit the built docs with a timestamp
                exec(`git commit -m "build demo site ${timestamp}"`),
                // Step 5: Force push — triggers a Cloudflare Pages deploy
                exec("git push --force origin gh-pages"),
                // Step 6: Return to a clean main
                exec("git checkout -f main"),
                exec("rm -rf ../../docs")
            ])
        }
    },

    "gh-publish": {
        desc: "Build the demo site and publish it to the LIVE site",
        task: () => serial(["build-demo-site", "gh-deploy"])
    }
});

