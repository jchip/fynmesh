#!/usr/bin/env node
import { NixClap } from "nix-clap";
import path from "path";
import { promises as fsPromises } from "fs";
import AveAzul from "aveazul";
import { generateApp } from "./generator.js";
import { promptForMissingInfo } from "./prompts.js";
import { fileExists } from "./utils.js";
import { runFynCommand } from "./run-fyn.js";
import { getCommandOptions } from "./cli-options.js";

export async function main() {
    const nixClap = new NixClap({ defaultCommand: "create" });

    const cliOptions = {
        name: {
            desc: "Name for the new FynApp",
            alias: "n",
            args: "< string>",
            required: false,
        },
        framework: {
            desc: "Framework to use (react, vue, preact, solid, marko)",
            alias: "f",
            args: "< string>",
            required: false,
            validate: (value) => {
                const validFrameworks = ["react", "vue", "preact", "solid", "marko"];
                if (!validFrameworks.includes(value)) {
                    throw new Error(`Framework must be one of: ${validFrameworks.join(", ")}`);
                }
                return value;
            }
        },
        dir: {
            desc: "Target directory (relative to demo/)",
            alias: "d",
            args: "< string>",
            required: false,
        },
        "skip-install": {
            desc: "Skip dependency installation",
            argDefault: "false",
        },
    };

    nixClap.init(cliOptions, {
        create: {
            desc: "Create a new FynApp",
            exec: (command, commands) => createNewApp(getCommandOptions(command, commands))
        }
    });

    try {
        await nixClap.parseAsync();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Command implementations
async function createNewApp(opts) {
    // Use AveAzul's try method for better error handling
    return AveAzul.try(async () => {
        // Prompt for any missing information
        const config = await promptForMissingInfo(opts);

        // Set up paths
        const rootDir = process.cwd();
        const demoDir = path.join(rootDir, "demo");
        const targetDir = path.join(demoDir, config.dir || config.name);

        // Check if directory already exists
        if (await fileExists(targetDir)) {
            if (await fsPromises.readdir(targetDir).then((files) => files.length > 0)) {
                throw new Error(`Directory ${targetDir} already exists and is not empty.`);
            }
        } else {
            await fsPromises.mkdir(targetDir, { recursive: true });
        }

        // Generate app from template
        await generateApp({
            ...config,
            targetDir,
            rootDir
        });

        // Install dependencies if not skipped
        if (!config.skipInstall) {
            console.log("📦 Installing dependencies...");
            await AveAzul.resolve(runFynCommand(targetDir, ["install"]))
                .timeout(120000, "Dependency installation timed out after 2 minutes")
                .catch((error) => {
                    console.warn("⚠️  Dependency installation failed:", error.message);
                    console.log("You can install dependencies manually by running 'fyn install' in the project directory.");
                });
        }

        return config;
    })
        .then((config) => {
            console.log(`
Successfully created FynApp: ${config.name}
Using framework: ${config.framework}

Your FynApp has been created in: demo/${config.dir || config.name}

Next steps:
  cd demo/${config.dir || config.name}
  fyn install
  cfa build          # Build the FynApp
  cfa check          # Build + check the federation output

To modify this FynApp (add middleware, change rendering, migrate to a new
kernel API), hand it to an LLM coding agent — see the contract and guide in
create-fynapp/agent/ (CONTRACT.md, GUIDE.md) and examples/ for patterns.
`);
        })
        .catch((error) => {
            console.error(`❌ Error creating FynApp: ${error.message}`);
            throw error;
        });
}

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
