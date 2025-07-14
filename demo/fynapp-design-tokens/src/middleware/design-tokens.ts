import type { FynApp, FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";
import { useMiddleware, noOpMiddlewareUser } from "@fynmesh/kernel";
import type {
    DesignTokensData,
    ThemeConfig,
    DesignTokensMiddlewareConfig,
    DesignTokensAPI
} from "../types";

// =============================================================================
// Default Themes
// =============================================================================

const defaultTokens: DesignTokensData = {
    colors: {
        primary: '#2563eb',
        secondary: '#64748b',
        success: '#059669',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#0284c7',
        light: '#f8fafc',
        dark: '#0f172a',
        // FynApp specific colors
        fynapp1: '#6366f1',
        fynapp1b: '#10b981',
        fynapp2: '#8b5cf6',
        fynapp3: '#ff5733',
        fynapp4: '#42b883',
        fynapp5: '#673ab8',
        fynapp6: '#4f46e5',
        fynapp7: '#2D7FF9',
    },
    spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '2.5rem',
        '3xl': '3rem',
    },
    typography: {
        sizes: {
            xs: '0.75rem',
            sm: '0.875rem',
            base: '1rem',
            lg: '1.125rem',
            xl: '1.25rem',
            '2xl': '1.5rem',
            '3xl': '1.875rem',
            '4xl': '2.25rem',
            '5xl': '3rem',
            '6xl': '3.75rem',
        },
        weights: {
            thin: 100,
            light: 300,
            normal: 400,
            medium: 500,
            semibold: 600,
            bold: 700,
            extrabold: 800,
            black: 900,
        },
        families: {
            sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
            serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
            mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        },
    },
    shadows: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
        none: '0 0 #0000',
    },
    borders: {
        radius: {
            none: '0px',
            sm: '0.125rem',
            md: '0.375rem',
            lg: '0.5rem',
            xl: '0.75rem',
            '2xl': '1rem',
            '3xl': '1.5rem',
            full: '9999px',
        },
        width: {
            0: '0px',
            1: '1px',
            2: '2px',
            4: '4px',
            8: '8px',
        },
    },
    breakpoints: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
    },
};

