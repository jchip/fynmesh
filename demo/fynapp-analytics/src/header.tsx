import React from "react";

export function Header(): React.ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fynmesh-color-dark, #111827)" }}>
        Analytics
      </h1>
      <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--fynmesh-color-secondary, #64748b)" }}>
        Perf Lab dashboard
      </p>
    </div>
  );
}
