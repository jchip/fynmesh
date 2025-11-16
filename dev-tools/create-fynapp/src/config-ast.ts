import fs from 'fs';
import * as recast from 'recast';
import { builders as b } from 'ast-types';
import path from 'path';

export interface FynAppConfigOptions {
    appName: string;
    framework?: 'react' | 'vue' | 'solid' | 'preact' | 'marko';
    projectDir?: string; // Directory to scan for exposes and package.json (defaults to cwd)
    externals?: string[];
    isProduction?: boolean;
}

export class RollupConfigManager {
    private ast: any;
    private configPath: string;

    constructor(configPath: string) {
        this.configPath = configPath;
        this.ast = this.parseConfig();
    }

    private parseConfig() {
        const code = fs.readFileSync(this.configPath, 'utf8');
        // Use the default JavaScript parser since our config is .mjs
        return recast.parse(code);
    }

    // Generate a complete rollup config from scratch
    static generateFynAppConfig(options: FynAppConfigOptions): string {
        const {
            appName,
            framework = 'react',
            projectDir = process.cwd(),
            externals = [],
            isProduction = false
        } = options;

        // Detect React version and exposes
        const reactVersion = this.detectReactVersion(projectDir);
        const exposes = this.detectExposes(projectDir, framework);
        const frameworkConfig = this.getFrameworkConfig(framework, reactVersion);

        // Combine externals
        const allExternals = [...externals, ...frameworkConfig.externals];

        // Detect main entry file
        const srcDir = path.join(projectDir, 'src');
        let mainEntry = 'src/main.ts'; // default fallback

        if (fs.existsSync(srcDir)) {
            const mainFiles = ['main.tsx', 'main.ts', 'index.tsx', 'index.ts'];
            for (const mainFile of mainFiles) {
                if (fs.existsSync(path.join(srcDir, mainFile))) {
                    mainEntry = `src/${mainFile}`;
                    break;
                }
            }
        }

        const configTemplate = `import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import federation from "rollup-plugin-federation";${frameworkConfig.alias ? '\nimport alias from "@rollup/plugin-alias";' : ''}${isProduction ? '\nimport { terser } from "@rollup/plugin-terser";' : ''}

const env = process.env.NODE_ENV || "development";
const isProduction = env === "production";

export default [
  {
    input: [
      "${mainEntry}",
      // this is the filename from federation plugin config.
      "fynapp-entry.js",
    ],
    output: [
      {
        dir: "dist",
        format: "system",
        sourcemap: true,
      },
    ],${allExternals.length > 0 ? `
    external: ${JSON.stringify(allExternals)},` : ''}
    plugins: [
      // Essential plugins in strict order: resolve → federation → alias → typescript
      resolve({
        exportConditions: [env],
      }),
      federation({
        name: "${appName}",
        shareScope: "fynmesh",
        // this filename must be in the input config array
        filename: "fynapp-entry.js",
        exposes: ${JSON.stringify(exposes, null, 10).replace(/\n/g, '\n        ')},
        shared: ${JSON.stringify(frameworkConfig.shared, null, 10).replace(/\n/g, '\n        ')},
        debugging: true,
      }),${frameworkConfig.alias ? `
      // Alias plugin required for React apps to wrap react/react-dom into esm
      alias(${JSON.stringify(frameworkConfig.alias, null, 8).replace(/\n/g, '\n      ')}),` : ''}
      // TypeScript plugin for .ts/.tsx compilation
      typescript({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),${isProduction ? '\n      // Production optimization\n      isProduction ? terser() : null,' : ''}
    ].filter(Boolean),
  },
];`;

        return configTemplate;
    }

    // Detect React version from package.json
    private static detectReactVersion(projectDir: string): string {
        const packageJsonPath = path.join(projectDir, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

                // Check dependencies first, then devDependencies
                const reactVersion = packageJson.dependencies?.['esm-react'] ||
                    packageJson.devDependencies?.['esm-react'] ||
                    packageJson.dependencies?.['react'] ||
                    packageJson.devDependencies?.['react'];

                if (reactVersion) {
                    // Keep the original semver format (with ^ or ~)
                    return reactVersion;
                }
            } catch (error) {
                console.warn('Could not parse package.json:', error.message);
            }
        }

