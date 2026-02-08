import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynapp-sidebar",
  framework: "react",
  typescript: true,
  debugging: true,
  exposes: { "./component": "./src/component.ts" },
});
