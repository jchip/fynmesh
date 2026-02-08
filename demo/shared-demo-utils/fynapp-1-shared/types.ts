/**
 * Configuration type for fynapp-1 variants.
 *
 * fynapp-1 and fynapp-1-b share ~95% of their code.
 * This config captures the differences.
 */
export interface FynApp1Config {
  /** Display name for the app (e.g. "FynApp 1", "FynApp 1B") */
  appName: string;
  /** DOM element ID for standalone rendering (e.g. "fynapp-1", "fynapp-1-b") */
  targetId: string;
  /** Initial theme for design tokens (e.g. "fynmesh-dark", "fynmesh-green") */
  theme: string;
  /** Middleware role: provider creates shared state, consumer uses it */
  middlewareRole: "provider" | "consumer";
  /** Spinner loading color (CSS border-top color) */
  spinnerColor: string;
  /** Whether the app can defer middleware initialization */
  deferOk?: boolean;
  /** Middleware config for basic-counter */
  counterConfig: object | string;
  /** Design tokens middleware config */
  designTokensConfig: {
    theme: string;
    cssCustomProperties: boolean;
    cssVariablePrefix: string;
    enableThemeSwitching: boolean;
    global: boolean;
  };
  /** Component export metadata */
  metadata: {
    name: string;
    version: string;
    description: string;
  };
}
