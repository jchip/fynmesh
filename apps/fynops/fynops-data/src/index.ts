// Re-export fynops-data-core for federation sharing. Consumers declare it
// `import: false` and depend on this FynApp, so this module is what ships it.
// The worker the client starts is built by the second config in rollup.config.ts
// and lands next to this chunk in dist/.
export * from "fynops-data-core";
