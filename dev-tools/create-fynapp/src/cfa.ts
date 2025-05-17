#!/usr/bin/env node
import { NixClap } from "nix-clap";
import path from "path";
import fs from "fs";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { buildFynApp } from "./builder";
import { updateDependencies } from "./updater";
import { ConfigManager } from "./config";

const exec = promisify(execCb);
const configManager = new ConfigManager();

export async function main() {
    const nixClap = new NixClap();

    const baseOptions = {
        dir: {
            desc: "Target directory (defaults to current directory)",
            alias: "d",
            args: "< string>",
            required: false,
        }
    };

    // Setup commands
    const commands = {
        build: {
            desc: "Build a FynApp",
            options: {
                watch: {
                    desc: "Watch mode - rebuild on changes",
                    alias: "w",
                    args: "< boolean>",
                },
                minify: {
                    desc: "Minify output",
                    alias: "m",
                    args: "< boolean>",
                }
            },
            exec: buildCommand
        },
        update: {
            desc: "Update FynApp dependencies",
            options: {
                "check-only": {
                    desc: "Only check for updates, don't update",
                    args: "< boolean>",
                }
            },
            exec: updateCommand
        },
        config: {
            desc: "Manage FynApp configuration",
            options: {
                action: {
                    desc: "Action to perform (view, extract, set)",
                    alias: "a",
                    args: "< string>",
                },
                key: {
                    desc: "Configuration key (for set action)",
                    alias: "k",
                    args: "< string>",
                    required: false
                },
                value: {
                    desc: "Configuration value (for set action)",
                    alias: "v",
                    args: "< string>",
                    required: false
                }
            },
            exec: configCommand
        }
    };

    // Initialize with base options and commands
    nixClap.init({}, {
        ...commands,
        // Add base options to each command
        build: {
            ...commands.build,
            options: {
                ...baseOptions,
                ...commands.build.options
            }
        },
        update: {
            ...commands.update,
            options: {
                ...baseOptions,
                ...commands.update.options
            }
        },
        config: {
            ...commands.config,
            options: {
                ...baseOptions,
                ...commands.config.options
            }
        }
    });

    try {
        await nixClap.parseAsync();
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

async function buildCommand(opts) {
    // Get target directory - use current directory if not specified
    const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();

    if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory ${targetDir} does not exist.`);
    }

    // Verify this is a FynApp by checking for package.json
    const packageJsonPath = path.join(targetDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`No package.json found in ${targetDir}. Is this a valid FynApp?`);
    }

    // Get the app's configuration
    const appConfig = await configManager.getConfigByDir(targetDir);

    // If no config exists, extract it first
    if (!appConfig) {
        console.warn("No configuration found for this FynApp. Extracting from files...");
        await configManager.extractConfigFromApp(targetDir);
    } else {
        // Update build options in the configuration
        if (opts.minify !== undefined) {
            await configManager.updateConfig(targetDir, {
                buildOptions: {
                    minify: opts.minify,
                    sourceMaps: appConfig.buildOptions?.sourceMaps ?? true,
                    externals: appConfig.buildOptions?.externals ?? []
                }
            });
        }
    }

    console.info(`Building FynApp in ${targetDir}...`);
    await buildFynApp(targetDir, {
        watch: opts.watch,
        minify: opts.minify
    });
}

async function updateCommand(opts) {
    // Get target directory - use current directory if not specified
    const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();

    if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory ${targetDir} does not exist.`);
    }

    // Verify this is a FynApp by checking for package.json
    const packageJsonPath = path.join(targetDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`No package.json found in ${targetDir}. Is this a valid FynApp?`);
    }

    console.info(`Updating dependencies for FynApp in ${targetDir}...`);

    // Get current configuration or extract it
    let appConfig = await configManager.getConfigByDir(targetDir);
    if (!appConfig) {
        console.warn("No configuration found for this FynApp. Extracting from files...");
        appConfig = await configManager.extractConfigFromApp(targetDir);
        if (!appConfig) {
            throw new Error("Failed to extract configuration from FynApp");
        }
    }

    // Update dependencies
    const result = await updateDependencies(targetDir, { checkOnly: opts["check-only"] });

    // Update configuration if dependencies were updated
    if (result && !opts["check-only"]) {
        // Read updated package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

        await configManager.updateConfig(targetDir, {
            dependencies: packageJson.dependencies || {},
            devDependencies: packageJson.devDependencies || {}
        });
    }
}

