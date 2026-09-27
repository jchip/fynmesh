/** Hash route -> the FynApp whose view renders it. Phase 3 moves this into fynops.routes.json. */
export interface RouteDef {
  path: string;
  app: string;
  title: string;
}

export const ROUTES: RouteDef[] = [
  { path: "/shipments", app: "ops-shipments", title: "Shipments" },
  { path: "/map", app: "ops-map", title: "Fleet map" },
  { path: "/analytics", app: "ops-analytics", title: "Analytics" },
  // Temporary: proves the view contract until the real features land (Phase 1, Wave C removes it).
  { path: "/stub", app: "stub-view", title: "Stub view" },
];

export const DEFAULT_ROUTE = "/shipments";

export interface Location {
  path: string;
  params: Record<string, string>;
}

/** "#/map?vehicle=12" -> { path: "/map", params: { vehicle: "12" } } */
export function parseHash(hash: string): Location {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  return {
    path: path || DEFAULT_ROUTE,
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}
