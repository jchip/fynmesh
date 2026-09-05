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
