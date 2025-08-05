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
        desc: "Build demo site for GitHub Pages with / base path",
        task: async () => {
            // Dynamic import of the TypeScript build function
            const { buildDemoSite } = await import("./scripts/build-demo-site.mts");

            console.log("🚀 Building demo site for GitHub Pages (/)...");

            const success = await buildDemoSite({
                verbose: true,
                pathPrefix: "/",
                outputDir: "../../docs"
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
            return serial([
                // Build demo site directly to docs directory with GitHub Pages path prefix
                "build-demo-site",
                exec("mv ../../docs ../../docs-temp"),
                exec("git checkout gh-pages"),
                exec("rm -rf ../../docs"),
                exec("mv ../../docs-temp ../../docs"),
                exec("git add -f ../../docs"),
                exec('git commit -m "update demo site to gh pages"')
            ])
        }
    }
});

