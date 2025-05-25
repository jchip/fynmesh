import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import AveAzul from "aveazul";
import { AppConfig } from "./prompts";

// Use fs.promises directly - cleaner than promisifying
const readFile = fsPromises.readFile;
const writeFile = fsPromises.writeFile;
const mkdir = fsPromises.mkdir;
const copyFile = fsPromises.copyFile;

/**
 * Async helper to check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fsPromises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

interface GeneratorConfig extends AppConfig {
    targetDir: string;
    rootDir: string;
}

/**
 * Creates a FynApp from templates based on the configuration
 */
export async function generateApp(config: GeneratorConfig): Promise<void> {
    console.log(`\nCreating a new ${config.framework} FynApp in ${config.targetDir}...`);

    // Create src directory
    const srcDir = path.join(config.targetDir, "src");
    if (!(await fileExists(srcDir))) {
        await mkdir(srcDir, { recursive: true });
    }

    // Define template source directory
    const templateDir = path.join(__dirname, "..", "templates", config.framework);

    // Check if templates exist for the selected framework
    if (!(await fileExists(templateDir))) {
        throw new Error(`No templates found for framework: ${config.framework}`);
    }

    // Process the templates
    await processTemplates(templateDir, config);
}

/**
 * Processes template files and generates app files
 */
async function processTemplates(templateDir: string, config: GeneratorConfig): Promise<void> {
    // Use AveAzul's mapSeries to process templates sequentially with better error handling
    const templateTasks = [
        () => createPackageJson(templateDir, config),
        () => createRollupConfig(templateDir, config),
        () => createTsConfig(templateDir, config),
        () => createSourceFiles(templateDir, config)
    ];

    await AveAzul.mapSeries(templateTasks, (task) => task())
        .tap(() => console.log("✅ All templates processed successfully"))
        .catch((error) => {
            console.error("❌ Error processing templates:", error.message);
            throw error;
        });
}

/**
 * Creates package.json for the new FynApp
 */
async function createPackageJson(templateDir: string, config: GeneratorConfig): Promise<void> {
    const templatePath = path.join(templateDir, "package.json.template");

    try {
        let content = await readFile(templatePath, "utf-8");

        // Replace template variables
        content = content
            .replace(/\{\{appName\}\}/g, config.name)
            .replace(/\{\{framework\}\}/g, config.framework);

        // Write the file
        await writeFile(path.join(config.targetDir, "package.json"), content);
        console.log("✅ Created package.json");
    } catch (error) {
        console.error("Error creating package.json:", error);
        throw error;
    }
}

/**
 * Creates rollup.config.mjs for the new FynApp
 */
async function createRollupConfig(templateDir: string, config: GeneratorConfig): Promise<void> {
    const templatePath = path.join(templateDir, "rollup.config.mjs.template");

    try {
        let content = await readFile(templatePath, "utf-8");

        // Replace template variables
        content = content
            .replace(/\{\{appName\}\}/g, config.name)
            .replace(/\{\{framework\}\}/g, config.framework);

        // Write the file
        await writeFile(path.join(config.targetDir, "rollup.config.mjs"), content);
        console.log("✅ Created rollup.config.mjs");
    } catch (error) {
        console.error("Error creating rollup.config.mjs:", error);
        throw error;
    }
}

/**
 * Creates tsconfig.json for the new FynApp if needed
 */
async function createTsConfig(templateDir: string, config: GeneratorConfig): Promise<void> {
    const templatePath = path.join(templateDir, "tsconfig.json.template");

    if (!(await fileExists(templatePath))) {
        return; // Skip if template doesn't exist for this framework
    }

    try {
        let content = await readFile(templatePath, "utf-8");

        // Write the file
        await writeFile(path.join(config.targetDir, "tsconfig.json"), content);
        console.log("✅ Created tsconfig.json");
    } catch (error) {
        console.error("Error creating tsconfig.json:", error);
        throw error;
    }
}

/**
 * Creates source files for the new FynApp
 */
async function createSourceFiles(templateDir: string, config: GeneratorConfig): Promise<void> {
    const srcTemplateDir = path.join(templateDir, "src");
    const targetSrcDir = path.join(config.targetDir, "src");

    if (!(await fileExists(srcTemplateDir))) {
        throw new Error(`Source templates not found for framework: ${config.framework}`);
    }

    // Make sure target src directory exists
    if (!(await fileExists(targetSrcDir))) {
        await mkdir(targetSrcDir, { recursive: true });
    }

    // Read the src template directory
    const files = fs.readdirSync(srcTemplateDir);

    // Use AveAzul's map for parallel file processing with better error handling
    await AveAzul.resolve(files)
        .map(async (file) => {
            const srcFilePath = path.join(srcTemplateDir, file);
            const targetFilePath = path.join(targetSrcDir, file.replace(".template", ""));

            // If it's a template file, process it
            if (file.endsWith(".template")) {
                let content = await readFile(srcFilePath, "utf-8");

                // Replace template variables
                content = content
                    .replace(/\{\{appName\}\}/g, config.name)
                    .replace(/\{\{framework\}\}/g, config.framework);

                // Handle component inclusion based on selected components
                if (content.includes("{{#if counter}}") && config.components) {
                    content = processComponentInclusion(content, config.components);
                }

                // Write the processed file
                await writeFile(targetFilePath.replace(".template", ""), content);
                return `✅ Created ${targetFilePath.replace(".template", "").split("/").pop()}`;
            } else {
                // If it's not a template file, just copy it
                await copyFile(srcFilePath, targetFilePath);
                return `✅ Created ${targetFilePath.split("/").pop()}`;
            }
        })
        .each((message) => console.log(message))
        .catch((error) => {
            console.error("❌ Error creating source files:", error.message);
            throw error;
        });
}

/**
 * Process conditional component inclusion
 */
function processComponentInclusion(content: string, components: string[]): string {
    // Handle counter component
    content = processComponentSection(content, "counter", components.includes("counter"));

    // Handle stats component
    content = processComponentSection(content, "stats", components.includes("stats"));

    // Handle chart component
    content = processComponentSection(content, "chart", components.includes("chart"));

    // Handle projects component
    content = processComponentSection(content, "projects", components.includes("projects"));

    // Handle settings component
    content = processComponentSection(content, "settings", components.includes("settings"));

    return content;
}

/**
 * Process a single component section in the template
 */
function processComponentSection(content: string, componentName: string, include: boolean): string {
    const startTag = `{{#if ${componentName}}}`;
    const endTag = `{{/if ${componentName}}}`;

    let result = content;
    let startIndex = result.indexOf(startTag);

    while (startIndex !== -1) {
        const endIndex = result.indexOf(endTag, startIndex);

        if (endIndex === -1) {
            break; // Malformed template
        }

        const beforeSection = result.substring(0, startIndex);
        const section = result.substring(startIndex + startTag.length, endIndex);
        const afterSection = result.substring(endIndex + endTag.length);

        result = include
            ? beforeSection + section + afterSection
            : beforeSection + afterSection;

        startIndex = result.indexOf(startTag);
    }

    return result;
}
