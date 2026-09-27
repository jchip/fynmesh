import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "stub-view",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
});