const predefinedThemes: Record<string, ThemeConfig> = {
    'fynmesh-default': {
        name: 'FynMesh Default',
        tokens: defaultTokens,
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-dark': {
        name: 'FynMesh Dark',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#3b82f6',
                secondary: '#6b7280',
                success: '#10b981',
                warning: '#f59e0b',
                danger: '#ef4444',
                info: '#06b6d4',
                light: '#1e293b',
                dark: '#f1f5f9',
                fynapp1: '#7c3aed',
                fynapp1b: '#059669',
                fynapp2: '#a855f7',
                fynapp3: '#e11d48',
                fynapp4: '#059669',
                fynapp5: '#8b5cf6',
                fynapp6: '#6366f1',
                fynapp7: '#0ea5e9',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-blue': {
        name: 'FynMesh Blue',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#1e40af',
                secondary: '#3b82f6',
                success: '#059669',
                warning: '#d97706',
                danger: '#dc2626',
                info: '#0284c7',
                light: '#eff6ff',
                dark: '#1e3a8a',
                fynapp1: '#1e40af',
                fynapp1b: '#3b82f6',
                fynapp2: '#6366f1',
                fynapp3: '#0ea5e9',
                fynapp4: '#06b6d4',
                fynapp5: '#8b5cf6',
                fynapp6: '#1e40af',
                fynapp7: '#0284c7',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-green': {
        name: 'FynMesh Green',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#059669',
                secondary: '#10b981',
                success: '#22c55e',
                warning: '#eab308',
                danger: '#ef4444',
                info: '#06b6d4',
                light: '#f0fdf4',
                dark: '#064e3b',
                fynapp1: '#059669',
                fynapp1b: '#10b981',
                fynapp2: '#22c55e',
                fynapp3: '#84cc16',
                fynapp4: '#65a30d',
                fynapp5: '#16a34a',
                fynapp6: '#059669',
                fynapp7: '#0d9488',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-purple': {
        name: 'FynMesh Purple',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#7c3aed',
                secondary: '#8b5cf6',
                success: '#10b981',
                warning: '#f59e0b',
                danger: '#ef4444',
                info: '#06b6d4',
                light: '#faf5ff',
                dark: '#581c87',
                fynapp1: '#7c3aed',
                fynapp1b: '#8b5cf6',
                fynapp2: '#a855f7',
                fynapp3: '#c084fc',
                fynapp4: '#d8b4fe',
                fynapp5: '#9333ea',
                fynapp6: '#7c3aed',
                fynapp7: '#6d28d9',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-sunset': {
        name: 'FynMesh Sunset',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#ea580c',
                secondary: '#f97316',
                success: '#10b981',
                warning: '#eab308',
                danger: '#ef4444',
                info: '#06b6d4',
                light: '#fff7ed',
                dark: '#7c2d12',
                fynapp1: '#ea580c',
                fynapp1b: '#f97316',
                fynapp2: '#fb923c',
                fynapp3: '#fed7aa',
                fynapp4: '#fdba74',
                fynapp5: '#dc2626',
                fynapp6: '#ea580c',
                fynapp7: '#c2410c',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
    'fynmesh-cyberpunk': {
        name: 'FynMesh Cyberpunk',
        tokens: {
            ...defaultTokens,
            colors: {
                ...defaultTokens.colors,
                primary: '#00ff88',
                secondary: '#ff0080',
                success: '#00ff88',
                warning: '#ffff00',
                danger: '#ff0040',
                info: '#00ddff',
                light: '#0a0a0a',
                dark: '#00ff88',
                fynapp1: '#00ff88',
                fynapp1b: '#ff0080',
                fynapp2: '#8000ff',
                fynapp3: '#ff0040',
                fynapp4: '#00ddff',
                fynapp5: '#ff8000',
                fynapp6: '#00ff88',
                fynapp7: '#4080ff',
            },
        },
        cssCustomProperties: true,
        cssVariablePrefix: 'fynmesh',
    },
};

// =============================================================================
// Design Tokens Core Class
// =============================================================================

export class DesignTokens {
    private globalTheme: string = 'fynmesh-default';
    private perFynAppThemes = new Map<string, string>(); // fynAppName -> theme
    private globalOptIns = new Map<string, boolean>(); // fynAppName -> whether it opts into global changes
    private customThemes = new Map<string, ThemeConfig>();
    private themeChangeSubscribers = new Set<(theme: string, tokens: DesignTokensData, fynAppName?: string) => void>();
    private styleElements = new Map<string, HTMLStyleElement>();
    private fynAppConfigs = new Map<string, { prefix: string; isGlobal: boolean }>();

    constructor() {
        // Initialize with predefined themes
        Object.entries(predefinedThemes).forEach(([key, theme]) => {
            this.customThemes.set(key, theme);
        });

        // Load persisted theme
        this.loadPersistedTheme();
    }

    public getTokens(fynAppName?: string): DesignTokensData {
        const themeToUse = fynAppName && this.perFynAppThemes.has(fynAppName)
            ? this.perFynAppThemes.get(fynAppName)!
            : this.globalTheme;
        const theme = this.customThemes.get(themeToUse);
        return theme?.tokens || defaultTokens;
    }

    public getTheme(fynAppName?: string): string {
        if (fynAppName) {
            // If app has a specific theme, use that
            if (this.perFynAppThemes.has(fynAppName)) {
                return this.perFynAppThemes.get(fynAppName)!;
            }
            // If app has opted into global and no specific theme, use global
            if (this.globalOptIns.get(fynAppName)) {
                return this.globalTheme;
            }
            // Otherwise, use the app's initial theme or default
            return this.globalTheme; // fallback to global theme
        }
        return this.globalTheme;
    }

    public setTheme(themeName: string, fynAppName?: string, applyGlobally: boolean = true): void {
        if (!this.customThemes.has(themeName)) {
            console.warn(`🚨 Theme "${themeName}" not found. Available themes:`, Array.from(this.customThemes.keys()));
            return;
        }

        if (applyGlobally || !fynAppName) {
            // Apply globally, but only to apps that have opted in
            this.globalTheme = themeName;

            // Clear per-app themes only for apps that have opted into global changes
            const appsToUpdate: string[] = [];
            this.globalOptIns.forEach((optedIn, appName) => {
                if (optedIn) {
                    this.perFynAppThemes.delete(appName); // Remove specific theme, will use global
                    appsToUpdate.push(appName);
                }
            });

            // Update CSS for opted-in apps
            appsToUpdate.forEach(appName => this.updateFynAppCSSCustomProperties(appName));

            // Notify subscribers for opted-in apps
            appsToUpdate.forEach(appName => {
                const tokens = this.getTokens(appName);
                this.themeChangeSubscribers.forEach(callback => {
                    try {
                        callback(themeName, tokens);
                    } catch (error) {
                        console.error('Error in theme change callback:', error);
                    }
                });
            });
        } else {
            // Apply to specific fynapp only
            this.perFynAppThemes.set(fynAppName, themeName);
            this.updateFynAppCSSCustomProperties(fynAppName);

            // Notify subscribers for this specific fynapp
            const tokens = this.getTokens(fynAppName);
            this.themeChangeSubscribers.forEach(callback => {
                try {
                    callback(themeName, tokens, fynAppName);
                } catch (error) {
                    console.error('Error in theme change callback:', error);
                }
            });
        }

        // Persist theme
        this.persistTheme();

        console.debug(`🎨 Theme changed to: ${themeName}${fynAppName && !applyGlobally ? ` for ${fynAppName}` : ' globally'}`);
    }

    public registerTheme(theme: ThemeConfig): void {
        this.customThemes.set(theme.name, theme);
        console.debug(`🎨 Registered theme: ${theme.name}`);
    }

    public setGlobalOptIn(fynAppName: string, optIn: boolean): void {
        this.globalOptIns.set(fynAppName, optIn);
        this.persistGlobalOptIns();
        console.debug(`🎨 ${fynAppName} ${optIn ? 'opted into' : 'opted out of'} global theme changes`);
    }

    public getGlobalOptIn(fynAppName: string): boolean {
        return this.globalOptIns.get(fynAppName) || false;
    }

    public getCSSVariable(tokenPath: string, prefix: string = 'fynmesh'): string {
        return `var(--${prefix}-${tokenPath})`;
    }

    public subscribeToThemeChanges(callback: (theme: string, tokens: DesignTokensData) => void): () => void {
        this.themeChangeSubscribers.add(callback);
        return () => this.themeChangeSubscribers.delete(callback);
    }

    public injectCustomCSS(css: string, id: string): void {
        let styleElement = document.getElementById(id) as HTMLStyleElement;

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = id;
            document.head.appendChild(styleElement);
        }

        styleElement.textContent = css;
    }

    public injectCSSCustomProperties(fynAppName: string, prefix: string = 'fynmesh', isGlobal: boolean = false): void {
        const tokens = this.getTokens();
        const scope = isGlobal ? ':root' : `#${fynAppName}`;
        const css = this.generateCSSCustomProperties(tokens, prefix, scope);

        const styleId = `fynmesh-design-tokens-${fynAppName}`;
        let styleElement = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
            this.styleElements.set(styleId, styleElement);
        }

        styleElement.textContent = css;

        // Store the configuration for this fynapp
        this.fynAppConfigs.set(fynAppName, { prefix, isGlobal });
    }

    private generateCSSCustomProperties(tokens: DesignTokensData, prefix: string, scope: string = ':root'): string {
        const lines: string[] = [`${scope} {`];

        // Colors
        Object.entries(tokens.colors).forEach(([key, value]) => {
            lines.push(`  --${prefix}-color-${key}: ${value};`);
        });

        // Spacing
        Object.entries(tokens.spacing).forEach(([key, value]) => {
            lines.push(`  --${prefix}-spacing-${key}: ${value};`);
        });

        // Typography
        Object.entries(tokens.typography.sizes).forEach(([key, value]) => {
            lines.push(`  --${prefix}-text-${key}: ${value};`);
        });

        Object.entries(tokens.typography.weights).forEach(([key, value]) => {
            lines.push(`  --${prefix}-font-weight-${key}: ${value};`);
        });

        Object.entries(tokens.typography.families).forEach(([key, value]) => {
            lines.push(`  --${prefix}-font-family-${key}: ${value};`);
        });

        // Shadows
        Object.entries(tokens.shadows).forEach(([key, value]) => {
            lines.push(`  --${prefix}-shadow-${key}: ${value};`);
        });

        // Borders
        Object.entries(tokens.borders.radius).forEach(([key, value]) => {
            lines.push(`  --${prefix}-radius-${key}: ${value};`);
        });

        Object.entries(tokens.borders.width).forEach(([key, value]) => {
            lines.push(`  --${prefix}-border-${key}: ${value};`);
        });

        // Breakpoints
        Object.entries(tokens.breakpoints).forEach(([key, value]) => {
            lines.push(`  --${prefix}-breakpoint-${key}: ${value};`);
        });

        lines.push('}');

        return lines.join('\n');
    }

    private updateAllCSSCustomProperties(): void {
        this.styleElements.forEach((styleElement, styleId) => {
            const fynAppName = styleId.replace('fynmesh-design-tokens-', '');
            const config = this.fynAppConfigs.get(fynAppName);

            if (config) {
                const tokens = this.getTokens(fynAppName);
                const scope = config.isGlobal ? ':root' : `#${fynAppName}`;
                const css = this.generateCSSCustomProperties(tokens, config.prefix, scope);
                styleElement.textContent = css;
            }
        });
    }

    private updateFynAppCSSCustomProperties(fynAppName: string): void {
        const styleId = `fynmesh-design-tokens-${fynAppName}`;
        const styleElement = this.styleElements.get(styleId);
        const config = this.fynAppConfigs.get(fynAppName);

        if (styleElement && config) {
            const tokens = this.getTokens(fynAppName);
            const scope = config.isGlobal ? ':root' : `#${fynAppName}`;
            const css = this.generateCSSCustomProperties(tokens, config.prefix, scope);
            styleElement.textContent = css;
        }
    }

    private loadPersistedTheme(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const saved = localStorage.getItem('fynmesh-theme');
                if (saved && this.customThemes.has(saved)) {
                    this.globalTheme = saved;
                }

                // Load per-fynapp themes
                const perAppThemes = localStorage.getItem('fynmesh-per-app-themes');
                if (perAppThemes) {
                    const parsed = JSON.parse(perAppThemes);
                    Object.entries(parsed).forEach(([fynAppName, theme]) => {
                        if (typeof theme === 'string' && this.customThemes.has(theme)) {
                            this.perFynAppThemes.set(fynAppName, theme);
                        }
                    });
                }

                // Load global opt-ins
                const globalOptIns = localStorage.getItem('fynmesh-global-opt-ins');
                if (globalOptIns) {
                    const parsed = JSON.parse(globalOptIns);
                    Object.entries(parsed).forEach(([fynAppName, optIn]) => {
                        if (typeof optIn === 'boolean') {
                            this.globalOptIns.set(fynAppName, optIn);
                        }
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load persisted theme:', error);
        }
    }

    private persistTheme(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('fynmesh-theme', this.globalTheme);

                // Persist per-fynapp themes
                const perAppThemes = Object.fromEntries(this.perFynAppThemes.entries());
                localStorage.setItem('fynmesh-per-app-themes', JSON.stringify(perAppThemes));
            }
        } catch (error) {
            console.warn('Failed to persist theme:', error);
        }
    }

    private persistGlobalOptIns(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const globalOptIns = Object.fromEntries(this.globalOptIns.entries());
                localStorage.setItem('fynmesh-global-opt-ins', JSON.stringify(globalOptIns));
            }
        } catch (error) {
            console.warn('Failed to persist global opt-ins:', error);
        }
    }

    // Public API for debugging
    public listThemes(): string[] {
        return Array.from(this.customThemes.keys());
    }

    public getThemeConfig(themeName: string): ThemeConfig | undefined {
        return this.customThemes.get(themeName);
    }
}

