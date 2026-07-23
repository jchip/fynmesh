import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "example-vanilla",
  framework: "vanilla",
  typescript: true,
  // Non-React frameworks must list "./main" explicitly - only the "react"
  // framework auto-exposes it.
  exposes: {
    "./main": "./src/main.ts",
  },
});
