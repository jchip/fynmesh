import { runFynCommand } from "./run-fyn.js";

export interface BuildOptions {
    watch?: boolean;
    minify?: boolean;
}

/**
 * Build a FynApp for development or production
 */
export async function buildFynApp(appDir: string, options: BuildOptions = {}): Promise<void> {
    const { watch = false, minify = true } = options;

    console.log(`Building FynApp in ${appDir}...`);
    console.log(`Options: watch=${watch}, minify=${minify}`);

    try {
        await runFynCommand(appDir, ["run", watch ? "dev" : "build"], {
            NODE_ENV: minify ? "production" : "development",
        });
        console.log("Build completed successfully");
    } catch (error) {
        console.error("Build failed:", error);
        throw error;
    }
}
