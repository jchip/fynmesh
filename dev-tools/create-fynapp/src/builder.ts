import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec as execCb } from "child_process";

const exec = promisify(execCb);

interface BuildOptions {
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

    // Set NODE_ENV for production builds with minification
    process.env.NODE_ENV = minify ? "production" : "development";

    // Build command with watch mode if requested
    const buildCmd = `npm run ${watch ? "dev" : "build"}`;

    try {
        // Execute the build command
        const { stdout, stderr } = await exec(buildCmd, { cwd: appDir });
        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);
        console.log("Build completed successfully");
    } catch (error) {
        console.error("Build failed:", error);
        throw error;
    }
}