// =============================================================================
// Design Tokens Type Definitions
// =============================================================================

export interface ColorTokens {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    light: string;
    dark: string;
    [key: string]: string;
}

export interface SpacingTokens {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    [key: string]: string;
}

export interface TypographyTokens {
    sizes: {
        xs: string;
        sm: string;
        base: string;
        lg: string;
        xl: string;
        '2xl': string;
        '3xl': string;
        '4xl': string;
        '5xl': string;
        '6xl': string;
        [key: string]: string;
    };
    weights: {
        thin: number;
        light: number;
        normal: number;
        medium: number;
        semibold: number;
        bold: number;
        extrabold: number;
        black: number;
        [key: string]: number;
    };
    families: {
        sans: string;
        serif: string;
        mono: string;
        [key: string]: string;
    };
}

export interface ShadowTokens {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    inner: string;
    none: string;
    [key: string]: string;
}

export interface BorderTokens {
    radius: {
        none: string;
        sm: string;
        md: string;
        lg: string;
        xl: string;
        '2xl': string;
        '3xl': string;
        full: string;
        [key: string]: string;
    };
    width: {
        0: string;
        1: string;
        2: string;
        4: string;
        8: string;
        [key: string]: string;
    };
}

export interface DesignTokensData {
    colors: ColorTokens;
    spacing: SpacingTokens;
    typography: TypographyTokens;
    shadows: ShadowTokens;
    borders: BorderTokens;
    breakpoints: {
        sm: string;
        md: string;
        lg: string;
        xl: string;
        '2xl': string;
        [key: string]: string;
    };
    [key: string]: any;
}

export interface ThemeConfig {
    name: string;
    tokens: DesignTokensData;
    cssCustomProperties?: boolean;
    cssVariablePrefix?: string;
}

export interface DesignTokensMiddlewareConfig {
    theme?: string | ThemeConfig;
    customTokens?: Partial<DesignTokensData>;
    cssCustomProperties?: boolean;
    cssVariablePrefix?: string;
    enableThemeSwitching?: boolean;
    persistTheme?: boolean;
    storageKey?: string;
    global?: boolean; // If true, applies theme globally (:root), if false, scopes to fynapp container
}

export interface DesignTokensAPI {
    getTokens: () => DesignTokensData;
    getTheme: () => string;
    setTheme: (theme: string, applyGlobally?: boolean) => void;
    getCSSVariable: (tokenPath: string) => string;
    subscribeToThemeChanges: (callback: (theme: string, tokens: DesignTokensData, fynAppName?: string) => void) => () => void;
    injectCustomCSS: (css: string) => void;
    setGlobalOptIn: (optIn: boolean) => void;
    getGlobalOptIn: () => boolean;
}
