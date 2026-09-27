import React from "react";
import { FormatBadge } from "./format-badge";

export function KpiTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number;
}): React.ReactElement {
  return (
    <div
      style={{
        background: "var(--fynmesh-color-light, #ffffff)",
        borderRadius: "var(--fynmesh-radius-lg, 8px)",
        boxShadow: "var(--fynmesh-shadow-sm, 0 1px 2px rgba(0,0,0,0.08))",
        padding: 12,
      }}
    >
      <div style={{ fontSize: 11, color: "var(--fynmesh-color-secondary, #64748b)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fynmesh-color-dark, #111827)" }}>{value}</div>
      <FormatBadge delta={delta} />
    </div>
  );
}
