const { startDevProxy } = require("./proxy");
const Path = require("node:path");

// Start the dev proxy
startDevProxy([
  [{ path: "/" }, { protocol: "file", path: Path.join(__dirname, "../public") }],
  [{ path: "/federation-js" }, { protocol: "file", path: Path.join(__dirname, "../node_modules/federation-js") }],
  [{ path: "/core/kernel" }, { protocol: "file", path: Path.join(__dirname, "../../../core/kernel") }],
  [{ path: "/fynapp-1" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-1") }],
  [{ path: "/fynapp-react-19" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-19") }],
  [{ path: "/fynapp-2-react18" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-2-react18") }],
  [{ path: "/fynapp-react-18" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-18") }],
  [{ path: "/fynapp-3-marko" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-3-marko") }],
  [{ path: "/fynapp-4-vue" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-4-vue") }],
  [{ path: "/fynapp-5-preact" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-5-preact") }],
  [{ path: "/fynapp-6-react" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-6-react") }],
  [{ path: "/fynapp-7-solid" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-7-solid") }],
]);

