import React from "react";
import { REGIONS, CHANNELS } from "analytics-core";

const selectStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: 12,
  border: "1px solid var(--fynmesh-color-secondary, #cbd5e1)",
  borderRadius: "var(--fynmesh-radius-md, 6px)",
  background: "var(--fynmesh-color-light, #ffffff)",
  color: "var(--fynmesh-color-dark, #374151)",
};

export function Filters({
  region,
  channel,
  onRegionChange,
  onChannelChange,
}: {
  region?: string;
  channel?: string;
  onRegionChange: (value?: string) => void;
  onChannelChange: (value?: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select style={selectStyle} value={region ?? ""} onChange={(e) => onRegionChange(e.target.value || undefined)}>
        <option value="">All regions</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select
        style={selectStyle}
        value={channel ?? ""}
        onChange={(e) => onChannelChange(e.target.value || undefined)}
      >
        <option value="">All channels</option>
        {CHANNELS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
