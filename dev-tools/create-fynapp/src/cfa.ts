#!/usr/bin/env node
import { NixClap } from "nix-clap";
import path from "path";
import fs from "fs";
import { buildFynApp } from "./builder.js";
import { runCheck } from "./check-fynapp.js";
import { runInstallSkills } from "./install-skills.js";
import { getCommandOptions } from "./cli-options.js";

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

    const commands = {
        build: {
            desc: "Build a FynApp",
            options: {
                ...baseOptions,
                watch: {
                    desc: "Watch mode - rebuild on changes",
                    alias: "w",
                    argDefault: "false",
                },
                minify: {
                    desc: "Minify output",
                    alias: "m",
                    argDefault: "true",
                }
            },
            exec: (command, commandNodes) =>
                buildCommand(getCommandOptions(command, commandNodes))
        },
        check: {
            desc: "Build a FynApp and check its federation output (entry + manifest)",
            options: {
                ...baseOptions,
                build: {
                    desc: "Build before checking the federation output",
                    argDefault: "true",
                }
            },
            exec: (command, commandNodes) =>
                checkCommand(getCommandOptions(command, commandNodes))
        },
        "install-skills": {
            desc: "Install the bundled Claude Code skills into <dir>/.claude/skills",
            options: {
                ...baseOptions,
                force: {
                    desc: "Overwrite existing skills of the same name",
                    alias: "f",
                    argDefault: "false",
                }
            },
            exec: (command, commandNodes) =>
                installSkillsCommand(getCommandOptions(command, commandNodes))
        }
    };

    nixClap.init({}, commands);

    try {
        await nixClap.parseAsync();
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

/**
 * Resolve and sanity-check the target FynApp directory.
 */
function resolveAppDir(opts: any): string {
    const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
    if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory ${targetDir} does not exist.`);
    }
    if (!fs.existsSync(path.join(targetDir, "package.json"))) {
        throw new Error(`No package.json found in ${targetDir}. Is this a valid FynApp?`);
    }
    return targetDir;
}

async function buildCommand(opts) {
    const targetDir = resolveAppDir(opts);
    console.info(`Building FynApp in ${targetDir}...`);
    await buildFynApp(targetDir, {
        watch: opts.watch,
        minify: opts.minify
    });
}

async function checkCommand(opts) {
    const targetDir = resolveAppDir(opts);
    const result = await runCheck(targetDir, { build: opts.build });
    if (!result.ok) {
        process.exit(1);
    }
}

async function installSkillsCommand(opts) {
    const targetDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
    if (!fs.existsSync(targetDir)) {
        throw new Error(`Directory ${targetDir} does not exist.`);
    }
    runInstallSkills(targetDir, { force: opts.force });
}

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    });
}
