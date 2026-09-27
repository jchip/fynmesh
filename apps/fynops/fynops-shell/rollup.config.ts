import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynops-shell",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {
    // The kernel scans ./middleware* exposes and registers the auto-applied fynops-shell middleware.
    "./middleware/fynops-shell": "./src/middleware/fynops-shell.ts",
  },
});
