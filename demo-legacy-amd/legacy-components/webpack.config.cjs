const path = require("path");

module.exports = {
  mode: "development",
  devtool: false,
  entry: {
    "ui-kit": "./src/ui-kit.jsx",
    "widget-a": "./src/widget-a.jsx",
    "widget-b": "./src/widget-b.jsx",
    "widget-c": "./src/widget-c.jsx",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    library: { type: "amd" },
  },
  // Function form so the ui-kit entry bundles itself instead of externalizing itself.
  externals: [
    function ({ request, contextInfo }, callback) {
      if (request === "react" || request === "react-dom") return callback(null, request);
      if (request === "ui-kit" && !/ui-kit\.jsx$/.test(contextInfo.issuer || "")) return callback(null, request);
      callback();
    },
  ],
  resolve: { extensions: [".js", ".jsx"] },
  module: {
    rules: [{ test: /\.jsx?$/, exclude: /node_modules/, use: "babel-loader" }],
  },
};
