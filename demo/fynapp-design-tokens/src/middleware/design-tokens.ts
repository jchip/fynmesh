import type { FynApp, FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";
import { useMiddleware, noOpMiddlewareUser } from "@fynmesh/kernel";
import type {
    DesignTokensData,
    ThemeConfig,
    DesignTokensMiddlewareConfig,
    DesignTokensAPI
} from "./types";

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
                light: '#1e293b',
                dark: '#f1f5f9',
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
    private currentTheme: string = 'fynmesh-default';
    private customThemes = new Map<string, ThemeConfig>();
    private themeChangeSubscribers = new Set<(theme: string, tokens: DesignTokensData) => void>();
    private styleElements = new Map<string, HTMLStyleElement>();

    constructor() {
        // Initialize with predefined themes
        Object.entries(predefinedThemes).forEach(([key, theme]) => {
            this.customThemes.set(key, theme);
        });

        // Load persisted theme
        this.loadPersistedTheme();
    }

    public getTokens(): DesignTokensData {
        const theme = this.customThemes.get(this.currentTheme);
        return theme?.tokens || defaultTokens;
    }

    public getTheme(): string {
        return this.currentTheme;
    }

    public setTheme(themeName: string): void {
        if (!this.customThemes.has(themeName)) {
            console.warn(`🚨 Theme "${themeName}" not found. Available themes:`, Array.from(this.customThemes.keys()));
            return;
        }

        this.currentTheme = themeName;

        // Update CSS custom properties for all registered style elements
        this.updateAllCSSCustomProperties();

        // Notify subscribers
        const tokens = this.getTokens();
        this.themeChangeSubscribers.forEach(callback => {
            try {
                callback(themeName, tokens);
            } catch (error) {
                console.error('Error in theme change callback:', error);
            }
        });

        // Persist theme
        this.persistTheme();

        console.debug(`🎨 Theme changed to: ${themeName}`);
    }

    public registerTheme(theme: ThemeConfig): void {
        this.customThemes.set(theme.name, theme);
        console.debug(`🎨 Registered theme: ${theme.name}`);
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

    public injectCSSCustomProperties(fynAppName: string, prefix: string = 'fynmesh'): void {
        const tokens = this.getTokens();
        const css = this.generateCSSCustomProperties(tokens, prefix);

        const styleId = `fynmesh-design-tokens-${fynAppName}`;
        let styleElement = document.getElementById(styleId) as HTMLStyleElement;

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
            this.styleElements.set(styleId, styleElement);
        }

        styleElement.textContent = css;
    }

    private generateCSSCustomProperties(tokens: DesignTokensData, prefix: string): string {
        const lines: string[] = [':root {'];

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
            const prefix = 'fynmesh'; // Default prefix
            const tokens = this.getTokens();
            const css = this.generateCSSCustomProperties(tokens, prefix);
            styleElement.textContent = css;
        });
    }

    private loadPersistedTheme(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const saved = localStorage.getItem('fynmesh-theme');
                if (saved && this.customThemes.has(saved)) {
                    this.currentTheme = saved;
                }
            }
        } catch (error) {
            console.warn('Failed to load persisted theme:', error);
        }
    }

    private persistTheme(): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('fynmesh-theme', this.currentTheme);
            }
        } catch (error) {
            console.warn('Failed to persist theme:', error);
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
            this.designTokens.injectCSSCustomProperties(fynApp.name, config.cssVariablePrefix || 'fynmesh');
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
        };
    }

    private createDesignTokensAPI(fynApp: FynApp, config: DesignTokensMiddlewareConfig): DesignTokensAPI {
        return {
            getTokens: () => this.designTokens.getTokens(),
            getTheme: () => this.designTokens.getTheme(),
            setTheme: (theme: string) => this.designTokens.setTheme(theme),
            getCSSVariable: (tokenPath: string) => {
                const prefix = config.cssVariablePrefix || 'fynmesh';
                return this.designTokens.getCSSVariable(tokenPath, prefix);
            },
            subscribeToThemeChanges: (callback) => {
                return this.designTokens.subscribeToThemeChanges(callback);
            },
            injectCustomCSS: (css: string) => {
                const styleId = `fynmesh-custom-css-${fynApp.name}`;
                this.designTokens.injectCustomCSS(css, styleId);
            },
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
