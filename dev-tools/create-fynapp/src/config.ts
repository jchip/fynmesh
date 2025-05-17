import fs from "fs";
import * as fsPromises from "fs/promises";
import path from "path";

/**
 * FynApp configuration structure
 */
export interface FynAppConfig {
    // Basic info
    name: string;
    framework: string;
    version: string;
    created: string; // ISO date string
    lastUpdated: string; // ISO date string

    // Component info
    components: string[];

    // Dependency management
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;

    // Build configuration
    buildOptions: {
        minify: boolean;
        sourceMaps: boolean;
        externals: string[];
    };

    // Deployment configuration
    deployTargets: {
        dev?: string;
        staging?: string;
        prod?: string;
    };

    // Federation configuration
    federation: {
        name: string;
        shareScope: string;
        exposedModules: Record<string, string>;
        sharedDependencies: Record<string, {
            singleton: boolean;
            requiredVersion: string;
        }>;
    };
}

/**
 * Default configuration
 */
const defaultConfig: Partial<FynAppConfig> = {
    version: "1.0.0",
    buildOptions: {
        minify: true,
        sourceMaps: true,
        externals: []
    },
    deployTargets: {},
    federation: {
        name: "fynapp", // Default name, will be overridden by app's actual name
        shareScope: "fynmesh",
        exposedModules: {},
        sharedDependencies: {}
    }
};

/**
 * Configuration storage for FynApps
 */
export class ConfigManager {
    private configDir: string;
    private appsConfigDir: string;

