import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "@preact/signals";
import type { ViewName } from "../src/core/model.js";
import { sanitise } from "../src/ui/state.js";

describe("tab filters", () => {
  let state: typeof import("../src/ui/state.js");

  beforeEach(async () => {
    vi.resetModules();
    state = await import("../src/ui/state.js");
  });

  it("remembers an independent filter for every tab", () => {
    const tabs: ViewName[] = [
      "modules", "fynapps", "middleware", "containers", "shares", "graph", "issues", "raw",
    ];
    for (const tab of tabs) {
      state.view.value = tab;
      expect(state.query.value).toBe("");
      state.query.value = `filter for ${tab}`;
    }
    for (const tab of tabs) {
      state.view.value = tab;
      expect(state.query.value).toBe(`filter for ${tab}`);
    }
  });

  it("keeps the Issues filter when a diagnostic opens Shares", () => {
    state.view.value = "issues";
    state.query.value = "esm-react";
    state.focusOn("shares", "share:esm-react");
    expect(state.view.value).toBe("shares");
    expect(state.query.value).toBe("share:esm-react");
    state.view.value = "issues";
    expect(state.query.value).toBe("esm-react");
    state.view.value = "shares";
    state.query.value = "";
    state.view.value = "issues";
    expect(state.query.value).toBe("esm-react");
  });

  it("uses the destination's remembered filter when navigation supplies none", () => {
    state.view.value = "shares";
    state.query.value = "react";
    state.view.value = "modules";
    state.query.value = "stage:errored";
    state.focusOn("shares");
    expect(state.query.value).toBe("react");
  });

  it("restores navigation history without replacing other tabs' filters", () => {
    state.view.value = "issues";
    state.query.value = "react";
    state.focusOn("shares", "share:esm-react");
    state.goBack();
    expect(state.view.value).toBe("issues");
    expect(state.query.value).toBe("react");
    state.goForward();
    expect(state.view.value).toBe("shares");
    expect(state.query.value).toBe("share:esm-react");
    state.focusOn("shares", "share:esm-react-dom");
    state.goBack();
    expect(state.query.value).toBe("share:esm-react");
    state.view.value = "issues";
    expect(state.query.value).toBe("react");
  });

  it("reacts to tab switches and edits to the current filter", () => {
    const currentFilter = computed(() => state.query.value);
    state.query.value = "stage:errored";
    expect(currentFilter.value).toBe("stage:errored");
    state.view.value = "issues";
    expect(currentFilter.value).toBe("");
    state.query.value = "react";
    expect(currentFilter.value).toBe("react");
    state.view.value = "modules";
    expect(currentFilter.value).toBe("stage:errored");
  });
});

/*
 * localStorage is shared with every other script on the origin and outlives
 * every version of this tool, so what comes back from it is untrusted input.
 */
describe("persisted ui state", () => {
  it("keeps a well-formed record", () => {
    const saved = {
      dock: "float",
      theme: "dark",
      density: "compact",
      size: 820,
      float: { x: 10, y: 20, w: 900, h: 600 },
    };
    expect(sanitise(saved)).toEqual(saved);
  });

  it("drops values this build does not understand", () => {
    expect(sanitise({ dock: "dock-left", theme: "solarized", density: "tiny" })).toEqual({});
  });

  it("drops sizes that would break the layout maths", () => {
    expect(sanitise({ size: "760" })).toEqual({});
    expect(sanitise({ size: Number.NaN })).toEqual({});
    expect(sanitise({ size: Number.POSITIVE_INFINITY })).toEqual({});
    expect(sanitise({ size: -5 })).toEqual({});
  });

  // a well-formed number is not enough: below the smaller of Resize.tsx's
  // MIN_W/MIN_H (240, its dock-bottom height floor) no viewport could ever
  // have produced this value, so it is rejected rather than repaired.
  it("drops a well-formed size no viewport could justify", () => {
    expect(sanitise({ size: 6 })).toEqual({});
    expect(sanitise({ size: 0 })).toEqual({});
    expect(sanitise({ size: 239 })).toEqual({});
  });

  it("keeps a size at or above the floor, even if too small for one axis", () => {
    expect(sanitise({ size: 240 })).toEqual({ size: 240 });
    // too small for dock-right's 360 width floor, but a legitimate
    // dock-bottom height -- sanitise can't tell which axis it was for
    expect(sanitise({ size: 300 })).toEqual({ size: 300 });
  });

  it("takes a float rect only when every side is a number", () => {
    expect(sanitise({ float: { x: 0, y: 0, w: 900 } })).toEqual({});
    expect(sanitise({ float: null })).toEqual({});
    expect(sanitise({ float: { x: 0, y: 0, w: 900, h: "600" } })).toEqual({});
  });

  it("survives anything at all", () => {
    expect(sanitise(null)).toEqual({});
    expect(sanitise("federation-inspector")).toEqual({});
    expect(sanitise([1, 2, 3])).toEqual({});
    // one bad field does not lose the good ones
    expect(sanitise({ dock: "full", size: "wide" })).toEqual({ dock: "full" });
  });
});
