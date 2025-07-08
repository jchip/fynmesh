import { render } from "solid-js/web";
import App from "./App";

export async function main(runtime) {
  console.log(`Bootstrapping ${runtime.fynApp.name}...`);

  try {
    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-7-solid");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-7-solid";
      document.body.appendChild(targetDiv);
    }

    // Clear any existing content
    targetDiv.innerHTML = "";

    // Render the Solid component
    const dispose = render(
      () => <App appName={runtime.fynApp.name} />,
      targetDiv
    );

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return cleanup function
    return () => {
      dispose();
      console.log(`${runtime.fynApp.name} unmounted`);
    };
  } catch (error) {
    console.error(`Error bootstrapping ${runtime.fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById("fynapp-7-solid");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #2D7FF9;">
          <h2>${runtime.fynApp.name} (Fallback)</h2>
          <p>Simple Solid.js component</p>
        </div>
      `;
    }
  }
}
