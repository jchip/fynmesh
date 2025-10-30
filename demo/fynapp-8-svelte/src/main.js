import App from "./App.svelte";

export async function main(runtime) {
  console.log(`Bootstrapping ${runtime.fynApp.name}...`);

  try {
    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-8-svelte");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-8-svelte";
      document.body.appendChild(targetDiv);
    }

    // Clear any existing content
    targetDiv.innerHTML = "";

    // Create and mount the Svelte component
    const app = new App({
      target: targetDiv,
      props: {
        appName: runtime.fynApp.name,
      },
    });

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return cleanup function
    return () => {
      app.$destroy();
      console.log(`${runtime.fynApp.name} unmounted`);
    };
  } catch (error) {
    console.error(`Error bootstrapping ${runtime.fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById("fynapp-8-svelte");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #ff3e00;">
          <h2>${runtime.fynApp.name} (Fallback)</h2>
          <p>Simple Svelte component - Error loading</p>
        </div>
      `;
    }
  }
}