        // Default to React 18 if not found
        return '^18.3.0';
    }

    // Auto-detect exposes from project structure
    private static detectExposes(projectDir: string, framework: string): Record<string, string> {
        const exposes: Record<string, string> = {};
        const srcDir = path.join(projectDir, 'src');

        if (!fs.existsSync(srcDir)) {
            return exposes;
        }

        try {
            // Always expose main entry point
            const mainFiles = ['main.ts', 'main.tsx', 'index.ts', 'index.tsx'];
            for (const mainFile of mainFiles) {
                if (fs.existsSync(path.join(srcDir, mainFile))) {
                    exposes['./main'] = `./src/${mainFile}`;
                    break;
                }
            }

            // Look for common component files to expose
            const commonExposes = this.getCommonExposes(framework);

            for (const [exposeName, patterns] of Object.entries(commonExposes)) {
                for (const pattern of patterns) {
                    const filePath = path.join(srcDir, pattern);
                    if (fs.existsSync(filePath)) {
                        exposes[exposeName] = `./src/${pattern}`;
                        break;
                    }
                }
            }

            // Look for components directory
            const componentsDir = path.join(srcDir, 'components');
            if (fs.existsSync(componentsDir)) {
                const indexFiles = ['index.ts', 'index.tsx', 'index.js'];
                for (const indexFile of indexFiles) {
                    if (fs.existsSync(path.join(componentsDir, indexFile))) {
                        exposes['./components'] = `./src/components/${indexFile}`;
                        break;
                    }
                }
            }

            // Look for utils directory
            const utilsDir = path.join(srcDir, 'utils');
            if (fs.existsSync(utilsDir)) {
                const indexFiles = ['index.ts', 'index.tsx', 'index.js'];
                for (const indexFile of indexFiles) {
                    if (fs.existsSync(path.join(utilsDir, indexFile))) {
                        exposes['./utils'] = `./src/utils/${indexFile}`;
                        break;
                    }
                }
            }

        } catch (error) {
            console.warn('Error detecting exposes:', error.message);
        }

        return exposes;
    }

    // Get common expose patterns for each framework
    private static getCommonExposes(framework: string): Record<string, string[]> {
        const common = {
            './App': ['App.tsx', 'App.ts', 'App.jsx', 'App.js'],
            './config': ['config.ts', 'config.js'],
        };

        switch (framework) {
            case 'react':
            case 'preact':
                return {
                    ...common,
                    './App': ['App.tsx', 'App.jsx', 'App.ts', 'App.js'],
                };

            case 'vue':
                return {
                    ...common,
                    './App': ['App.vue', 'App.ts', 'App.js'],
                };

            case 'solid':
                return {
                    ...common,
                    './App': ['App.tsx', 'App.ts', 'App.jsx', 'App.js'],
                };

            case 'marko':
                return {
                    ...common,
                    './App': ['App.marko', 'App.ts', 'App.js'],
                };

            default:
                return common;
        }
    }

    // Get framework-specific configuration
    private static getFrameworkConfig(framework: string, reactVersion: string) {
        switch (framework) {
            case 'react':
                return {
                    externals: ['esm-react', 'esm-react-dom'],
                    shared: {
                        'esm-react': {
                            import: false,
                            singleton: true,
                            semver: reactVersion,
                        },
                        'esm-react-dom': {
                            import: false,
                            singleton: true,
                            semver: reactVersion,
                        },
                    },
                    alias: {
                        entries: [
                            { find: 'react', replacement: 'esm-react' },
                            { find: 'react-dom/client', replacement: 'esm-react-dom' },
                            { find: 'react-dom', replacement: 'esm-react-dom' },
                        ],
                    },
                };

            case 'vue':
                return {
                    externals: ['vue'],
                    shared: {
                        vue: {
                            import: false,
                            singleton: true,
                            semver: '^3.0.0',
                        },
                    },
                    alias: null,
                };

            case 'solid':
                return {
                    externals: ['solid-js'],
                    shared: {
                        'solid-js': {
                            import: false,
                            singleton: true,
                            semver: '^1.0.0',
                        },
                    },
                    alias: null,
                };

            case 'preact':
                return {
                    externals: ['preact'],
                    shared: {
                        preact: {
                            import: false,
                            singleton: true,
                            semver: '^10.0.0',
                        },
                    },
                    alias: {
                        entries: {
                            react: 'preact/compat',
                            'react-dom': 'preact/compat',
                        },
                    },
                };

            case 'marko':
                return {
                    externals: ['marko'],
                    shared: {
                        marko: {
                            import: false,
                            singleton: true,
                            semver: '^5.0.0',
                        },
                    },
                    alias: null,
                };

            default:
                return {
                    externals: [],
                    shared: {},
                    alias: null,
                };
        }
    }

    // Create a new config file from scratch
    static createFynAppConfig(configPath: string, options: FynAppConfigOptions): void {
        const configContent = this.generateFynAppConfig(options);
        fs.writeFileSync(configPath, configContent);
    }

    // Simple MVP: Update a single shared dependency
    updateSharedDependency(depName: string, config: { singleton?: boolean; semver?: string }) {
        let found = false;
        const self = this;

        recast.visit(this.ast, {
            visitProperty(path: any) {
                // Look for 'shared' property anywhere in the AST
                if (path.value.key &&
                    ((path.value.key.type === 'Identifier' && path.value.key.name === 'shared') ||
                        (path.value.key.type === 'Literal' && path.value.key.value === 'shared')) &&
                    path.value.value.type === 'ObjectExpression') {

                    const sharedObj = path.value.value;

                    // Find existing dependency or add new one
                    const existingProp = sharedObj.properties.find((prop: any) =>
                        prop.key &&
                        ((prop.key.type === 'Literal' && prop.key.value === depName) ||
                            (prop.key.type === 'Identifier' && prop.key.name === depName))
                    );

                    if (existingProp) {
                        // Update existing
                        self.updateObjectProperties(existingProp.value, config);
                    } else {
                        // Add new
                        sharedObj.properties.push(
                            b.property(
                                'init',
                                b.literal(depName),
                                self.configToAST(config)
                            )
                        );
                    }
                    found = true;
                }
                this.traverse(path);
            }
        });

        if (!found) {
            console.warn(`Could not find 'shared' property in federation config`);
        }
    }

    // Ensure federation plugin is present and properly configured
    ensureFederationPlugin(packageJsonPath?: string): boolean {
        const packageJson = packageJsonPath ?
            JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) :
            this.findPackageJson();

        if (!packageJson) {
            console.warn('Could not find package.json to get app name');
            return false;
        }

        const appName = packageJson.name;
        let federationFound = false;
        let pluginsArray: any = null;

        // First, find the plugins array and check if federation exists
        recast.visit(this.ast, {
            visitProperty(path: any) {
                if (path.value.key &&
                    ((path.value.key.type === 'Identifier' && path.value.key.name === 'plugins') ||
                        (path.value.key.type === 'Literal' && path.value.key.value === 'plugins')) &&
                    path.value.value.type === 'ArrayExpression') {

                    pluginsArray = path.value.value;

                    // Check if federation plugin already exists
                    federationFound = pluginsArray.elements.some((element: any) => {
                        return element && element.type === 'CallExpression' &&
                            element.callee && element.callee.name === 'federation';
                    });
                }
                this.traverse(path);
            }
        });

        // If federation plugin not found, add it
        if (!federationFound && pluginsArray) {
            this.addFederationPlugin(pluginsArray, appName);
        } else if (federationFound) {
            // Update existing federation config
            this.updateFederationConfig(appName);
        }

        return true;
    }

    // Add federation plugin to plugins array
    private addFederationPlugin(pluginsArray: any, appName: string) {
        const federationCall = b.callExpression(
            b.identifier('federation'),
            [
                b.objectExpression([
                    b.property('init', b.identifier('name'), b.literal(appName)),
                    b.property('init', b.identifier('shareScope'), b.literal('fynmesh')),
                    b.property('init', b.identifier('filename'), b.literal('fynapp-entry.js')),
                    b.property('init', b.identifier('exposes'), b.objectExpression([])),
                    b.property('init', b.identifier('remotes'), b.objectExpression([])),
                    b.property('init', b.identifier('shared'), b.objectExpression([]))
                ])
            ]
        );

        // Find the correct position: after resolve, before alias/typescript
        // Plugin order: resolve → federation → alias → typescript → terser
        let insertIndex = -1;

        // Look for resolve plugin
        const resolveIndex = pluginsArray.elements.findIndex((element: any) => {
            return element && element.type === 'CallExpression' &&
                element.callee && element.callee.name === 'resolve';
        });

        if (resolveIndex !== -1) {
            // Insert federation right after resolve
            insertIndex = resolveIndex + 1;
        } else {
            // If no resolve plugin, look for alias or typescript to insert before them
            const aliasIndex = pluginsArray.elements.findIndex((element: any) => {
                return element && element.type === 'CallExpression' &&
                    element.callee && element.callee.name === 'alias';
            });

            const typescriptIndex = pluginsArray.elements.findIndex((element: any) => {
                return element && element.type === 'CallExpression' &&
                    element.callee && element.callee.name === 'typescript';
            });

            if (aliasIndex !== -1) {
                insertIndex = aliasIndex;
            } else if (typescriptIndex !== -1) {
                insertIndex = typescriptIndex;
            } else {
                // If none found, add at the beginning
                insertIndex = 0;
            }
        }

        if (insertIndex !== -1) {
            pluginsArray.elements.splice(insertIndex, 0, federationCall);
        } else {
            pluginsArray.elements.push(federationCall);
        }
    }

    // Update existing federation plugin configuration
    private updateFederationConfig(appName: string) {
        const self = this;
        recast.visit(this.ast, {
            visitCallExpression(path: any) {
                if (path.value.callee && path.value.callee.name === 'federation' &&
                    path.value.arguments && path.value.arguments.length > 0 &&
                    path.value.arguments[0].type === 'ObjectExpression') {

                    const configObj = path.value.arguments[0];

                    // Update name property
                    self.updateOrAddProperty(configObj, 'name', b.literal(appName));

                    // Update shareScope property
                    self.updateOrAddProperty(configObj, 'shareScope', b.literal('fynmesh'));
                }
                this.traverse(path);
            }
        });
    }

    // Helper to update or add a property to an object
    private updateOrAddProperty(objNode: any, propName: string, value: any) {
        const existingProp = objNode.properties.find((prop: any) =>
            prop.key &&
            ((prop.key.type === 'Identifier' && prop.key.name === propName) ||
                (prop.key.type === 'Literal' && prop.key.value === propName))
        );

        if (existingProp) {
            existingProp.value = value;
        } else {
            objNode.properties.push(
                b.property('init', b.identifier(propName), value)
            );
        }
    }

    // Ensure federation import is present
    ensureFederationImport(): boolean {
        let importFound = false;

        recast.visit(this.ast, {
            visitImportDeclaration(path: any) {
                if (path.value.source &&
                    path.value.source.value === 'rollup-plugin-federation') {
                    importFound = true;
                }
                this.traverse(path);
            }
        });

        if (!importFound) {
            this.addFederationImport();
        }

        return true;
    }

    // Add federation import at the top
    private addFederationImport() {
        const importDecl = b.importDeclaration(
            [b.importDefaultSpecifier(b.identifier('federation'))],
            b.literal('rollup-plugin-federation')
        );

        // Add after other plugin imports
        const program = this.ast.program;
        let insertIndex = 0;

        // Find the last import statement
        for (let i = 0; i < program.body.length; i++) {
            if (program.body[i].type === 'ImportDeclaration') {
                insertIndex = i + 1;
            } else {
                break;
            }
        }

        program.body.splice(insertIndex, 0, importDecl);
    }

    // Find package.json in the same directory as rollup config
    private findPackageJson(): any {
        const configDir = path.dirname(this.configPath);
        const packageJsonPath = path.join(configDir, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
            return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        }
        return null;
    }

    // Check if rollup-plugin-federation is in devDependencies
    checkFederationDependency(packageJsonPath?: string): {
        hasDevDep: boolean;
        hasFynDep: boolean;
        packageJson: any
    } {
        const packageJson = packageJsonPath ?
            JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) :
            this.findPackageJson();

        if (!packageJson) {
            return { hasDevDep: false, hasFynDep: false, packageJson: null };
        }

        const hasDevDep = packageJson.devDependencies &&
            'rollup-plugin-federation' in packageJson.devDependencies;

        const hasFynDep = packageJson.fyn &&
            packageJson.fyn.devDependencies &&
            'rollup-plugin-federation' in packageJson.fyn.devDependencies;

        return { hasDevDep, hasFynDep, packageJson };
    }

    private updateObjectProperties(objNode: any, updates: any) {
        Object.keys(updates).forEach(key => {
            const existingProp = objNode.properties.find((prop: any) =>
                prop.key &&
                ((prop.key.type === 'Identifier' && prop.key.name === key) ||
                    (prop.key.type === 'Literal' && prop.key.value === key))
            );
            if (existingProp) {
                existingProp.value = this.valueToAST(updates[key]);
            } else {
                objNode.properties.push(
                    b.property(
                        'init',
                        b.identifier(key),
                        this.valueToAST(updates[key])
                    )
                );
            }
        });
    }

    private configToAST(config: any) {
        const properties = Object.keys(config).map(key =>
            b.property(
                'init',
                b.identifier(key),
                this.valueToAST(config[key])
            )
        );
        return b.objectExpression(properties);
    }

    private valueToAST(value: any) {
        if (typeof value === 'string') return b.literal(value);
        if (typeof value === 'boolean') return b.literal(value);
        if (typeof value === 'number') return b.literal(value);
        if (typeof value === 'object') return this.configToAST(value);
        return b.literal(value);
    }

    // Generate the modified code
    generate(): string {
        return recast.print(this.ast).code;
    }

    // Save back to file
    save(): void {
        fs.writeFileSync(this.configPath, this.generate());
    }

    // Enforce correct plugin order: resolve → federation → alias → typescript → terser
    enforcePluginOrder(): boolean {
        let pluginsArray: any = null;
        let found = false;

        // Find the plugins array
        recast.visit(this.ast, {
            visitProperty(path: any) {
                if (path.value.key &&
                    ((path.value.key.type === 'Identifier' && path.value.key.name === 'plugins') ||
                        (path.value.key.type === 'Literal' && path.value.key.value === 'plugins')) &&
                    path.value.value.type === 'ArrayExpression') {

                    pluginsArray = path.value.value;
                    found = true;
                }
                this.traverse(path);
            }
        });

        if (!found || !pluginsArray) {
            console.warn('Could not find plugins array to enforce order');
            return false;
        }

        // Extract all plugins with their configurations
        const plugins = pluginsArray.elements.map((element: any, index: number) => {
            if (!element || element.type !== 'CallExpression' || !element.callee) {
                return { name: 'unknown', element, originalIndex: index };
            }

            const name = element.callee.name || 'unknown';
            return { name, element, originalIndex: index };
        }).filter((plugin: any) => plugin.name !== 'unknown');

        // Define the correct order
        const correctOrder = ['resolve', 'federation', 'alias', 'typescript', 'terser'];

        // Preserve original order before sorting
        const originalOrder = plugins.map((plugin: any) => plugin.name);

        // Sort plugins according to the correct order
        const sortedPlugins = [...plugins].sort((a: any, b: any) => {
            const aIndex = correctOrder.indexOf(a.name);
            const bIndex = correctOrder.indexOf(b.name);

            // If plugin not in our order list, put it at the end
            const aOrder = aIndex === -1 ? 999 : aIndex;
            const bOrder = bIndex === -1 ? 999 : bIndex;

            return aOrder - bOrder;
        });

        // Check if reordering is needed
        const expectedOrder = sortedPlugins.map((plugin: any) => plugin.name);

        const needsReordering = !originalOrder.every((name, index) => name === expectedOrder[index]);

        if (needsReordering) {
            // Clear the plugins array and rebuild it in correct order
            pluginsArray.elements = sortedPlugins.map((plugin: any) => plugin.element);

            return true;
        } else {
            return false;
        }
    }

    // Enhanced method that ensures federation plugin and enforces order
    ensureFederationPluginWithOrder(packageJsonPath?: string): boolean {
        // First ensure federation plugin exists
        const federationAdded = this.ensureFederationPlugin(packageJsonPath);

        // Then enforce correct plugin order
        const orderChanged = this.enforcePluginOrder();

        return federationAdded || orderChanged;
    }
}

// Simple test function
export function testConfigManager() {
    const manager = new RollupConfigManager('./test-rollup.config.mjs');

    // Update React dependency to use singleton
    manager.updateSharedDependency('esm-react', {
        singleton: true,
        semver: '^18.3.0'
    });

    console.log('Modified config:');
    console.log(manager.generate());
}
