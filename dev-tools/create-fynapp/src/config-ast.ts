import fs from 'fs';
// import recast from 'recast';
const recast = require('recast');
import { builders as b } from 'ast-types';

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

    // Simple MVP: Update a single shared dependency
    updateSharedDependency(depName: string, config: { singleton?: boolean; requiredVersion?: string }) {
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
}

// Simple test function
export function testConfigManager() {
    const manager = new RollupConfigManager('./test-rollup.config.mjs');

    // Update React dependency to use singleton
    manager.updateSharedDependency('esm-react', {
        singleton: true,
        requiredVersion: '^18.3.0'
    });

    console.log('Modified config:');
    console.log(manager.generate());
}