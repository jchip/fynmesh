import { describe, expect, it } from "vitest";
import { revealActiveTab } from "../src/ui/components/TabStrip.js";

function strip(left: number, right: number, scrollLeft = 0) {
  return {
    scrollLeft,
    scrollWidth: 900,
    clientWidth: 300,
    getBoundingClientRect: () => ({ left: 100, right: 400 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ left, right }) }),
  } as unknown as HTMLElement;
}

describe("active tab visibility (FYM-378)", () => {
  it("reveals a wholly clipped tab to the right", () => {
    const el = strip(540, 620);
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(220);
  });

  it("reveals a partially clipped tab after a panel resize", () => {
    const el = strip(380, 460, 50);
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(110);
  });

  it("reveals a tab to the left after back navigation", () => {
    const el = strip(20, 90, 200);
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(120);
  });

  it("leaves an already visible tab in place", () => {
    const el = strip(120, 240, 100);
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(100);
  });

  it("clamps to the available scroll range", () => {
    const el = strip(500, 600, 550);
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(600);
  });

  it("tolerates capability changes with no selected tab", () => {
    const el = strip(0, 0, 100);
    el.querySelector = () => null;
    revealActiveTab(el);
    expect(el.scrollLeft).toBe(100);
  });
});
