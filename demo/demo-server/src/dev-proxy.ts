import { startDevProxy } from "./proxy.js";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

// Determine which federation-js file to serve based on NODE_ENV
const isProduction = process.env.NODE_ENV === "production";
const federationJsPath = isProduction
  ? Path.join(__dirname, "../node_modules/federation-js/dist/federation-js.min.js")
  : Path.join(__dirname, "../node_modules/federation-js/dist/federation-js.js");

// Start the dev proxy
startDevProxy([
  [{ path: "/" }, { protocol: "file", path: Path.join(__dirname, "../public") }],
  [{ path: "/fynmesh" }, { protocol: "file", path: Path.join(__dirname, "../../../docs") }],
  [{ path: "/federation-js/dist/federation-js.js" }, { protocol: "file", path: federationJsPath }],
  [
    { path: "/federation-js" },
    { protocol: "file", path: Path.join(__dirname, "../node_modules/federation-js") },
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
]);
