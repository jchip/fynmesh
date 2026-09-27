import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynops-shell",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
});
