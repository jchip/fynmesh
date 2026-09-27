import { injectStyles } from "./styles";

export * from "./Button";
export * from "./Panel";
export * from "./Toolbar";
export * from "./StatTile";
export * from "./Badge";
export * from "./Table";
export { injectStyles } from "./styles";

export type Theme = "light" | "dark";

// Runs once: this module is a federation singleton, so it only ever
// evaluates once for the whole page, however many FynApps import it.
injectStyles();
