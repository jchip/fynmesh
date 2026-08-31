import inquirer from "inquirer";
import path from "path";
import { assertSupportedFramework, supportedFrameworks } from "./frameworks.js";
import {
    assertCreationValuesAllowed,
    checkAppName,
    checkDirectoryName,
    resolveBaseDir,
} from "./app-config.js";

/**
 * Names the directory the new FynApp will be created under, when that is not
 * simply where the user is standing. Inside this monorepo that is `demo`; a
 * public install creates in the current directory, and saying so adds nothing
 * (FYM-248).
 */
function baseDirHint(): string {
    const cwd = process.cwd();
    const rel = path.relative(cwd, resolveBaseDir(cwd));
    return rel ? ` (under ${rel}/)` : "";
}

export interface AppConfig {
    name: string;
    framework: string;
    dir?: string;
    skipInstall?: boolean;
}

/**
 * Prompts the user for any information not provided via command line args
 */
export async function promptForMissingInfo(args: any): Promise<AppConfig> {
    if (args.name) {
        const result = checkAppName(args.name);
        if (result !== true) throw new Error(result);
    }
    if (args.dir) {
        const result = checkDirectoryName(args.dir);
        if (result !== true) throw new Error(result);
    }
    if (args.framework) {
        assertSupportedFramework(args.framework);
    }

    const questions = [];

    // Ask for app name if not provided
    if (!args.name) {
        questions.push({
            type: "input",
            name: "name",
            message: "What would you like to name your FynApp?",
            default: "fynapp-new",
            validate: checkAppName
        });
    }

    // Ask for framework if not provided
    if (!args.framework) {
        questions.push({
            type: "list",
            name: "framework",
            message: "Which framework would you like to use?",
            choices: supportedFrameworks.map((framework) => ({
                name: framework[0].toUpperCase() + framework.slice(1),
                value: framework,
            }))
        });
    }

    // Ask for directory name if not provided
    if (!args.dir) {
        questions.push({
            type: "input",
            name: "dir",
            message: `Directory name to create${baseDirHint()}`,
            default: (answers: any) => answers.name || args.name,
            validate: checkDirectoryName
        });
    }

    // Get answers to questions
    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    // Combine command line args with prompted answers
    const config = {
        name: args.name || answers.name,
        framework: args.framework || answers.framework,
        dir: args.dir || answers.dir,
        skipInstall: args["skip-install"] || false,
    };
    assertCreationValuesAllowed(config.name, config.dir);
    return config;
}
