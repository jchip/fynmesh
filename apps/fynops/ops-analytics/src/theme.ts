/**
 * Reads fynops-ui-kit's CSS custom properties off a live element, so charts
 * pick up whichever theme (light or dark `data-theme`) is in effect for that
 * part of the page. See fynops-ui-kit/src/styles.ts for the token names.
 */
export interface ChartTheme {
  primary: string;
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  statusOnTime: string;
  statusDelayed: string;
  statusInTransit: string;
  statusDelivered: string;
  statusException: string;
}

const FALLBACK: ChartTheme = {
  primary: "#4f46e5",
  text: "#0f172a",
  textMuted: "#64748b",
  border: "#e2e8f0",
  surface: "#ffffff",
  statusOnTime: "#166534",
  statusDelayed: "#854d0e",
  statusInTransit: "#1e40af",
  statusDelivered: "#334155",
  statusException: "#991b1b",
};

const VARS: Record<keyof ChartTheme, string> = {
  primary: "--fo-ui-color-primary",
  text: "--fo-ui-color-text",
  textMuted: "--fo-ui-color-text-muted",
  border: "--fo-ui-color-border",
  surface: "--fo-ui-color-surface",
  statusOnTime: "--fo-ui-color-status-on-time-fg",
  statusDelayed: "--fo-ui-color-status-delayed-fg",
  statusInTransit: "--fo-ui-color-status-in-transit-fg",
  statusDelivered: "--fo-ui-color-status-delivered-fg",
  statusException: "--fo-ui-color-status-exception-fg",
};

export function readChartTheme(el: Element): ChartTheme {
  const computed = getComputedStyle(el);
  const theme = {} as ChartTheme;
  for (const key of Object.keys(VARS) as Array<keyof ChartTheme>) {
    const value = computed.getPropertyValue(VARS[key]).trim();
    theme[key] = value || FALLBACK[key];
  }
  return theme;
}

/** A vehicle's status (from VehiclePosition.status), given a label and a theme color to draw it with. */
export interface VehicleStatusMeta {
  label: string;
  colorKey: keyof ChartTheme;
}

// idle/loading/maintenance come straight off the vehicles table; en_route is
// set by the simulator while a vehicle carries an active shipment (see the
// A4 data summary). Reuses the kit's badge status colors, since they already
// carry the right meaning: blue for moving, green for prepping, gray for
// parked, red for down.
export const VEHICLE_STATUS_META: Record<string, VehicleStatusMeta> = {
  en_route: { label: "En route", colorKey: "statusInTransit" },
  loading: { label: "Loading", colorKey: "statusOnTime" },
  idle: { label: "Idle", colorKey: "statusDelivered" },
  maintenance: { label: "Maintenance", colorKey: "statusException" },
};

/** Fixed slice order, so the donut doesn't reshuffle from tick to tick. */
export const VEHICLE_STATUS_ORDER = ["idle", "loading", "en_route", "maintenance"];
