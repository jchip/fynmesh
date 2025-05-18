import App from "./App.marko";

export async function main(kernel, fynApp) {
  console.log(`Bootstrapping ${fynApp.name}...`);

  try {
    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-3-marko");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-3-marko";
      document.body.appendChild(targetDiv);
    }

    // First clear the target div
    targetDiv.innerHTML = "";

    // Create a new instance and mount it
    const component = App.renderSync({
      appName: fynApp.name,
    });

    component.appendTo(targetDiv);

    console.log(`${fynApp.name} bootstrapped successfully`);
  } catch (error) {
    console.error(`Error bootstrapping ${fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById("fynapp-3-marko");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #ff5733;">
          <h2>${fynApp.name} (Fallback)</h2>
          <p>Simple Marko component</p>
        </div>
      `;
    }
  }
}
