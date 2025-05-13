import { createApp } from "vue";
import App from "./App.vue";

export async function bootstrap(kernel, fynApp) {
  console.log(`Bootstrapping ${fynApp.name}...`);

  try {
    // Find or create the div element to render into
    let targetDiv = document.getElementById("fynapp-4-vue");
    if (!targetDiv) {
      targetDiv = document.createElement("div");
      targetDiv.id = "fynapp-4-vue";
      document.body.appendChild(targetDiv);
    }

    // Create and mount the Vue app
    const app = createApp(App, {
      appName: fynApp.name,
    });

    app.mount(targetDiv);

    console.log(`${fynApp.name} bootstrapped successfully`);
  } catch (error) {
    console.error(`Error bootstrapping ${fynApp.name}:`, error);

    // Fallback rendering if component fails
    let targetDiv = document.getElementById("fynapp-4-vue");
    if (targetDiv) {
      targetDiv.innerHTML = `
        <div style="padding: 20px; color: #8b5cf6;">
          <h2>${fynApp.name} (Fallback)</h2>
          <p>Simple Vue component</p>
        </div>
      `;
    }
  }
}
