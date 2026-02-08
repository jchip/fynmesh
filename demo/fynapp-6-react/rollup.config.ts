import postcss from "rollup-plugin-postcss";
import { newRollupPlugin } from "rollup-wrap-plugin";
import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynapp-6-react",
  framework: "react",
  typescript: true,
  exposes: {},
  extraPlugins: [newRollupPlugin(postcss)()],
});
