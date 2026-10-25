// @ts-ignore
import React from "esm-react";
// @ts-ignore
import ReactDOM from "esm-react-dom";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

const h = React.createElement;

function App({ name }: { name: string }) {
  const [count, setCount] = React.useState(0);
  return h(
    "div",
    { style: { border: "1px solid #888", borderRadius: 6, padding: 12 } },
    h("h3", { style: { margin: "0 0 8px" } }, name),
    h("p", { style: { margin: "0 0 8px" } }, "Plain FynApp. Imports esm-react ^18.0.0 from federation."),
    h("button", { onClick: () => setCount(count + 1) }, `Clicked ${count}`),
    h("p", { style: { margin: "8px 0 0" } }, `React ${React.version}`),
  );
}

export const main: FynUnit = {
  execute(runtime: FynUnitRuntime) {
    const name = runtime.fynApp.name;
    let target = document.getElementById(name);
    if (!target) {
      target = document.createElement("div");
      target.id = name;
      document.body.appendChild(target);
    }
    const root = ReactDOM.createRoot(target);
    root.render(h(App, { name }));
    return { type: "self-managed", target, cleanup: () => root.unmount() };
  },
};
