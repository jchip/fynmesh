import React from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";

interface AppProps {
  runtime: FynUnitRuntime;
}

const App: React.FC<AppProps> = ({ runtime }) => (
  <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
    <h1 style={{ margin: 0 }}>FynOps</h1>
    <p data-testid="fynops-shell-status">
      {runtime.fynApp.name} v{runtime.fynApp.version} on React {React.version}
    </p>
  </div>
);

export default App;
