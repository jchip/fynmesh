import { describe, expect, it } from "vitest";
import { sanitise } from "../src/ui/state.js";

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
