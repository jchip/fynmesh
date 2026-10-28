import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test builds its own JSDOM window so RequireJS loads real <script> files.
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
