import React from "react";

export function EmptyState({ onReset }: { onReset: () => void }): React.ReactElement {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        background: "var(--fynmesh-color-light, #ffffff)",
        borderRadius: "var(--fynmesh-radius-lg, 8px)",
        boxShadow: "var(--fynmesh-shadow-sm, 0 1px 2px rgba(0,0,0,0.08))",
        color: "var(--fynmesh-color-secondary, #64748b)",
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: 13 }}>No data matches these filters.</p>
      <button
        type="button"
        onClick={onReset}
        style={{
          padding: "4px 12px",
          fontSize: 12,
          border: "none",
          borderRadius: "var(--fynmesh-radius-md, 6px)",
          background: "var(--fynmesh-color-primary, #2563eb)",
          color: "var(--fynmesh-color-light, #ffffff)",
          cursor: "pointer",
        }}
      >
        Reset filters
      </button>
    </div>
  );
}
