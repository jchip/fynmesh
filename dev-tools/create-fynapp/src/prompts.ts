import inquirer from "inquirer";

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
    const questions = [];

    // Ask for app name if not provided
    if (!args.name) {
        questions.push({
            type: "input",
            name: "name",
            message: "What would you like to name your FynApp?",
            default: "fynapp-new",
            validate: (input: string) => {
                if (!input.trim()) {
                    return "App name cannot be empty";
                }
                if (!/^[a-z0-9-]+$/.test(input)) {
                    return "App name can only contain lowercase letters, numbers, and hyphens";
                }
                return true;
            }
        });
    }

    // Ask for framework if not provided
    if (!args.framework) {
        questions.push({
            type: "list",
            name: "framework",
            message: "Which framework would you like to use?",
            choices: [
                { name: "React", value: "react" },
                { name: "Vue", value: "vue" },
                { name: "Preact", value: "preact" },
                { name: "Solid", value: "solid" },
                { name: "Marko", value: "marko" }
            ]
        });
    }

    // Ask for directory name if not provided
    if (!args.dir) {
        questions.push({
            type: "input",
            name: "dir",
            message: "Directory name to create (relative to demo/)",
            default: (answers: any) => answers.name || args.name,
            validate: (input: string) => {
                if (!input.trim()) {
                    return "Directory name cannot be empty";
                }
                if (!/^[a-z0-9-]+$/.test(input)) {
                    return "Directory name can only contain lowercase letters, numbers, and hyphens";
                }
                return true;
            }
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
    return {
        name: args.name || answers.name,
        framework: args.framework || answers.framework,
        dir: args.dir || answers.dir,
        skipInstall: args["skip-install"] || false,
        components: answers.components || []
    };
}