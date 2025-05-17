import { NixClap } from "nix-clap";
import path from "path";
import fs from "fs";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { generateApp } from "./generator";
import { promptForMissingInfo } from "./prompts";
import { ConfigManager } from "./config";

const exec = promisify(execCb);
const configManager = new ConfigManager();

export async function main() {
    const nixClap = new NixClap();

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
            flag: true,
            default: false,
        },
    };

    nixClap.init({}, {
        _: {
            desc: "Create a new FynApp",
            options: cliOptions,
            exec: createNewApp
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
    // Prompt for any missing information
    const config = await promptForMissingInfo(opts);

    // Set up paths
    const rootDir = process.cwd();
    const demoDir = path.join(rootDir, "demo");
    const targetDir = path.join(demoDir, config.dir || config.name);

    // Check if directory already exists
    if (fs.existsSync(targetDir)) {
        if (fs.readdirSync(targetDir).length > 0) {
            throw new Error(`Directory ${targetDir} already exists and is not empty.`);
        }
    } else {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate app from template
    await generateApp({
        ...config,
        targetDir,
        rootDir
    });

    // Install dependencies if not skipped
    if (!config.skipInstall) {
        await exec("npm install", { cwd: targetDir });
    }

    // Create and save configuration
    await configManager.createConfig(targetDir, {
        name: config.name,
        framework: config.framework,
        version: "1.0.0",
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        components: config.components || [],
        dependencies: {},
        devDependencies: {},
        buildOptions: {
            minify: true,
            sourceMaps: true,
            externals: []
        },
        deployTargets: {},
        federation: {
            name: config.name,
            shareScope: "fynmesh",
            exposedModules: {},
            sharedDependencies: {}
        }
    });

    console.log(`
Successfully created FynApp: ${config.name}
Using framework: ${config.framework}

Your FynApp has been created in: demo/${config.dir || config.name}

Next steps:
  cd demo/${config.dir || config.name}
  npm start

For ongoing development, use the 'cfa' command:
  cd demo/${config.dir || config.name}    # Navigate to your FynApp
  cfa build -w                            # Build with watch mode
  cfa update                              # Update dependencies
  cfa config                              # Manage configuration
`);
}

// Run main if this file is executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}