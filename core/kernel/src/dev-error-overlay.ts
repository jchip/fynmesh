type BootstrapFailureDetail = {
  name?: unknown;
  version?: unknown;
  error?: unknown;
};

const OVERLAY_ATTRIBUTE = "data-fynmesh-error-overlay";

function getFailureText(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  if (error && typeof error === "object") {
    const value = error as { message?: unknown; stack?: unknown };
    if (typeof value.message === "string") {
      return {
        message: value.message,
        stack: typeof value.stack === "string" ? value.stack : undefined,
      };
    }
  }

  return { message: error === undefined ? "Unknown error" : String(error) };
}

/**
 * Show FynApp bootstrap failures in development builds.
 * Returns a disposer that removes both the listener and any visible overlay.
 */
export function installDevErrorOverlay(events: EventTarget, doc: Document = document): () => void {
  let overlayHost: HTMLElement | undefined;

  const removeOverlay = () => {
    overlayHost?.remove();
    overlayHost = undefined;
  };

  const handleFailure: EventListener = (event) => {
    const detail = (event as CustomEvent<BootstrapFailureDetail>).detail ?? {};
    const name = typeof detail.name === "string" ? detail.name : "Unknown FynApp";
    const version = typeof detail.version === "string" ? `@${detail.version}` : "";
    const failure = getFailureText(detail.error);

    removeOverlay();

    const host = doc.createElement("div");
    host.setAttribute(OVERLAY_ATTRIBUTE, "");
    const shadow = host.attachShadow({ mode: "open" });

    const style = doc.createElement("style");
    style.textContent = `
      :host { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: start center; padding: 24px; box-sizing: border-box; background: rgb(0 0 0 / 55%); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      section { width: min(900px, 100%); max-height: calc(100vh - 48px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid #ff6b6b; border-radius: 8px; background: #1e1114; color: #ffe8e8; box-shadow: 0 12px 40px rgb(0 0 0 / 45%); }
      header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
      h1 { margin: 0; font: 700 18px/1.4 system-ui, sans-serif; }
      .identity { margin: 8px 0 16px; color: #ffb3b3; font-weight: 700; }
      .message { margin: 0; white-space: pre-wrap; }
      pre { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #633; color: #ffd3d3; white-space: pre-wrap; overflow-wrap: anywhere; }
      button { border: 1px solid #a55; border-radius: 4px; padding: 4px 9px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
      button:hover { background: #432; }
    `;

    const panel = doc.createElement("section");
    panel.setAttribute("role", "alert");

    const header = doc.createElement("header");
    const heading = doc.createElement("h1");
    heading.textContent = "FynApp failed to start";
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", removeOverlay, { once: true });
    header.append(heading, dismiss);

    const identity = doc.createElement("div");
    identity.className = "identity";
    identity.textContent = `${name}${version}`;

    const message = doc.createElement("p");
    message.className = "message";
    message.textContent = failure.message;

    panel.append(header, identity, message);
    if (failure.stack) {
      const stack = doc.createElement("pre");
      stack.textContent = failure.stack;
      panel.append(stack);
    }

    shadow.append(style, panel);
    overlayHost = host;
    (doc.body ?? doc.documentElement).append(host);
  };

  events.addEventListener("FYNAPP_BOOTSTRAP_FAILED", handleFailure);

  return () => {
    events.removeEventListener("FYNAPP_BOOTSTRAP_FAILED", handleFailure);
    removeOverlay();
  };
}