/**
 * Command to manage FynApp configurations
 */
async function configCommand(opts) {
    // Get target directory - use current directory if not specified
    const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();

    if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory ${targetDir} does not exist.`);
    }

    // Verify this is a FynApp by checking for package.json
    const packageJsonPath = path.join(targetDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        throw new Error(`No package.json found in ${targetDir}. Is this a valid FynApp?`);
    }

    const action = opts.action || "view";

    switch (action) {
        case "view":
            await viewConfig(targetDir);
            break;
        case "extract":
            await extractConfig(targetDir);
            break;
        case "set":
            await setConfig(targetDir, opts.key, opts.value);
            break;
        default:
            throw new Error(`Unknown action: ${action}. Valid actions are: view, extract, set`);
    }
}

/**
 * View the current configuration for a FynApp
 */
async function viewConfig(appDir: string) {
    let config = await configManager.getConfigByDir(appDir);

    if (!config) {
        console.warn("No configuration found for this FynApp. Would you like to extract it?");
        const inquirer = (await import("inquirer")).default;
        const { extract } = await inquirer.prompt([
            {
                type: "confirm",
                name: "extract",
                message: "Extract configuration from FynApp files?",
                default: true
            }
        ]);

        if (extract) {
            config = await configManager.extractConfigFromApp(appDir);
        } else {
            console.info("Aborted. No configuration shown.");
            return;
        }
    }

    if (config) {
        console.info("FynApp Configuration:");
        console.log(JSON.stringify(config, null, 2));
    } else {
        console.error("Failed to retrieve configuration.");
    }
}

/**
 * Extract configuration from FynApp files
 */
async function extractConfig(appDir: string) {
    console.info("Extracting configuration from FynApp files...");
    const config = await configManager.extractConfigFromApp(appDir);

    if (config) {
        console.log("Configuration extracted successfully.");
    } else {
        console.error("Failed to extract configuration.");
    }
}

/**
 * Set a configuration value for a FynApp
 */
async function setConfig(appDir: string, key: string, value: string) {
    if (!key) {
        throw new Error("Key is required for set action");
    }

    if (value === undefined) {
        throw new Error("Value is required for set action");
    }

    // Get current config
    let config = await configManager.getConfigByDir(appDir);

    if (!config) {
        console.warn("No configuration found. Extracting from files...");
        config = await configManager.extractConfigFromApp(appDir);
        if (!config) {
            throw new Error("Failed to extract configuration from FynApp");
        }
    }

    // Parse the key path (e.g. "buildOptions.minify")
    const keyParts = key.split(".");

    // Convert value to appropriate type
    let parsedValue: any = value;
    if (value.toLowerCase() === "true") parsedValue = true;
    else if (value.toLowerCase() === "false") parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    // Create update object with nested structure
    let updateObj: any = {};
    let current = updateObj;

    for (let i = 0; i < keyParts.length; i++) {
        const part = keyParts[i];

        if (i === keyParts.length - 1) {
            // Last key part, set the value
            current[part] = parsedValue;
        } else {
            // Create nested object
            current[part] = {};
            current = current[part];
        }
    }

    // Update the configuration
    const updatedConfig = await configManager.updateConfig(appDir, updateObj);

    if (updatedConfig) {
        console.log(`Configuration updated: ${key} = ${parsedValue}`);
    } else {
        console.error("Failed to update configuration");
    }
}

// Run main if this file is executed directly
if (require.main === module) {
    main().catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
