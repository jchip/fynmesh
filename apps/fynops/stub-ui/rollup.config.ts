import { createFynAppRollupConfig } from "create-fynapp";

// Consumes fynops-ui-kit with import:false: the code is never bundled here,
// only referenced. At runtime the kernel resolves it from the fynops-ui
// provider FynApp, which must be loaded first (see
// fynops.html?load=fynops-ui,stub-ui). The manifest's `shared-providers` is
// filled in automatically at build time: create-fynapp finds it by reading
// ../fynops-ui/dist/fynapp.manifest.json, since "fynops-ui" is a package.json
// dependency here (build fynops-ui before stub-ui).
export default createFynAppRollupConfig({
  name: "stub-ui",
  framework: "react",
  reactPackages: "esm-adapters",
  typescript: true,
  exposes: {},
  shared: {
    "fynops-ui-kit": {
      import: false,
      singleton: true,
      semver: "^1.0.0",
    },
  },
});
