const fs = require("fs");
const path = require("path");

const out = path.resolve(__dirname, "../public/libs");
fs.mkdirSync(out, { recursive: true });
const files = [
  ["requirejs/require.js", "require.js"],
  ["react/umd/react.development.js", "react.development.js"],
  ["react-dom/umd/react-dom.development.js", "react-dom.development.js"],
];
for (const [spec, name] of files) {
  // umd/ is not in the "exports" map, so resolve the package root then join.
  const pkg = spec.split("/")[0];
  const root = path.dirname(require.resolve(pkg + "/package.json"));
  fs.copyFileSync(path.join(root, spec.slice(pkg.length + 1)), path.join(out, name));
}
