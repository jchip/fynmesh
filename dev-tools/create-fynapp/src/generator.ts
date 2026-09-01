import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AveAzul from "./aveazul-compat.js";
import type { AppConfig } from "./prompts.js";
import { normalizeFrameworkName, resolveTemplate } from "./frameworks.js";
import { kernelVersion } from "./kernel-version.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface GeneratorConfig extends AppConfig {
    targetDir: string;
    rootDir: string;
}

/** What `generateApp` scaffolded, so callers can tell the user what they got. */
export interface GeneratedApp {
    /** the normalized framework name */
    framework: string;
    /** true when no template exists for this framework and the generic one was used */
    generic: boolean;
    /** the template directory the files came from */
    templateDir: string;
}

/**
 * Files every template dir may hold at its root, each with its own writer.
 * Anything else ending in `.template` is stamped as-is (see createExtraFiles).
 */
const wellKnownRootTemplates = new Set([
    "package.json.template",
    "rollup.config.ts.template",
    "tsconfig.json.template",
]);

/**
 * Substitute the template variables.
 *
 * Only the unspaced `{{appName}}` form is replaced, which is what lets Vue's
 * own `{{ appName }}` interpolation survive in an SFC template (FYM-270).
 *
 * `{{kernelVersion}}` comes from create-fynapp's own manifest rather than the
 * caller's config -- a scaffolded app has to be pinned to the kernel these
 * templates were written against, and that is not the user's choice to make
 * (FYM-285).
 */
function applyTemplateVars(content: string, config: GeneratorConfig): string {
    return content
        .replace(/\{\{appName\}\}/g, config.name)
        .replace(/\{\{appNamePascal\}\}/g, toPascalCase(config.name))
        .replace(/\{\{framework\}\}/g, config.framework)
        .replace(/\{\{kernelVersion\}\}/g, kernelVersion());
}

/**
 * Convert kebab-case or snake_case to PascalCase
 */
function toPascalCase(str: string): string {
    return str
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Creates a FynApp from templates based on the configuration
 */
export async function generateApp(config: GeneratorConfig): Promise<GeneratedApp> {
    const framework = normalizeFrameworkName(config.framework);
    const resolved: GeneratorConfig = { ...config, framework };
    const { dir: templateDir, generic } = resolveTemplate(framework);

    console.log(`\nCreating a new ${framework} FynApp in ${resolved.targetDir}...`);
    if (generic) {
        // Not an error: an agent is expected to finish the conversion, and it
        // starts from a scaffold that already builds (FYM-273).
        console.log(
            `ℹ️  No built-in template for "${framework}" — scaffolding the framework-generic\n` +
            `   FynApp skeleton plus AGENT-TODO.md, a checklist for converting it to ${framework}.`,
        );
    }

    // Create src directory
    const srcDir = path.join(resolved.targetDir, "src");
    if (!(await fileExists(srcDir))) {
        await mkdir(srcDir, { recursive: true });
    }

    if (!(await fileExists(templateDir))) {
        throw new Error(`No templates found at ${templateDir}`);
    }

    // Process the templates
    await processTemplates(templateDir, resolved);

    return { framework, generic, templateDir };
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
        () => createSourceFiles(templateDir, config),
        () => createExtraFiles(templateDir, config)
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

        content = applyTemplateVars(content, config);

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
    const templatePath = path.join(templateDir, "rollup.config.ts.template");

    try {
        let content = await readFile(templatePath, "utf-8");

        content = applyTemplateVars(content, config);

        // Write the file
        await writeFile(path.join(config.targetDir, "rollup.config.ts"), content);
        console.log("✅ Created rollup.config.ts");
    } catch (error) {
        console.error("Error creating rollup.config.ts:", error);
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

                content = applyTemplateVars(content, config);

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
 * Stamps any other `*.template` file sitting at the template root — the generic
 * template's `AGENT-TODO.md`, and whatever a future template needs beside the
 * three well-known ones.
 */
async function createExtraFiles(templateDir: string, config: GeneratorConfig): Promise<void> {
    const entries = await fsPromises.readdir(templateDir, { withFileTypes: true });
    const extras = entries.filter(
        (entry) =>
            entry.isFile() &&
            entry.name.endsWith(".template") &&
            !wellKnownRootTemplates.has(entry.name),
    );

    for (const entry of extras) {
        const content = await readFile(path.join(templateDir, entry.name), "utf-8");
        const targetName = entry.name.replace(/\.template$/, "");
        await writeFile(
            path.join(config.targetDir, targetName),
            applyTemplateVars(content, config),
        );
        console.log(`✅ Created ${targetName}`);
    }
}
