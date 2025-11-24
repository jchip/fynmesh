import { createApp } from "vue";
import App from "./App.vue";

export async function main(runtime) {
  console.log(`Bootstrapping ${runtime.fynApp.name}...`);

  try {
    // Find or create the div element to render into
    // Priority: shell-managed container > standalone pre-defined container > create new
    let targetDiv = document.getElementById(`shell-fynapp-${runtime.fynApp.name}`);

    if (!targetDiv) {
      // Fallback for standalone mode (no shell)
      targetDiv = document.getElementById("fynapp-4-vue");
      if (!targetDiv) {
        targetDiv = document.createElement("div");
        targetDiv.id = "fynapp-4-vue";
        document.body.appendChild(targetDiv);
      }
    }

    // Create and mount the Vue app
    const app = createApp(App, {
      appName: runtime.fynApp.name,
    });

    app.mount(targetDiv);

    console.log(`${runtime.fynApp.name} bootstrapped successfully`);

    // Return self-managed result to tell shell middleware we've handled rendering
    return { type: 'self-managed' };
  } catch (error) {
    console.error(`Error bootstrapping ${runtime.fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById(`shell-fynapp-${runtime.fynApp.name}`) ||
                    document.getElementById("fynapp-4-vue");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #8b5cf6;">
          <h2>${runtime.fynApp.name} (Fallback)</h2>
          <p>Simple Vue component</p>
        </div>
      `;
    }
  }
}
