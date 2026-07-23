import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

/**
 * Framework-agnostic FynApp. Renders plain DOM - no React or other framework.
 */
class VanillaUnit implements FynUnit {
  private target?: HTMLElement;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready", mode: "standalone" };
  }

  execute(runtime: FynUnitRuntime) {
    const id = runtime.fynApp.name;
    let target = document.getElementById(id);
    if (!target) {
      target = document.createElement("div");
      target.id = id;
      document.body.appendChild(target);
    }
    this.target = target;

    let count = 0;
    target.innerHTML = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1>${runtime.fynApp.name}</h1>
        <p>A minimal framework-agnostic FynApp (no React).</p>
        <button id="${id}-btn">Clicked 0 times</button>
      </div>
    `;

    const btn = target.querySelector<HTMLButtonElement>(`#${id}-btn`);
    btn?.addEventListener("click", () => {
      count += 1;
      btn.textContent = `Clicked ${count} times`;
    });
  }

  shutdown() {
    if (this.target) {
      this.target.innerHTML = "";
      this.target = undefined;
    }
  }
}

export const main = useMiddleware([], new VanillaUnit());
