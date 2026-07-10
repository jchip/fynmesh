import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "example-middleware-provider",
  framework: "vanilla",
  typescript: true,
  // Non-React frameworks must list "./main" explicitly - only the "react"
  // framework auto-exposes it. `./main` is required even for a middleware-only
  // FynApp (see src/main.ts).
  exposes: {
    "./main": "./src/main.ts",
    "./middleware/greeting": "./src/middleware/greeting.ts",
  },
});
