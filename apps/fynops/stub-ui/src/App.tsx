import React, { useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import {
  Button,
  Panel,
  Toolbar,
  StatTile,
  Badge,
  Table,
  type BadgeStatus,
  type Theme,
} from "fynops-ui-kit";

interface AppProps {
  runtime: FynUnitRuntime;
}

const VARIANTS = ["primary", "secondary", "ghost"] as const;
const SIZES = ["sm", "md", "lg"] as const;
const BADGE_STATUSES: BadgeStatus[] = [
  "on-time",
  "delayed",
  "in-transit",
  "delivered",
  "exception",
];

interface ShipmentRow {
  id: number;
  lane: string;
  carrier: string;
  status: BadgeStatus;
}

const ROWS: ShipmentRow[] = [
  { id: 1001, lane: "LAX -> ORD", carrier: "Swift", status: "on-time" },
  { id: 1002, lane: "DFW -> ATL", carrier: "Knight", status: "delayed" },
  { id: 1003, lane: "SEA -> DEN", carrier: "Werner", status: "in-transit" },
  { id: 1004, lane: "MIA -> JFK", carrier: "Old Dominion", status: "delivered" },
  { id: 1005, lane: "PHX -> SLC", carrier: "Schneider", status: "exception" },
];

const App: React.FC<AppProps> = ({ runtime }) => {
  const [theme, setTheme] = useState<Theme>("light");

  return (
    <div
      data-theme={theme}
      style={{
        background: "var(--fo-ui-color-bg)",
        color: "var(--fo-ui-color-text)",
        minHeight: "100vh",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        fontFamily: "var(--fo-ui-font-sans)",
      }}
    >
      <Toolbar>
        <h1 style={{ margin: 0, fontSize: "1.1rem", flex: 1 }}>
          {runtime.fynApp.name} v{runtime.fynApp.version} - fynops-ui-kit gallery
        </h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
        >
          Switch to {theme === "light" ? "dark" : "light"} theme
        </Button>
      </Toolbar>

      <Panel title="Buttons" actions={<Badge status="on-time" />}>
        <Toolbar>
          {VARIANTS.map((variant) =>
            SIZES.map((size) => (
              <Button key={`${variant}-${size}`} variant={variant} size={size}>
                {variant} {size}
              </Button>
            )),
          )}
          <Button variant="primary" disabled>
            disabled
          </Button>
        </Toolbar>
      </Panel>

      <Panel title="Stat tiles">
        <Toolbar>
          <StatTile label="On-time rate" value="94.2%" delta="+1.4%" deltaDirection="up" />
          <StatTile label="Avg transit days" value="3.1" delta="-0.3" deltaDirection="down" />
          <StatTile label="Open exceptions" value="6" />
        </Toolbar>
      </Panel>

      <Panel title="Badges">
        <Toolbar>
          {BADGE_STATUSES.map((status) => (
            <Badge key={status} status={status} />
          ))}
        </Toolbar>
      </Panel>

      <Panel title="Shipments">
        <Table
          columns={[
            { key: "id", header: "ID", align: "right" },
            { key: "lane", header: "Lane" },
            { key: "carrier", header: "Carrier" },
            {
              key: "status",
              header: "Status",
              render: (row) => <Badge status={row.status} />,
            },
          ]}
          rows={ROWS}
          rowKey={(row) => row.id}
        />
      </Panel>

      <Panel title="Empty table">
        <Table<ShipmentRow>
          columns={[
            { key: "id", header: "ID" },
            { key: "lane", header: "Lane" },
          ]}
          rows={[]}
          rowKey={(row) => row.id}
        />
      </Panel>
    </div>
  );
};

export default App;
