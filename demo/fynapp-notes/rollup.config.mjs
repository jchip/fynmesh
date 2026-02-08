import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynapp-notes",
  framework: "react",
  typescript: true,
  exposes: { "./main": "./src/main.ts" },
  extraPlugins: [newRollupPlugin(postcss)({ inject: true, extract: false })],
});
