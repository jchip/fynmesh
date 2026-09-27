// Re-export fynops-ui-kit for federation sharing. Consumers declare
// `fynops-ui-kit` as `import: false` and list this FynApp in their
// sharedProviders, so this module is what actually ships the kit's code.
// fynops-ui-kit's own index.ts injects its CSS as a side effect, so because
// fynops-ui-kit is a federation singleton, the CSS is injected exactly once
// for the whole page, the first time any consumer loads it through here.
export * from "fynops-ui-kit";

console.log("fynops-ui loaded - fynops-ui-kit shared library provider");
