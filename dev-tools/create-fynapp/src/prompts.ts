import inquirer from "inquirer";
import { assertSupportedFramework, supportedFrameworks } from "./frameworks.js";
import {
    assertCreationValuesAllowed,
    checkAppName,
    checkDirectoryName,
} from "./app-config.js";

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
            message: "Directory name to create (relative to demo/)",
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
