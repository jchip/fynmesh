/**
 * Mounting: the custom element, the shadow root, and the public handle.
 *
 * One custom element hosting one shadow root, with ordinary Preact components
 * inside. The shadow root is what keeps the page's CSS out (a devtools overlay
 * that inherits the app's `* { box-sizing }` or a global `button` reset is
 * unusable) and keeps ours from leaking in the other direction. The same
 * approach the kernel's dev error overlay takes, for the same reason.
 */

import { render } from "preact";
import { effect } from "@preact/signals";
import type { Snapshot, ViewName } from "../core/model.js";
import type { Adapter } from "../adapters/types.js";
import { LiveAdapter } from "../adapters/live.js";
import { STYLES } from "./styles.js";
import { App, type Corner } from "./App.jsx";
import {
  density,
  expanded,
  focusOn,
  live,
  open,
  openedWithCount,
  selected,
  setSnapshot,
  snapshot,
  theme,
  view,
} from "./state.js";
import type { Density } from "./metrics.js";

export const ELEMENT_NAME = "fed-inspector";

export interface MountOptions {
  /** where to attach the host element; defaults to `document.body` */
  target?: HTMLElement;
  /** launcher corner */
  corner?: Corner;
  /** render the corner launcher; false mounts the overlay only */
  launcher?: boolean;
  /** open immediately */
  open?: boolean;
  /** toggle hotkey, or false to install none */
  hotkey?: string | false;
  theme?: "auto" | "light" | "dark";
  /** type and spacing scale: "compact" | "normal" | "relaxed" */
  density?: Density;
  /** live-refresh interval; false to only refresh on demand */
  pollMs?: number | false;
  /** supply your own source of snapshots (e.g. a RemoteAdapter) */
  adapter?: Adapter;
  /** loader to inspect; defaults to `globalThis.System` */
  loader?: unknown;
  /** federation runtime; defaults to `globalThis.Federation` */
  federation?: unknown;
}

export interface InspectorHandle {
  /** open the panel, optionally on a view with something selected */
  open(view?: ViewName, select?: string): void;
  close(): void;
  toggle(): void;
  /** force a collect and return the result */
  refresh(): Promise<Snapshot>;
  /** the current snapshot without forcing a collect */
  snapshot(): Snapshot;
  /** the host element, for anyone who wants to move or style it */
  element: HTMLElement;
  destroy(): void;
}

let counter = 0;

/**
 * The host element.
 *
 * A custom element rather than a plain div so a consumer can find it, style it
 * from the page (`fed-inspector { ... }` reaches the host, not the contents),
 * and remove it by tag name. Registration is guarded because a page can load
 * the standalone bundle twice.
 */
class InspectorHost extends HTMLElement {
  root: ShadowRoot;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    applyStyles(this.root);
  }
}

function applyStyles(root: ShadowRoot): void {
  // Constructable stylesheets where available: one parsed sheet shared by
  // every host, and no <style> node for a MutationObserver in the page to trip
  // over. The fallback covers older Safari.
  const CSS = (globalThis as any).CSSStyleSheet;
  if (CSS && "adoptedStyleSheets" in Document.prototype) {
    try {
      const sheet = new CSS();
      sheet.replaceSync(STYLES);
      root.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // fall through
    }
  }
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);
}

function defineElement(): void {
  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, InspectorHost);
  }
}

export function mount(opts: MountOptions = {}): InspectorHandle {
  if (typeof document === "undefined") {
    throw new Error("federation-inspector: mount() requires a document");
  }
  defineElement();

  const host = document.createElement(ELEMENT_NAME) as InspectorHost;
  host.id = "fed-inspector-" + ++counter;
  host.setAttribute("data-theme", opts.theme ?? theme.value);
  host.setAttribute("data-density", opts.density ?? density.value);

  const adapter =
    opts.adapter ??
    new LiveAdapter({
      loader: opts.loader,
      federation: opts.federation,
      pollMs: opts.pollMs,
    });

  if (opts.theme) {
    theme.value = opts.theme;
  }
  if (opts.density) {
    density.value = opts.density;
  }
  if (opts.pollMs === false) {
    live.value = false;
  }

  // Keep the host attributes in step with their signals: the CSS keys both the
  // palette and the whole size scale off [data-theme] / [data-density], so a
  // toggle is one attribute write and the stylesheet does the rest.
  const stopTheme = effect(() => {
    host.setAttribute("data-theme", theme.value);
    host.setAttribute("data-density", density.value);
  });

  (opts.target ?? document.body).appendChild(host);

  render(
    <App
      adapter={adapter}
      corner={opts.corner ?? "bottom-right"}
      showLauncher={opts.launcher !== false}
      hotkey={opts.hotkey === undefined ? "ctrl+shift+m" : opts.hotkey}
    />,
    host.root
  );

  if (opts.open) {
    open.value = true;
  }

  return {
    open(nextView?: ViewName, select?: string) {
      openedWithCount.value = snapshot.value.modules.length;
      open.value = true;
      if (nextView) {
        focusOn(nextView, select ? "id:" + select : undefined, select);
      }
    },
    close() {
      open.value = false;
    },
    toggle() {
      if (!open.value) {
        openedWithCount.value = snapshot.value.modules.length;
      }
      open.value = !open.value;
    },
    async refresh() {
      const snap = await adapter.refresh();
      setSnapshot(snap);
      return snap;
    },
    snapshot() {
      return snapshot.value;
    },
    element: host,
    destroy() {
      stopTheme();
      render(null, host.root);
      host.remove();
      adapter.dispose();
      open.value = false;
      selected.value = undefined;
      expanded.value = new Set();
      view.value = "modules";
    },
  };
}
