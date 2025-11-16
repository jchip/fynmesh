import fs from 'fs';
import path from 'path';
import { RollupConfigManager } from '../../src/config-ast';

describe('Create New FynApp', () => {
    const testDemoDir = path.join(__dirname, '../demo');
    const appDir = path.join(testDemoDir, 'test-fynapp');

    beforeAll(() => {
        // Clean up any existing test app
        if (fs.existsSync(appDir)) {
            fs.rmSync(appDir, { recursive: true, force: true });
        }
        // Ensure test/demo directory exists
        fs.mkdirSync(testDemoDir, { recursive: true });
    });

    afterAll(() => {
        // Clean up after tests
        // if (fs.existsSync(appDir)) {
        //     fs.rmSync(appDir, { recursive: true, force: true });
        // }
    });

    describe('Complete App Creation', () => {
        it('should create a complete React FynApp with all necessary files', () => {
            // Create app directory structure
            fs.mkdirSync(appDir, { recursive: true });
            fs.mkdirSync(path.join(appDir, 'src'), { recursive: true });
            fs.mkdirSync(path.join(appDir, 'src', 'components'), { recursive: true });
            fs.mkdirSync(path.join(appDir, 'src', 'utils'), { recursive: true });

            // Create package.json
            const packageJson = {
                name: 'test-fynapp',
                version: '1.0.0',
                type: 'module',
                scripts: {
                    dev: 'rollup -c -w',
                    build: 'rollup -c',
                    serve: 'serve dist -p 3001'
                },
                dependencies: {
                },
                devDependencies: {
                    '@rollup/plugin-alias': '^5.0.0',
                    '@rollup/plugin-node-resolve': '^15.0.0',
                    '@rollup/plugin-typescript': '^11.0.0',
                    '@types/react': '^18.3.0',
                    '@types/react-dom': '^18.3.0',
                    'create-fynapp': '^1.0.0',
                    'react': '^18.3.0',
                    'react-dom': '^18.3.0',
                    'rollup': '^4.0.0',
                    'rollup-plugin-federation': '^1.0.0',
                    'typescript': '^5.0.0',
                    'serve': '^14.0.0'
                },
                fyn: {
                    devDependencies: {
                        'rollup-plugin-federation': '../../../../../rollup-federation/rollup-plugin-federation'
                    }
                }
            };
            fs.writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify(packageJson, null, 2)
            );

            // Create TypeScript config
            const tsConfig = {
                compilerOptions: {
                    target: 'ES2020',
                    module: 'ESNext',
                    moduleResolution: 'bundler',
                    allowSyntheticDefaultImports: true,
                    esModuleInterop: true,
                    jsx: 'react',
                    declaration: true,
                    outDir: './dist',
                    strict: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true,
                    resolveJsonModule: true,
                    isolatedModules: true,
                    lib: ['DOM', 'DOM.Iterable', 'ESNext']
                },
                include: ['src/**/*'],
                exclude: ['node_modules', 'dist']
            };
            fs.writeFileSync(
                path.join(appDir, 'tsconfig.json'),
                JSON.stringify(tsConfig, null, 2)
            );

            // Create source files
            const mainTs = `// @ts-nocheck
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(React.createElement(App));
}

export { default as App } from './App';
export * from './components';
export * from './utils';
`;
            fs.writeFileSync(path.join(appDir, 'src', 'main.ts'), mainTs);

            const appTsx = `// @ts-nocheck

import React from 'react';
import { Button } from './components';
import { formatMessage } from './utils';

const App: React.FC = () => {
    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>{formatMessage('Welcome to Test FynApp!')}</h1>
            <p>This is a dynamically generated FynApp for testing.</p>
            <Button onClick={() => alert('Hello from FynApp!')}>
                Click Me
            </Button>
        </div>
    );
};

export default App;
`;
            fs.writeFileSync(path.join(appDir, 'src', 'App.tsx'), appTsx);

            const configTs = `export const appConfig = {
    name: 'test-fynapp',
    version: '1.0.0',
    theme: {
        primaryColor: '#007acc',
        secondaryColor: '#f0f0f0'
    },
    features: {
        darkMode: true,
        notifications: true
    }
};

export default appConfig;
`;
            fs.writeFileSync(path.join(appDir, 'src', 'config.ts'), configTs);

            // Create components
            const componentsIndex = `export { Button } from './Button';
export { Modal } from './Modal';
`;
            fs.writeFileSync(path.join(appDir, 'src', 'components', 'index.ts'), componentsIndex);

            const buttonTsx = `// @ts-nocheck

import React from 'react';

interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    variant = 'primary'
}) => {
    const styles = {
        primary: {
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer'
        },
        secondary: {
            backgroundColor: '#f0f0f0',
            color: '#333',
            border: '1px solid #ccc',
            padding: '10px 20px',
            borderRadius: '4px',
            cursor: 'pointer'
        }
    };

    return (
        <button style={styles[variant]} onClick={onClick}>
            {children}
        </button>
    );
};
`;
            fs.writeFileSync(path.join(appDir, 'src', 'components', 'Button.tsx'), buttonTsx);

            const modalTsx = `// @ts-nocheck

import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
    overlayOpacity?: number;
    overlayBlur?: string;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    children,
    overlayOpacity = 0.3,
    overlayBlur = '6px'
}) => {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: \`rgba(0, 0, 0, \${overlayOpacity})\`,
                backdropFilter: \`blur(\${overlayBlur})\`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    maxWidth: '500px',
                    maxHeight: '80vh',
                    overflow: 'auto'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
};
`;
            fs.writeFileSync(path.join(appDir, 'src', 'components', 'Modal.tsx'), modalTsx);

            // Create utils
            const utilsIndex = `export { formatMessage } from './formatMessage';
export { apiClient } from './apiClient';
`;
            fs.writeFileSync(path.join(appDir, 'src', 'utils', 'index.ts'), utilsIndex);

            const formatMessageTs = `export function formatMessage(message: string): string {
    return \`🚀 \${message}\`;
}

export function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
`;
            fs.writeFileSync(path.join(appDir, 'src', 'utils', 'formatMessage.ts'), formatMessageTs);

            const apiClientTs = `interface ApiResponse<T> {
    data: T;
    status: number;
    message: string;
}

export const apiClient = {
    async get<T>(url: string): Promise<ApiResponse<T>> {
        // Mock API client for demo
        return {
            data: {} as T,
            status: 200,
            message: 'Success'
        };
    },

    async post<T>(url: string, data: any): Promise<ApiResponse<T>> {
        // Mock API client for demo
        return {
            data: {} as T,
            status: 201,
            message: 'Created'
        };
    }
};
`;
            fs.writeFileSync(path.join(appDir, 'src', 'utils', 'apiClient.ts'), apiClientTs);

            // Create HTML file
            const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test FynApp</title>
</head>
<body>
    <div id="root"></div>
    <script type="systemjs-importmap">
    {
        "imports": {
            "test-fynapp": "./fynapp-entry.js"
        }
    }
    </script>
    <script src="https://cdn.jsdelivr.net/npm/systemjs@6.14.1/dist/system.min.js"></script>
    <script>
        System.import('test-fynapp').then(module => {
            console.log('FynApp loaded successfully!', module);
        });
    </script>
</body>
</html>`;
            fs.writeFileSync(path.join(appDir, 'index.html'), indexHtml);

            // Generate rollup config using our smart detection
            const configPath = path.join(appDir, 'rollup.config.mjs');
            RollupConfigManager.createFynAppConfig(configPath, {
                appName: 'test-fynapp',
                framework: 'react',
                projectDir: appDir
            });

            // Verify all files were created
            expect(fs.existsSync(path.join(appDir, 'package.json'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'tsconfig.json'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'rollup.config.mjs'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'index.html'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'main.ts'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'App.tsx'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'config.ts'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'components', 'index.ts'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'components', 'Button.tsx'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'components', 'Modal.tsx'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'utils', 'index.ts'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'utils', 'formatMessage.ts'))).toBe(true);
            expect(fs.existsSync(path.join(appDir, 'src', 'utils', 'apiClient.ts'))).toBe(true);
        });

        it('should generate correct rollup config with smart detection', () => {
            const configPath = path.join(appDir, 'rollup.config.mjs');
            const configContent = fs.readFileSync(configPath, 'utf8');

            // Verify smart detection worked correctly
            expect(configContent).toContain('name: "test-fynapp"');
            expect(configContent).toContain('shareScope: "fynmesh"');
            expect(configContent).toContain('"./main": "./src/main.ts"');
            expect(configContent).toContain('"./App": "./src/App.tsx"');
            expect(configContent).toContain('"./config": "./src/config.ts"');
            expect(configContent).toContain('"./components": "./src/components/index.ts"');
            expect(configContent).toContain('"./utils": "./src/utils/index.ts"');

            // Verify React version detection (should preserve semver)
            expect(configContent).toContain('"semver": "^18.3.0"');

            // Verify no static remotes (dynamic federation)
            expect(configContent).not.toContain('remotes:');
        });

        it('should create valid package.json with correct dependencies', () => {
            const packageJsonPath = path.join(appDir, 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

            expect(packageJson.name).toBe('test-fynapp');
            expect(packageJson.type).toBe('module');
            expect(packageJson.devDependencies['react']).toBe('^18.3.0');
            expect(packageJson.devDependencies['react-dom']).toBe('^18.3.0');
            expect(packageJson.devDependencies['create-fynapp']).toBe('^1.0.0');
            expect(packageJson.devDependencies['rollup-plugin-federation']).toBeDefined();
            expect(packageJson.scripts.build).toBe('rollup -c');
            expect(packageJson.scripts.dev).toBe('rollup -c -w');
        });

        it('should create working React components', () => {
            const buttonPath = path.join(appDir, 'src', 'components', 'Button.tsx');
            const buttonContent = fs.readFileSync(buttonPath, 'utf8');

            expect(buttonContent).toContain('interface ButtonProps');
            expect(buttonContent).toContain('export const Button');
            expect(buttonContent).toContain('variant?: \'primary\' | \'secondary\'');

            const modalPath = path.join(appDir, 'src', 'components', 'Modal.tsx');
            const modalContent = fs.readFileSync(modalPath, 'utf8');

            expect(modalContent).toContain('overlayOpacity?: number');
            expect(modalContent).toContain('overlayBlur?: string');
            expect(modalContent).toContain('backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`');
        });

        it('should create proper barrel exports', () => {
            const componentsIndex = fs.readFileSync(
                path.join(appDir, 'src', 'components', 'index.ts'),
                'utf8'
            );
            expect(componentsIndex).toContain('export { Button }');
            expect(componentsIndex).toContain('export { Modal }');

            const utilsIndex = fs.readFileSync(
                path.join(appDir, 'src', 'utils', 'index.ts'),
                'utf8'
            );
            expect(utilsIndex).toContain('export { formatMessage }');
            expect(utilsIndex).toContain('export { apiClient }');

            const mainTs = fs.readFileSync(path.join(appDir, 'src', 'main.ts'), 'utf8');
            expect(mainTs).toContain('export { default as App }');
            expect(mainTs).toContain('export * from \'./components\'');
            expect(mainTs).toContain('export * from \'./utils\'');
        });
    });
});
