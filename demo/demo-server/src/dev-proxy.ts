import { startDevProxy } from "./proxy.js";
import * as Path from "node:path";
import { fileURLToPath } from "node:url";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

/*
 * TEST BRANCH WIRING -- serve the demo from the live rollup-federation build
 * outputs instead of the stale installed copies.
 *
 * Two of the things being served had nothing to do with the current source:
 * `public/system.js` is a checked-in copy of *stock* SystemJS 6.14.2, and
 * `node_modules/federation-js` was last installed 2026-08-14. federation-js now
 * requires the fynmesh systemjs fork -- it keeps its module registry, name->url,
 * url->module and per-version qualifiers in `System.registrations`, which stock
 * systemjs does not have -- so the demo could not have been exercising any of it.
 *
 * Serving straight from the sibling repo's dist means a rebuild there shows up on
 * a restart, with no copies to keep in sync.
 */
const fedRepo = Path.join(__dirname, "../../../rollup-federation");

// Determine which federation-js file to serve based on NODE_ENV
const isProduction = process.env.NODE_ENV === "production";
const federationJsPath = isProduction
  ? Path.join(fedRepo, "federation-js/dist/federation-js.min.js")
  : Path.join(fedRepo, "federation-js/dist/federation-js.js");

// Start the dev proxy
startDevProxy([
  [{ path: "/" }, { protocol: "file", path: Path.join(__dirname, "../public") }],
  [{ path: "/fynmesh" }, { protocol: "file", path: Path.join(__dirname, "../../../docs") }],
  // the fork, not public/system.js -- see the note above
  [
    { path: "/system.js" },
    { protocol: "file", path: Path.join(fedRepo, "systemjs/dist/system.js") },
  ],
  [{ path: "/federation-js/dist/federation-js.js" }, { protocol: "file", path: federationJsPath }],
  [
    { path: "/federation-js" },
    { protocol: "file", path: Path.join(fedRepo, "federation-js") },
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
]);
