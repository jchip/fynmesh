import type { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";
import type { DesignTokensData, ThemeConfig } from "../types";
export declare class DesignTokens {
    private globalTheme;
    private perFynAppThemes;
    private globalOptIns;
    private customThemes;
    private themeChangeSubscribers;
    private styleElements;
    private fynAppConfigs;
    constructor();
    getTokens(fynAppName?: string): DesignTokensData;
    getTheme(fynAppName?: string): string;
    setTheme(themeName: string, fynAppName?: string, applyGlobally?: boolean): void;
    registerTheme(theme: ThemeConfig): void;
    setGlobalOptIn(fynAppName: string, optIn: boolean): void;
    getGlobalOptIn(fynAppName: string): boolean;
    getCSSVariable(tokenPath: string, prefix?: string): string;
    subscribeToThemeChanges(callback: (theme: string, tokens: DesignTokensData) => void): () => void;
    injectCustomCSS(css: string, id: string): void;
    injectCSSCustomProperties(fynAppName: string, prefix?: string, isGlobal?: boolean): void;
    private generateCSSCustomProperties;
    private updateAllCSSCustomProperties;
    private updateFynAppCSSCustomProperties;
    private loadPersistedTheme;
    private persistTheme;
    private persistGlobalOptIns;
    listThemes(): string[];
    getThemeConfig(themeName: string): ThemeConfig | undefined;
}
export declare class DesignTokensMiddleware implements FynAppMiddleware {
    readonly name = "design-tokens";
    private designTokens;
    private fynAppConfigs;
    constructor();
    setup(context: FynAppMiddlewareCallContext): Promise<{
        status: string;
    }>;
    apply(context: FynAppMiddlewareCallContext): Promise<void>;
    private validateConfig;
    private createDesignTokensAPI;
    private exposeGlobalAPI;
}
export declare const __middleware__DesignTokens: DesignTokensMiddleware;
export declare const main: import("@fynmesh/kernel").FynModule;
//# sourceMappingURL=design-tokens.d.ts.map