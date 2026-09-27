import React from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi, FynOpsViewProps } from "fynops-shell/api";
import { ShipmentsGrid } from "./ShipmentsGrid";
import { ShipmentDetailPanel } from "./ShipmentDetailPanel";

export interface ViewProps {
  shell: FynOpsShellApi;
  props: FynOpsViewProps;
  runtime: FynUnitRuntime;
}

/** One view, two faces: the grid in the main outlet, a detail panel in the drawer. */
export const ShipmentsView: React.FC<ViewProps> = ({ shell, props, runtime }) => {
  if (props.target === "drawer") {
    return <ShipmentDetailPanel id={Number(props.params.id)} runtime={runtime} />;
  }
  return <ShipmentsGrid shell={shell} />;
};
