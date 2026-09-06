import { describe, expect, it } from "vitest";
import { overlayClass } from "../src/ui/App.js";
import type { Dock } from "../src/ui/state.js";

const DOCKS: Dock[] = ["dock-right", "dock-bottom", "float", "full"];

describe("overlay animation classes (FYM-384)", () => {
  it("sheds `opening` once the enter animation has ended", () => {
    // `opening` used to mean "not closing" and stayed on for the panel's whole
    // life; each dock names its own keyframes, so a dock change then swapped
    // the animation-name underneath it and replayed the enter slide-in
    for (const dock of DOCKS) {
      expect(overlayClass(dock, false, true)).toBe("overlay " + dock + " opening");
      expect(overlayClass(dock, false, false)).toBe("overlay " + dock);
    }
  });

  it("a panel on its way out is `closing`, whether or not its enter finished", () => {
    for (const entering of [true, false]) {
      expect(overlayClass("dock-right", true, entering)).toBe("overlay dock-right closing");
    }
  });
});
