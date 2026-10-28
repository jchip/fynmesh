import React from "react";

export const UI_KIT_VERSION = "1.4.0";

export function Button({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: "6px 14px", border: "none", borderRadius: 4, background: "#2255cc", color: "#fff", cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

export function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #999", borderRadius: 6, padding: 12, margin: 8, maxWidth: 360 }}>
      <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
      {children}
    </div>
  );
}
