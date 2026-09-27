import React, { useEffect, useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import type { FynOpsShellApi, FynOpsViewProps, Selection } from "fynops-shell/api";

interface Props {
  shell: FynOpsShellApi;
  props: FynOpsViewProps;
  runtime: FynUnitRuntime;
}

const StubView: React.FC<Props> = ({ shell, props }) => {
  const [selection, setSelection] = useState<Selection>(() => shell.selection.get());
  // Local state: survives route switches only if the shell keeps the view mounted.
  const [clicks, setClicks] = useState(0);

  useEffect(() => shell.selection.subscribe(setSelection), [shell]);

  const pick = () => {
    setClicks((n) => n + 1);
    shell.selection.set({ shipmentId: 1000 + Math.floor(Math.random() * 9000) });
  };

  return (
    <div data-testid={`stub-view-${props.target}`} style={{ padding: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Stub view ({props.target})</h2>
      <p>
        Signed in as <b data-testid="stub-user">{shell.session.user}</b> (
        <span data-testid="stub-role">{shell.session.role}</span>) on React {React.version}
      </p>
      <p>
        Selected shipment: <b data-testid="stub-selection">{selection.shipmentId ?? "none"}</b>
      </p>
      <p>
        Local clicks: <b data-testid="stub-clicks">{clicks}</b>
      </p>
      <p>Params: {JSON.stringify(props.params)}</p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button data-testid="stub-select" onClick={pick}>
          Select a random shipment
        </button>
        {props.target === "main" && (
          <button
            data-testid="stub-open-drawer"
            onClick={() => shell.openDrawer("stub-view", { from: "main" })}
          >
            Open in drawer
          </button>
        )}
        <button onClick={() => shell.navigate("#/map")}>Go to map</button>
      </div>
    </div>
  );
};

export default StubView;
