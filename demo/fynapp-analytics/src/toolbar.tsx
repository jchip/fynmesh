import React from "react";

export function Toolbar({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
