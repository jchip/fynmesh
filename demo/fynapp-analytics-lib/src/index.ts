// Re-export analytics-core for federation sharing.
// Consumers declare `analytics-core` as `import: false` and list this FynApp
// in their sharedProviders, so this module is what actually ships the code.
export * from "analytics-core";

console.log("fynapp-analytics-lib loaded - analytics-core shared library provider");
