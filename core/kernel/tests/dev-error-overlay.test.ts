import { afterEach, describe, expect, it } from "vitest";
import { installDevErrorOverlay } from "../src/dev-error-overlay";

const OVERLAY_SELECTOR = "[data-fynmesh-error-overlay]";

function emitBootstrapFailure(events: EventTarget, detail: Record<string, unknown>): void {
  events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAP_FAILED", { detail }));
}

function getOverlayText(): string {
  const host = document.querySelector<HTMLElement>(OVERLAY_SELECTOR);
  return host?.shadowRoot?.textContent ?? "";
}

describe("development error overlay", () => {
  afterEach(() => {
    document.querySelector(OVERLAY_SELECTOR)?.remove();
  });

  it("renders the failed FynApp identity, message, and stack", () => {
    const events = new EventTarget();
    installDevErrorOverlay(events);

    const error = new Error("render exploded");
    error.stack = "Error: render exploded\n    at main.ts:12:3";
    emitBootstrapFailure(events, { name: "checkout", version: "2.4.0", error });

    expect(getOverlayText()).toContain("checkout@2.4.0");
    expect(getOverlayText()).toContain("render exploded");
    expect(getOverlayText()).toContain("main.ts:12:3");
  });

  it("renders non-Error failures safely as text", () => {
    const events = new EventTarget();
    installDevErrorOverlay(events);

    emitBootstrapFailure(events, {
      name: "profile",
      version: "1.0.0",
      error: { message: "bad <script>alert(1)</script>" },
    });

    const host = document.querySelector<HTMLElement>(OVERLAY_SELECTOR);
    expect(getOverlayText()).toContain("bad <script>alert(1)</script>");
    expect(host?.shadowRoot?.querySelector("script")).toBeNull();
  });

  it("replaces the previous failure and can be dismissed", () => {
    const events = new EventTarget();
    installDevErrorOverlay(events);

    emitBootstrapFailure(events, { name: "first", version: "1.0.0", error: "first failure" });
    emitBootstrapFailure(events, { name: "second", version: "2.0.0", error: "second failure" });

    expect(document.querySelectorAll(OVERLAY_SELECTOR)).toHaveLength(1);
    expect(getOverlayText()).not.toContain("first failure");
    expect(getOverlayText()).toContain("second failure");

    const host = document.querySelector<HTMLElement>(OVERLAY_SELECTOR);
    host?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
    expect(document.querySelector(OVERLAY_SELECTOR)).toBeNull();
  });

  it("disposal removes the overlay and stops listening", () => {
    const events = new EventTarget();
    const dispose = installDevErrorOverlay(events);

    emitBootstrapFailure(events, { name: "before", error: new Error("before disposal") });
    expect(document.querySelector(OVERLAY_SELECTOR)).not.toBeNull();

    dispose();
    expect(document.querySelector(OVERLAY_SELECTOR)).toBeNull();

    emitBootstrapFailure(events, { name: "after", error: new Error("after disposal") });
    expect(document.querySelector(OVERLAY_SELECTOR)).toBeNull();
  });
});
