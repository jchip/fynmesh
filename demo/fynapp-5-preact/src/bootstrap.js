import { h, render } from "preact";
import App from "./App";

export async function bootstrap(kernel, fynApp) {
  console.log(`Bootstrapping ${fynApp.name}...`);

  try {
    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-5-preact");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-5-preact";
      document.body.appendChild(targetDiv);
    }

    // Clear any existing content
    targetDiv.innerHTML = "";

    // Render the Preact component
    render(h(App, { appName: fynApp.name }), targetDiv);

    console.log(`${fynApp.name} bootstrapped successfully`);
  } catch (error) {
    console.error(`Error bootstrapping ${fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById("fynapp-5-preact");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #673ab8;">
          <h2>${fynApp.name} (Fallback)</h2>
          <p>Simple Preact component</p>
        </div>
      `;
    }
  }
}