// =============================================================================
// Design Tokens Middleware Implementation
// =============================================================================

export class DesignTokensMiddleware implements FynAppMiddleware {
    public readonly name = "design-tokens";

    private designTokens: DesignTokens;
    private fynAppConfigs = new WeakMap<FynApp, DesignTokensMiddlewareConfig>();

    constructor() {
        this.designTokens = new DesignTokens();
    }

    async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
        const { fynApp, meta } = context;
        const config = this.validateConfig(meta.config);

        this.fynAppConfigs.set(fynApp, config);

        console.debug(`🎨 Design Tokens Middleware setup for ${fynApp.name}`);
        return { status: "ready" };
    }

    async apply(context: FynAppMiddlewareCallContext): Promise<void> {
        const { fynApp, runtime } = context;
        const config = this.fynAppConfigs.get(fynApp)!;

        // Set up theme if specified
        if (config.theme) {
            if (typeof config.theme === 'string') {
                this.designTokens.setTheme(config.theme);
            } else {
                this.designTokens.registerTheme(config.theme);
                this.designTokens.setTheme(config.theme.name);
            }
        }

        // Inject CSS custom properties if enabled
        if (config.cssCustomProperties !== false) {
            this.designTokens.injectCSSCustomProperties(
                fynApp.name,
                config.cssVariablePrefix || 'fynmesh',
                config.global || false
            );
        }

        // Create API for this FynApp
        const api = this.createDesignTokensAPI(fynApp, config);

        // Store design tokens instance and API in middleware context
        runtime.middlewareContext.set(this.name, {
            designTokens: this.designTokens,
            api,
            tokens: this.designTokens.getTokens(),
            theme: this.designTokens.getTheme(),
        });

        // Expose global API
        this.exposeGlobalAPI(fynApp, api);

        console.debug(`✅ Design Tokens Middleware applied to ${fynApp.name}`);
    }

    private validateConfig(config: any): DesignTokensMiddlewareConfig {
        return {
            theme: config?.theme || 'fynmesh-default',
            customTokens: config?.customTokens || {},
            cssCustomProperties: config?.cssCustomProperties !== false,
            cssVariablePrefix: config?.cssVariablePrefix || 'fynmesh',
            enableThemeSwitching: config?.enableThemeSwitching !== false,
            persistTheme: config?.persistTheme !== false,
            storageKey: config?.storageKey || 'fynmesh-theme',
            global: config?.global || false,
        };
    }

    private createDesignTokensAPI(fynApp: FynApp, config: DesignTokensMiddlewareConfig): DesignTokensAPI {
        return {
            getTokens: () => this.designTokens.getTokens(fynApp.name),
            getTheme: () => this.designTokens.getTheme(fynApp.name),
            setTheme: (theme: string, applyGlobally: boolean = true) => this.designTokens.setTheme(theme, fynApp.name, applyGlobally),
            getCSSVariable: (tokenPath: string) => {
                const prefix = config.cssVariablePrefix || 'fynmesh';
                return this.designTokens.getCSSVariable(tokenPath, prefix);
            },
            subscribeToThemeChanges: (callback: (theme: string, tokens: DesignTokensData, fynAppName?: string) => void) => {
                return this.designTokens.subscribeToThemeChanges(callback);
            },
            injectCustomCSS: (css: string) => {
                const styleId = `fynmesh-custom-css-${fynApp.name}`;
                this.designTokens.injectCustomCSS(css, styleId);
            },
            setGlobalOptIn: (optIn: boolean) => this.designTokens.setGlobalOptIn(fynApp.name, optIn),
            getGlobalOptIn: () => this.designTokens.getGlobalOptIn(fynApp.name),
        };
    }

    private exposeGlobalAPI(fynApp: FynApp, api: DesignTokensAPI): void {
        // Expose API globally for easy access
        if (typeof window !== 'undefined') {
            (window as any).fynMeshDesignTokens = api;
        }

        // Also expose on the FynApp object
        (fynApp as any).designTokens = api;
    }
}

// Export the middleware instance
export const __middleware__DesignTokens = new DesignTokensMiddleware();

// Simple main that just loads the middleware
export const main = useMiddleware(
    {
        info: {
            name: "design-tokens",
            provider: "fynapp-design-tokens",
            version: "^1.0.0",
        },
        config: {
            theme: "fynmesh-default",
            cssCustomProperties: true,
            cssVariablePrefix: "fynmesh",
        },
    },
    noOpMiddlewareUser,
);
