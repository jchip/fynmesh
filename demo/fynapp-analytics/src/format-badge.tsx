import React from "react";
import { formatPercent } from "analytics-core";

export function FormatBadge({ delta }: { delta: number }): React.ReactElement {
  const positive = delta >= 0;
  return (
    <span
      style={{
        display: "inline-block",
        marginTop: 4,
        fontSize: 11,
        fontWeight: 600,
        padding: "1px 6px",
        borderRadius: "var(--fynmesh-radius-full, 9999px)",
        background: positive ? "var(--fynmesh-color-success, #16a34a)" : "var(--fynmesh-color-danger, #dc2626)",
        color: "var(--fynmesh-color-light, #ffffff)",
      }}
    >
      {positive ? "▲" : "▼"} {formatPercent(Math.abs(delta))}
    </span>
  );
}
