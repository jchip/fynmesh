const path = require("path");

module.exports = {
  mode: "development",
  devtool: false,
  entry: {
    // the old common bundle's ui-kit: the npm package, bundled as an AMD module
    "ui-kit": "ui-kit",
    "widget-a": "./src/widget-a.jsx",
    "widget-b": "./src/widget-b.jsx",
    "widget-c": "./src/widget-c.jsx",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    library: { type: "amd" },
  },
  // Function form so the ui-kit entry, which has no issuer, bundles itself instead of externalizing itself.
  externals: [
    function ({ request, contextInfo }, callback) {
      if (request === "react" || request === "react-dom" || request === "react-dom/client") return callback(null, request);
      // ui-kit imports the esm-react package; on the AMD page that is the "react" id
      if (request === "esm-react") return callback(null, "react");
      if (request === "ui-kit" && contextInfo.issuer) return callback(null, request);
      callback();
    },
  ],
  resolve: { extensions: [".js", ".jsx"] },
  module: {
    rules: [{ test: /\.jsx?$/, exclude: /node_modules/, use: "babel-loader" }],
  },
};
