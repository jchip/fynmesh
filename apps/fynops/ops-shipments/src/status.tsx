import React from "react";
import { Badge, type BadgeStatus } from "fynops-ui-kit";

/** Shipment statuses in the data, mapped onto the kit's five badge colors. */
const STATUS: Record<string, { badge: BadgeStatus; label: string }> = {
  booked: { badge: "on-time", label: "Booked" },
  picked_up: { badge: "in-transit", label: "Picked up" },
  in_transit: { badge: "in-transit", label: "In transit" },
  delayed: { badge: "delayed", label: "Delayed" },
  delivered: { badge: "delivered", label: "Delivered" },
  exception: { badge: "exception", label: "Exception" },
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS[status] ?? { badge: "exception" as const, label: status };
  return <Badge status={s.badge}>{s.label}</Badge>;
};

const HOUR = 3_600_000;

/** Hours late for a delivered shipment (negative is early), else null. */
export function delayHours(row: { due_at: string; delivered_at: string | null }): number | null {
  if (!row.delivered_at) return null;
  return Math.round((Date.parse(row.delivered_at) - Date.parse(row.due_at)) / HOUR);
}

export function formatDelay(hours: number | null, status: string): string {
  if (hours === null) return status === "delayed" ? "late" : "";
  if (hours <= 0) return "on time";
  return `${hours}h late`;
}

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

export const formatNumber = (n: unknown, digits = 0): string =>
  typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "";

export const formatUsd = (n: unknown): string =>
  typeof n === "number" ? n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "";
