import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec as execCb } from "child_process";

const exec = promisify(execCb);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

interface UpdateOptions {
    checkOnly?: boolean;
}

/**
 * Update FynApp dependencies to the latest compatible versions
 */
export async function updateDependencies(appDir: string, options: UpdateOptions = {}): Promise<boolean> {
    const { checkOnly = false } = options;

    console.log(`Checking dependencies in ${appDir}...`);

    try {
        // Simply use npm to update dependencies
        if (checkOnly) {
            console.log("Checking for outdated packages...");
            const { stdout } = await exec("npm outdated", { cwd: appDir });
            console.log(stdout || "All packages are up to date!");
            return false; // No changes made
        } else {
            console.log("Updating packages...");
            const { stdout } = await exec("npm update", { cwd: appDir });
            console.log(stdout || "All packages updated!");
            return true; // Changes were made
        }
    } catch (error) {
        // npm outdated exits with code 1 if there are outdated packages
        if (error.code === 1 && checkOnly) {
            console.log("Some packages are outdated. Run without --check-only to update them.");
            return false;
        }

        console.error("Failed to update dependencies:", error);
        throw error;
    }
}