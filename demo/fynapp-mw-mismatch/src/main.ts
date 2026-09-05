import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";

/**
 * The FynApp that misdeclares its middleware on purpose.
 *
 * It exists because two of the resolution branches the inspector exists to warn
 * about could not be seen anywhere in this repo: every declaration on
 * `/demo.html` and `/shell.html` lands on `default` or `range`, so verifying the
 * amber path meant patching `__middlewareMeta` in the live kernel from the
 * console (FYM-362). Nothing a reviewer or a later change could lean on.
 *
 * It is opt-in -- `/demo.html?lab=mw` -- because the pages the diagnostics are
 * verified against have to stay healthy; see the lab block in
 * `demo-server/templates/components/fynapp-loader.html`.
 */
class MismatchUnit implements FynUnit {
  private target?: HTMLElement;

  initialize(runtime: FynUnitRuntime) {
    console.log(`\u{1F6A7} ${runtime.fynApp.name} initialize called`);
    return { status: "ready" as const, mode: "standalone" as const };
  }

  execute(runtime: FynUnitRuntime) {
    let target = document.getElementById("fynapp-mw-mismatch");
    if (!target) {
      target = document.createElement("div");
      target.id = "fynapp-mw-mismatch";
      document.body.appendChild(target);
    }
    this.target = target;

    /*
     * That this renders at all is half the point. A fallback still delivers --
     * the kernel hands over the `default` registration and the app runs on a
     * version it never asked for -- so nothing on the page looks wrong. In a
     * production build the kernel's own warning is stripped by terser's
     * `drop_console`, which leaves the inspector's amber chip as the only
     * signal that anything is off.
     */
    target.textContent = "";
    const title = document.createElement("h3");
    title.textContent = `${runtime.fynApp.name}`;
    const body = document.createElement("p");
    body.textContent =
      "Asked for design-tokens ^9.0.0 and got whatever was registered; asked for " +
      "layout-tokens and got nothing. Both rendered fine.";
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

export const main = useMiddleware(
  [
    /*
     * `fallback`: a range no registered version satisfies.
     *
     * `fynapp-design-tokens` registers `design-tokens` at its own version,
     * 1.0.0. `^9.0.0` matches nothing, so `resolveFromVersionMap` falls through
     * to the `default` slot and warns -- the fourth branch, the one that means
     * "running a version it did not ask for" rather than "asked for nothing".
     *
     * The range is written as an import attribute rather than into
     * package.json, so `fyn` still installs the real 1.0.0 dependency; the
     * plugin prefers `attributes.semver` over the nearest package version when
     * it builds the `-FYNAPP_MIDDLEWARE` id.
     *
     * This declaration is also what keeps the app alive: a fallback resolves,
     * so `execute` is reached. A unit whose every declaration failed would
     * never run at all, and there would be nothing on the page to inspect.
     */
    {
      // @ts-ignore - TS can't understand module federation remote containers
      mw: import(
        "fynapp-design-tokens/middleware/design-tokens/design-tokens",
        // @ts-ignore
        { with: { type: "fynapp-middleware", semver: "^9.0.0" } }
      ),
      config: {
        theme: "fynmesh-default",
        cssCustomProperties: true,
        cssVariablePrefix: "fynmesh",
        enableThemeSwitching: false,
        global: false,
      },
    },

    /*
     * `unresolved`: a middleware that IS registered and still resolves to
     * nothing.
     *
     * There is no version to ask for here, and that is deliberate -- the branch
     * is not about the range. `registerMiddleware` writes `versionMap[version]`
     * and `versionMap.default` from the same object, so a registry the kernel
     * built always has a default slot backed by a version key and can never
     * reach this state. Only a registry that came from somewhere else can: one
     * handed to `initRunTime`, cloned, or serialised and read back.
     *
     * So the entry is staged by the lab block on the page rather than authored
     * here, and this declares the use of it. Without the lab block the name is
     * simply not registered, which is a different (red) condition.
     */
    {
      info: {
        name: "layout-tokens",
        provider: "fynapp-phantom-mw",
      },
      config: {},
    },
  ],
  new MismatchUnit()
);
