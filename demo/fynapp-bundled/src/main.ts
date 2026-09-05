import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import { hello } from "./hello";
import { banner } from "./banner";

/*
 * `hello` and `banner` are imported statically so they are members of the
 * combined bundle that actually execute, while `./getInfo` is left alone. The
 * app therefore reports a bundle that is partly loaded, which is the state a
 * member count has to get right.
 */
class BundledUnit implements FynUnit {
  private target?: HTMLElement;

  initialize(runtime: FynUnitRuntime) {
    console.log(`\u{1F4E6} ${runtime.fynApp.name} initialize called`);
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    let target = document.getElementById("fynapp-bundled");
    if (!target) {
      target = document.createElement("div");
      target.id = "fynapp-bundled";
      document.body.appendChild(target);
    }
    this.target = target;

    target.textContent = "";
    const title = document.createElement("h3");
    title.textContent = `${runtime.fynApp.name} (${banner()})`;
    const body = document.createElement("p");
    body.textContent = hello();
    target.appendChild(title);
    target.appendChild(body);

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "none", capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    if (this.target) {
      this.target.textContent = "";
      this.target = undefined;
    }
  }
}

export const main = useMiddleware([], new BundledUnit());
