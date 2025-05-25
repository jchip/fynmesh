import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import AveAzul from "aveazul";

/**
 * Utility functions using AveAzul for better async flow control
 */

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

/**
 * Batch process multiple files with AveAzul's map utility
 */
export async function processFilesInParallel(
    filePaths: string[],
    processor: (content: string, filePath: string) => Promise<string>
): Promise<string[]> {
    return AveAzul.resolve(filePaths)
        .filter(async (filePath) => await fileExists(filePath))
        .map(async (filePath) => {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            return processor(content, filePath);
        })
        .tap((results) => console.log(`✅ Processed ${results.length} files`))
        .catch((error) => {
            console.error("❌ Error processing files:", error.message);
            throw error;
        });
}

/**
 * Sequential file processing with AveAzul's mapSeries
 */
export async function processFilesSequentially(
    filePaths: string[],
    processor: (content: string, filePath: string) => Promise<string>
): Promise<string[]> {
    return AveAzul.resolve(filePaths)
        .filter(async (filePath) => await fileExists(filePath))
        .mapSeries(async (filePath) => {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            return processor(content, filePath);
        })
        .tap((results) => console.log(`✅ Sequentially processed ${results.length} files`))
        .catch((error) => {
            console.error("❌ Error in sequential processing:", error.message);
            throw error;
        });
}

/**
 * Create multiple directories with better error handling
 */
export async function createDirectories(directories: string[]): Promise<void> {
    return AveAzul.resolve(directories)
        .filter(async (dir) => !(await fileExists(dir)))
        .map((dir) => fsPromises.mkdir(dir, { recursive: true }))
        .tap((createdDirs) => {
            if (createdDirs.length > 0) {
                console.log(`📁 Created ${createdDirs.length} directories`);
            }
        })
        .return(undefined)
        .catch((error) => {
            console.error("❌ Error creating directories:", error.message);
            throw error;
        });
}

/**
 * Copy files with progress tracking using AveAzul's each
 */
export async function copyFilesWithProgress(
    fileMappings: Array<{ src: string; dest: string }>
): Promise<void> {
    return AveAzul.resolve(fileMappings)
        .filter(async ({ src }) => await fileExists(src))
        .map(async ({ src, dest }) => {
            // Ensure destination directory exists
            const destDir = path.dirname(dest);
            if (!(await fileExists(destDir))) {
                await fsPromises.mkdir(destDir, { recursive: true });
            }

            await fsPromises.copyFile(src, dest);
            return { src, dest };
        })
        .each(({ src, dest }) => {
            console.log(`📄 Copied: ${path.basename(src)} → ${path.basename(dest)}`);
        })
        .return(undefined)
        .catch((error) => {
            console.error("❌ Error copying files:", error.message);
            throw error;
        });
}

/**
 * Validate multiple files exist with AveAzul's some utility
 */
export async function validateRequiredFiles(
    filePaths: string[],
    minimumRequired: number = 1
): Promise<boolean> {
    const validationPromises = filePaths.map(async (filePath) => {
        return await fileExists(filePath);
    });

    return AveAzul.some(validationPromises, minimumRequired)
        .then((results) => {
            console.log(`✅ Found ${results.filter(Boolean).length} of ${filePaths.length} required files`);
            return true;
        })
        .catch(() => {
            console.error(`❌ Less than ${minimumRequired} required files found`);
            return false;
        });
}

/**
 * Template processing with timeout and retry using AveAzul utilities
 */
export async function processTemplateWithRetry(
    templatePath: string,
    variables: Record<string, string>,
    maxRetries: number = 3
): Promise<string> {
    const processTemplate = async (): Promise<string> => {
        const content = await fsPromises.readFile(templatePath, 'utf-8');

        // Replace template variables
        let processedContent = content;
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processedContent = processedContent.replace(regex, value);
        });

        return processedContent;
    };

    return AveAzul.try(processTemplate)
        .timeout(5000, `Template processing timed out for ${templatePath}`)
        .catch((error) => {
            if (maxRetries > 0) {
                console.warn(`⚠️  Retrying template processing (${maxRetries} attempts left)`);
                return AveAzul.delay(1000)
                    .then(() => processTemplateWithRetry(templatePath, variables, maxRetries - 1));
            }
            throw error;
        });
}

/**
 * Resource management example using AveAzul's using and disposer
 */
export async function processFileWithCleanup<T>(
    filePath: string,
    processor: (content: string) => Promise<T>
): Promise<T> {
    const getFileResource = () => {
        return AveAzul.try(async () => {
            const content = await fsPromises.readFile(filePath, 'utf-8');
            return {
                content,
                cleanup: () => console.log(`🧹 Cleaned up resources for ${path.basename(filePath)}`)
            };
        }).disposer((resource) => resource.cleanup());
    };

    return AveAzul.using(getFileResource(), async (resource) => {
        return processor(resource.content);
    });
}

/**
 * Batch operations with progress reporting
 */
export async function batchOperationWithProgress<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    batchSize: number = 5
): Promise<R[]> {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }

    const results: R[] = [];

    return AveAzul.resolve(batches)
        .mapSeries(async (batch, index) => {
            console.log(`📊 Processing batch ${index + 1}/${batches.length} (${batch.length} items)`);

            const batchResults = await AveAzul.resolve(batch)
                .map(operation);

            results.push(...batchResults);
            return batchResults;
        })
        .then(() => {
            console.log(`✅ Completed all ${batches.length} batches (${results.length} total items)`);
            return results;
        })
        .catch((error) => {
            console.error("❌ Error in batch processing:", error.message);
            throw error;
        });
}
