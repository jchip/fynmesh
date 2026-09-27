import React from "react";

export type StatDeltaDirection = "up" | "down";

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Formatted delta text, e.g. "+4.2%". Rendered with an up/down arrow. */
  delta?: string;
  /** Colors the delta green (up) or red (down). Omit for a neutral delta. */
  deltaDirection?: StatDeltaDirection;
  className?: string;
}

/** A compact label/value tile with an optional colored delta. */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  delta,
  deltaDirection,
  className,
}) => {
  const classes = ["fo-ui-stat-tile", className].filter(Boolean).join(" ");
  const deltaClass = [
    "fo-ui-stat-tile-delta",
    deltaDirection && `fo-ui-stat-tile-delta--${deltaDirection}`,
  ]
    .filter(Boolean)
    .join(" ");
  const arrow = deltaDirection === "up" ? "▲" : deltaDirection === "down" ? "▼" : null;

  return (
    <div className={classes}>
      <div className="fo-ui-stat-tile-label">{label}</div>
      <div className="fo-ui-stat-tile-value">{value}</div>
      {delta && (
        <div className={deltaClass}>
          {arrow && <span aria-hidden="true">{arrow}</span>} {delta}
        </div>
      )}
    </div>
  );
};
