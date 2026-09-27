import React from "react";

export type BadgeStatus = "on-time" | "delayed" | "in-transit" | "delivered" | "exception";

const STATUS_LABEL: Record<BadgeStatus, string> = {
  "on-time": "On time",
  delayed: "Delayed",
  "in-transit": "In transit",
  delivered: "Delivered",
  exception: "Exception",
};

export interface BadgeProps {
  status: BadgeStatus;
  /** Overrides the default label text for `status`. */
  children?: React.ReactNode;
  className?: string;
}

/** A small pill colored by shipment/vehicle status. */
export const Badge: React.FC<BadgeProps> = ({ status, children, className }) => {
  const classes = ["fo-ui-badge", `fo-ui-badge--${status}`, className].filter(Boolean).join(" ");
  return <span className={classes}>{children ?? STATUS_LABEL[status]}</span>;
};
