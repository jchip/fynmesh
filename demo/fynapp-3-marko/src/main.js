import App from "./App.marko";

async function execute(runtime) {
  console.log(`Bootstrapping ${runtime.fynApp.name}...`);

  try {
    // Find or create the div element to render into
    // Priority: shell-managed container > standalone pre-defined container > create new
    let targetDiv = document.getElementById(`shell-fynapp-${runtime.fynApp.name}`);

    if (!targetDiv) {
      // Fallback for standalone mode (no shell)
      targetDiv = document.getElementById("fynapp-3-marko");
      if (!targetDiv) {
        targetDiv = document.createElement("div");
        targetDiv.id = "fynapp-3-marko";
        document.body.appendChild(targetDiv);
      }
    }

    // First clear the target div
    targetDiv.innerHTML = "";

    // Render and attach the template. Marko 6 replaced renderSync()/appendTo()
    // with mount(input, reference), which appends inside the target by default.
    App.mount(
      {
        appName: runtime.fynApp.name,
      },
      targetDiv,
    );

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return self-managed result to tell shell middleware we've handled rendering
    return { type: 'self-managed' };
  } catch (error) {
    console.error(`Error bootstrapping ${runtime.fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById(`shell-fynapp-${runtime.fynApp.name}`) ||
                    document.getElementById("fynapp-3-marko");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #ff5733;">
          <h2>${runtime.fynApp.name} (Fallback)</h2>
          <p>Simple Marko component</p>
        </div>
      `;
    }
  }
}

export const main = {
  execute,
};
