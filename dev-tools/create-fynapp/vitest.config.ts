import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        // Node, not jsdom: these specs cover a CLI and its rollup config
        // factory, none of which touch the DOM.
        environment: "node",
        include: ["test/spec/**/*.test.ts"],
        // test/demo is a fixture FynApp the specs build against, not a suite.
        exclude: ["node_modules", "dist", "test/demo", "examples"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["test/**", "dist/**", "*.config.*"],
        },
    },
});
