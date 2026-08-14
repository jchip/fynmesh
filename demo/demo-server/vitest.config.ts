import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        // Node, not jsdom: what's under test here are the build scripts that
        // generate the demo site, not browser code.
        environment: "node",
        include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
        exclude: ["node_modules", "dist", "dist-dev", "public"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            exclude: ["tests/**", "dist/**", "dist-dev/**", "*.config.*"],
        },
    },
});
