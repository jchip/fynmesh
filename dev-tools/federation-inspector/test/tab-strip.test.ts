import { describe, expect, it, vi } from "vitest";
import type { VNode } from "preact";
import { revealActiveTab, TabStrip } from "../src/ui/components/TabStrip.js";

const hooks = vi.hoisted(() => ({
  layout: [] as Array<{ effect: () => void | (() => void); deps: unknown[] | undefined }>,
  ref: { current: null as unknown },
  edges: { left: false, right: false },
}));
vi.mock("preact/hooks", () => ({
  useLayoutEffect: (effect: () => void | (() => void), deps?: unknown[]) =>
    hooks.layout.push({ effect, deps }),
  useState: () => [hooks.edges, vi.fn()],
  useRef: () => hooks.ref,
}));

function strip(left: number, right: number, scrollLeft = 0) {
  return {
    scrollLeft,
    scrollWidth: 900,
    clientWidth: 300,
    children: [],
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

const TABS = [
  { id: "modules" as const, label: "Modules" },
  { id: "shares" as const, label: "Shares" },
  { id: "issues" as const, label: "Issues" },
];

function render(active: "modules" | "shares" | "issues", edges = { left: false, right: false }) {
  hooks.layout = [];
  hooks.edges = edges;
  const onSelect = vi.fn();
  const root = TabStrip({ tabs: TABS, active, onSelect });
  const [before, list, after] = root.props.children as [VNode | null, VNode, VNode | null];
  const tabs = list.props.children as VNode[];
  return { root, before, list, after, tabs, onSelect };
}

describe("tab strip (FYM-378)", () => {
  it("reveals the active tab whenever the view changes, not only on mount", () => {
    render("issues");
    const onActive = hooks.layout.find((entry) => entry.deps?.[0] === "issues");
    expect(onActive).toBeDefined();
    // the view changed while the strip is scrolled to the start and Issues is
    // clipped off its right edge -- the API, history and `]` all land here
    const el = strip(540, 620);
    hooks.ref.current = el;
    onActive!.effect();
    expect(el.scrollLeft).toBe(220);
  });

  it("marks the active tab and gives only it a tab stop", () => {
    const { tabs } = render("shares");
    expect(tabs.map((tab) => tab.props["aria-selected"])).toEqual([false, true, false]);
    expect(tabs.map((tab) => tab.props.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("shows scroll controls only when tabs are out of view, disabled toward the edge already reached", () => {
    const none = render("modules");
    expect(none.before).toBeNull();
    expect(none.after).toBeNull();

    const right = render("modules", { left: false, right: true });
    expect(right.before?.props.disabled).toBe(true);
    expect(right.after?.props.disabled).toBe(false);
    expect(right.before?.props["aria-label"]).toBe("Scroll tabs left");
    expect(right.after?.props["aria-label"]).toBe("Scroll tabs right");
  });

  it("moves between tabs with the arrow keys, wrapping, and jumps with Home and End", () => {
    const { tabs, onSelect } = render("shares");
    hooks.ref.current = strip(0, 0);
    const press = (index: number, key: string, overrides: Record<string, unknown> = {}) => {
      const event = { key, preventDefault: vi.fn(), ...overrides };
      tabs[index].props.onKeyDown(event);
      return event;
    };

    expect(press(1, "ArrowRight").preventDefault).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenLastCalledWith("issues");
    press(2, "ArrowRight");
    expect(onSelect).toHaveBeenLastCalledWith("modules");
    press(0, "ArrowLeft");
    expect(onSelect).toHaveBeenLastCalledWith("issues");
    press(1, "Home");
    expect(onSelect).toHaveBeenLastCalledWith("modules");
    press(1, "End");
    expect(onSelect).toHaveBeenLastCalledWith("issues");
    expect(onSelect).toHaveBeenCalledTimes(5);
  });

  it("leaves chords and unrelated keys alone", () => {
    const { tabs, onSelect } = render("shares");
    const chord = { key: "ArrowRight", preventDefault: vi.fn(), metaKey: true };
    tabs[1].props.onKeyDown(chord);
    const other = { key: "Enter", preventDefault: vi.fn() };
    tabs[1].props.onKeyDown(other);
    expect(chord.preventDefault).not.toHaveBeenCalled();
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
