import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynapp-design-tokens",
  framework: "react",
  typescript: true,
  external: [],
  exposes: {
    "./middleware/design-tokens": "./src/middleware/design-tokens.ts",
  },
  entry: {
    header: `
console.log('fynapp-design-tokens entry header');
export {config} from "./src/config.ts";
`,
  },
});
