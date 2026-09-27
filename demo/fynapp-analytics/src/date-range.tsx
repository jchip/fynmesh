import React from "react";

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "365d", days: 365 },
];

export function DateRange({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {PRESETS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange(p.days)}
          style={{
            padding: "4px 10px",
            fontSize: 12,
            border: "1px solid var(--fynmesh-color-secondary, #cbd5e1)",
            borderRadius: "var(--fynmesh-radius-md, 6px)",
            background: days === p.days ? "var(--fynmesh-color-primary, #2563eb)" : "var(--fynmesh-color-light, #ffffff)",
            color: days === p.days ? "var(--fynmesh-color-light, #ffffff)" : "var(--fynmesh-color-dark, #374151)",
            cursor: "pointer",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
