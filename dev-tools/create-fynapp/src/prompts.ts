import inquirer from "inquirer";
import { assertSupportedFramework, supportedFrameworks } from "./frameworks.js";
import {
    assertValidCreationValues,
    validateAppName,
    validateDirectoryName,
} from "./app-config.js";

export interface AppConfig {
    name: string;
    framework: string;
    dir?: string;
    skipInstall?: boolean;
    components?: string[];
}

/**
 * Prompts the user for any information not provided via command line args
 */
export async function promptForMissingInfo(args: any): Promise<AppConfig> {
    if (args.name) {
        const result = validateAppName(args.name);
        if (result !== true) throw new Error(result);
    }
    if (args.dir) {
        const result = validateDirectoryName(args.dir);
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
            validate: validateAppName
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
            validate: validateDirectoryName
        });
    }

    // Ask for components to include
    questions.push({
        type: "checkbox",
        name: "components",
        message: "Which components would you like to include?",
        choices: [
            { name: "Counter", value: "counter", checked: true },
            { name: "Stats Cards", value: "stats", checked: true },
            { name: "Chart", value: "chart" },
            { name: "Projects Table", value: "projects" },
            { name: "Settings", value: "settings" }
        ]
    });

    // Get answers to questions
    const answers = await inquirer.prompt(questions);

    // Combine command line args with prompted answers
    const config = {
        name: args.name || answers.name,
        framework: args.framework || answers.framework,
        dir: args.dir || answers.dir,
        skipInstall: args["skip-install"] || false,
        components: answers.components || []
    };
    assertValidCreationValues(config.name, config.dir);
    return config;
}
