import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "fynapp-shell-mw",
  framework: "react",
  typescript: true,
  debugging: true,
  external: [],
  exposes: {
    "./middleware/shell-layout": "./src/middleware/shell-layout.ts",
    "./main": "./src/main.tsx",
  },
  entry: {
    header: `
console.log('fynapp-shell-mw entry header');
`,
  },
});
