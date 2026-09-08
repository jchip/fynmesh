import { startDevProxy } from "./proxy.js";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLoaderVariant, type LoaderVariant } from "./loader-variant.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

// FEDERATION picks which system.js + federation-js pair is served, defaulting
// to the fork; both halves always come from that one variant -- see
// ./loader-variant.ts for why they cannot be split.
let loader: LoaderVariant;
try {
  loader = resolveLoaderVariant();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const systemJs = Path.join(loader.systemDir, "system.js");
const inspectorDist = Path.join(
  __dirname,
  "../../../dev-tools/federation-inspector/dist"
);

// Start the dev proxy
startDevProxy([
  [{ path: "/" }, { protocol: "file", path: Path.join(__dirname, "../public") }],
  [{ path: "/fynmesh" }, { protocol: "file", path: Path.join(__dirname, "../../../docs") }],
  // the selected variant, never a copy under public/ -- both halves are mounted
  // from `loader`, so they cannot be switched independently.
  [{ path: "/system.js" }, { protocol: "file", path: systemJs }],
  [
    { path: "/system.min.js" },
    { protocol: "file", path: Path.join(loader.systemDir, "system.min.js") },
  ],
  [
    { path: "/system.min.js.map" },
    { protocol: "file", path: Path.join(loader.systemDir, "system.min.js.map") },
  ],
  // whole dist dir: the page picks .dev.js or .min.js by URL
  [{ path: "/federation-js/dist" }, { protocol: "file", path: loader.federationDist }],
  // the inspector, mounted from its own dist for the same reason as the loader
  // above: one build, no copy under public/ to go stale. It is optional -- a
  // tree where it has not been built just 404s a low-priority script.
  [
    { path: "/federation-inspector.js" },
    { protocol: "file", path: Path.join(inspectorDist, "federation-inspector.js") },
  ],
  [
    { path: "/federation-inspector.js.map" },
    { protocol: "file", path: Path.join(inspectorDist, "federation-inspector.js.map") },
  ],
  // The minified build is served too, because which one the page asks for is
  // not the dev server's choice: `build-prod` re-renders the demo templates
  // with isProduction true, and those pages point at .min.js. A tree left in
  // that state -- `publish-demo` leaves every tree in it -- then 404'd the
  // inspector under `fyn start` until someone re-ran `bootstrap`.
  // No .min.js.map: terser is configured without sourceMap, so none is emitted.
  [
    { path: "/federation-inspector.min.js" },
    { protocol: "file", path: Path.join(inspectorDist, "federation-inspector.min.js") },
  ],
  [
    { path: "/spectre.css" },
    { protocol: "file", path: Path.join(__dirname, "../node_modules/spectre.css") },
  ],
  [
    { path: "/kernel" },
    { protocol: "file", path: Path.join(__dirname, "../../../core/kernel") },
  ],
  [{ path: "/fynapp-1" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-1") }],
  [{ path: "/fynapp-1-b" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-1-b") }],
  [
    { path: "/fynapp-react-19" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-19") },
  ],
  [
    { path: "/fynapp-2-react18" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-2-react18") },
  ],
  [
    { path: "/fynapp-react-18" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-18") },
  ],
  [
    { path: "/fynapp-3-marko" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-3-marko") },
  ],
  [
    { path: "/fynapp-4-vue" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-4-vue") },
  ],
  [
    { path: "/fynapp-5-preact" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-5-preact") },
  ],
  [
    { path: "/fynapp-6-react" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-6-react") },
  ],
  [
    { path: "/fynapp-7-solid" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-7-solid") },
  ],
  [
    { path: "/fynapp-8-svelte" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-8-svelte") },
  ],
  [
    { path: "/fynapp-x1-v1" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-x1-v1") },
  ],
  [
    { path: "/fynapp-x1-v2" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-x1-v2") },
  ],
  [
    { path: "/fynapp-react-middleware" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-middleware") },
  ],
  [
    { path: "/fynapp-design-tokens" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-design-tokens") },
  ],
  [
    { path: "/fynapp-shell-mw" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-shell-mw") },
  ],
  [
    { path: "/fynapp-test-shared" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-test-shared") },
  ],
  [
    { path: "/fynapp-sidebar" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-sidebar") },
  ],
  [
    { path: "/fynapp-ag-grid" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-ag-grid") },
  ],
  [
    { path: "/fynapp-ag-grid-lib" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-ag-grid-lib") },
  ],
  [
    { path: "/fynapp-notes" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-notes") },
  ],
  [
    { path: "/fynapp-bundled" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-bundled") },
  ],
  [
    { path: "/fynapp-mw-mismatch" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-mw-mismatch") },
  ],
]);
