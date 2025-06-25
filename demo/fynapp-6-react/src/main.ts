import { FynMeshKernel, FynApp } from "@fynmesh/kernel";
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from "./App";

export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
  console.log(
    `Bootstrapping ${fynApp.name}...`,
    React,
    ReactDomClient,
    "versions",
    React.version,
    ReactDomVersion
  );

  // Find or create the div element to render into
  let targetDiv = document.getElementById("fynapp-6-react");
  if (!targetDiv) {
    targetDiv = document.createElement("div");
    targetDiv.id = "fynapp-6-react";
    document.body.appendChild(targetDiv);
  }

  // DEBUG: Log what's available
  console.log("🔍 fynapp-6-react main: kernel.middleware:", kernel.middleware);
  console.log("🔍 fynapp-6-react main: fynApp.middleware:", fynApp.middleware);
  console.log(
    "🔍 fynapp-6-react main: fynApp.middleware react-context:",
    fynApp.middleware?.["react-context"]
  );

  // Render the React component with middleware
  ReactDomClient.createRoot(targetDiv).render(
    React.createElement(App, {
      appName: fynApp.name,
      middleware: fynApp.middleware,
    })
  );

  console.log(`${fynApp.name} bootstrapped successfully`);
}
