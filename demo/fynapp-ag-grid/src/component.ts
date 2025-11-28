import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Wrapper component that receives runtime props from shell
function AgGridComponent({ fynApp, runtime }: any): React.ReactElement {
  return React.createElement(App, {
    appName: fynApp?.name || "AG Grid Demo",
  });
}

// Component export for shell rendering
export const component = {
  type: 'react' as const,
  component: AgGridComponent,
  react: React,
  reactDOM: ReactDOM,
  metadata: {
    name: 'AG Grid FynApp',
    version: '1.0.0',
    description: 'Enterprise data grid with AG Grid Community'
  }
};