    constructor() {
        this.configDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".fynmesh");
        this.appsConfigDir = path.join(this.configDir, "fynapps");
    }

    /**
     * Initialize the configuration directory structure
     */
    async init(): Promise<void> {
        try {
            // Create config directories if they don't exist
            if (!fs.existsSync(this.configDir)) {
                await fsPromises.mkdir(this.configDir, { recursive: true });
            }

            if (!fs.existsSync(this.appsConfigDir)) {
                await fsPromises.mkdir(this.appsConfigDir, { recursive: true });
            }
        } catch (error) {
            console.error("Failed to initialize configuration directories:", error);
            throw error;
        }
    }

    /**
     * Create a new FynApp config
     */
    async createConfig(appDir: string, config: Partial<FynAppConfig>): Promise<FynAppConfig> {
        await this.init();

        const now = new Date().toISOString();
        const fullConfig: FynAppConfig = {
            ...defaultConfig,
            ...config,
            created: now,
            lastUpdated: now
        } as FynAppConfig;

        // Ensure federation.name is set correctly
        if (fullConfig.federation && !fullConfig.federation.name && fullConfig.name) {
            fullConfig.federation.name = fullConfig.name;
        }

        // Generate configuration ID from app name
        const configId = this.getConfigId(fullConfig.name);

        // Store the config
        await this.saveConfig(configId, appDir, fullConfig);

        return fullConfig;
    }

    /**
     * Get a FynApp config by app directory
     */
    async getConfigByDir(appDir: string): Promise<FynAppConfig | null> {
        await this.init();

        try {
            // Resolve absolute path
            const absAppDir = path.resolve(appDir);

            // Check if index file exists
            const indexPath = path.join(this.configDir, "index.json");
            if (!fs.existsSync(indexPath)) {
                return null;
            }

            // Read the index file
            const indexContent = await fsPromises.readFile(indexPath, "utf-8");
            const index = JSON.parse(indexContent);

            // Find the config ID for this directory
            const configId = index[absAppDir];
            if (!configId) {
                return null;
            }

            // Get the config
            return await this.getConfig(configId);
        } catch (error) {
            console.error("Failed to get config by directory:", error);
            return null;
        }
    }

    /**
     * Get a FynApp config by name
     */
    async getConfigByName(name: string): Promise<FynAppConfig | null> {
        const configId = this.getConfigId(name);
        return await this.getConfig(configId);
    }

    /**
     * Get a FynApp config by ID
     */
    async getConfig(configId: string): Promise<FynAppConfig | null> {
        await this.init();

        const configPath = path.join(this.appsConfigDir, `${configId}.json`);

        if (!fs.existsSync(configPath)) {
            return null;
        }

        try {
            const configContent = await fsPromises.readFile(configPath, "utf-8");
            return JSON.parse(configContent);
        } catch (error) {
            console.error(`Failed to read config file ${configPath}:`, error);
            return null;
        }
    }

    /**
     * Update a FynApp config
     */
    async updateConfig(appDir: string, updates: Partial<FynAppConfig>): Promise<FynAppConfig | null> {
        const config = await this.getConfigByDir(appDir);

        if (!config) {
            console.error(`No configuration found for ${appDir}`);
            return null;
        }

        // Apply updates
        const updatedConfig: FynAppConfig = {
            ...config,
            ...updates,
            lastUpdated: new Date().toISOString()
        };

        // Preserve nested objects that might be overwritten
        if (updates.buildOptions) {
            updatedConfig.buildOptions = {
                ...config.buildOptions,
                ...updates.buildOptions
            };
        }

        if (updates.deployTargets) {
            updatedConfig.deployTargets = {
                ...config.deployTargets,
                ...updates.deployTargets
            };
        }

        if (updates.federation) {
            updatedConfig.federation = {
                ...config.federation,
                ...updates.federation
            };

            if (updates.federation.exposedModules) {
                updatedConfig.federation.exposedModules = {
                    ...config.federation.exposedModules,
                    ...updates.federation.exposedModules
                };
            }

            if (updates.federation.sharedDependencies) {
                updatedConfig.federation.sharedDependencies = {
                    ...config.federation.sharedDependencies,
                    ...updates.federation.sharedDependencies
                };
            }
        }

        // Store the updated config
        const configId = this.getConfigId(config.name);
        await this.saveConfig(configId, appDir, updatedConfig);

        return updatedConfig;
    }

    /**
     * Generate a configuration ID from an app name
     */
    private getConfigId(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    }

    /**
     * Save a config file and update the index
     */
    private async saveConfig(configId: string, appDir: string, config: FynAppConfig): Promise<void> {
        await this.init();

        try {
            // Resolve absolute path
            const absAppDir = path.resolve(appDir);

            // Save the config file
            const configPath = path.join(this.appsConfigDir, `${configId}.json`);
            await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2));

            // Update the index file
            const indexPath = path.join(this.configDir, "index.json");
            let index = {};

            if (fs.existsSync(indexPath)) {
                const indexContent = await fsPromises.readFile(indexPath, "utf-8");
                index = JSON.parse(indexContent);
            }

            // Add/update the entry
            index[absAppDir] = configId;

            // Save the index
            await fsPromises.writeFile(indexPath, JSON.stringify(index, null, 2));

            console.log(`Configuration saved for ${config.name}`);
        } catch (error) {
            console.error(`Failed to save config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract configuration from an existing FynApp
     */
    async extractConfigFromApp(appDir: string): Promise<FynAppConfig | null> {
        try {
            // Check if the app exists
            if (!fs.existsSync(appDir)) {
                throw new Error(`App directory ${appDir} does not exist`);
            }

            // Read package.json
            const packageJsonPath = path.join(appDir, "package.json");
            if (!fs.existsSync(packageJsonPath)) {
                throw new Error(`package.json not found in ${appDir}`);
            }

            const packageJson = JSON.parse(await fsPromises.readFile(packageJsonPath, "utf-8"));

            // Read rollup.config.mjs to extract federation config
            const rollupConfigPath = path.join(appDir, "rollup.config.mjs");
            let federationConfig = {
                name: packageJson.name,
                shareScope: "fynmesh",
                exposedModules: {},
                sharedDependencies: {}
            };

            if (fs.existsSync(rollupConfigPath)) {
                // We'll use a simplified approach to extract info from the rollup config
                // In a real implementation, you might want to use a more robust parser
                const rollupContent = await fsPromises.readFile(rollupConfigPath, "utf-8");

                // Extract federation name
                const nameMatch = rollupContent.match(/name:\s*["']([^"']+)["']/);
                if (nameMatch) {
                    federationConfig.name = nameMatch[1];
                }

                // Extract share scope
                const shareScopeMatch = rollupContent.match(/shareScope:\s*["']([^"']+)["']/);
                if (shareScopeMatch) {
                    federationConfig.shareScope = shareScopeMatch[1];
                }

                // Extract exposed modules (simplified approach)
                const exposesSection = rollupContent.match(/exposes:\s*\{([^}]+)\}/s);
                if (exposesSection) {
                    const exposesContent = exposesSection[1];
                    const moduleMatches = [...exposesContent.matchAll(/["'](.+?)["']:\s*["'](.+?)["']/g)];

                    moduleMatches.forEach(match => {
                        federationConfig.exposedModules[match[1]] = match[2];
                    });
                }

                // Extract shared dependencies (simplified approach)
                const sharedSection = rollupContent.match(/shared:\s*\{([^}]+)\}/s);
                if (sharedSection) {
                    const sharedContent = sharedSection[1];
                    const depMatches = [...sharedContent.matchAll(/["']([^"']+)["']:\s*\{([^}]+)\}/g)];

                    depMatches.forEach(match => {
                        const depName = match[1];
                        const depConfig = match[2];

                        const singleton = /singleton:\s*(true|false)/.test(depConfig)
                            ? /singleton:\s*true/.test(depConfig)
                            : false;

                        const versionMatch = depConfig.match(/requiredVersion:\s*["']([^"']+)["']/);
                        const requiredVersion = versionMatch ? versionMatch[1] : "*";

                        federationConfig.sharedDependencies[depName] = {
                            singleton,
                            requiredVersion
                        };
                    });
                }
            }

            // Create the config
            const config: FynAppConfig = {
                name: packageJson.name,
                framework: this.detectFramework(packageJson),
                version: packageJson.version || "1.0.0",
                created: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
                components: [],  // We'd need to scan the code to determine this accurately
                dependencies: packageJson.dependencies || {},
                devDependencies: packageJson.devDependencies || {},
                buildOptions: {
                    minify: true,
                    sourceMaps: true,
                    externals: []
                },
                deployTargets: {},
                federation: federationConfig
            };

            // Save the config
            const configId = this.getConfigId(config.name);
            await this.saveConfig(configId, appDir, config);

            console.info(`Extracted configuration for ${config.name}`);
            return config;
        } catch (error) {
            console.error(`Failed to extract config from app: ${error.message}`);
            return null;
        }
    }

    /**
     * Detect the framework used by a FynApp
     */
    private detectFramework(packageJson: any): string {
        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies
        };

        if (dependencies["vue"] || dependencies["@vue/compiler-sfc"]) {
            return "vue";
        }

        if (dependencies["preact"]) {
            return "preact";
        }

        if (dependencies["solid-js"]) {
            return "solid";
        }

        if (dependencies["marko"]) {
            return "marko";
        }

        // Default to React
        return "react";
    }
}