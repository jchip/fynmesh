import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VNode } from "preact";
import { App, type AppProps } from "../src/ui/App.js";
import { expanded, open, query, selected, viewport } from "../src/ui/state.js";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("preact/hooks", () => ({
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (current: unknown) => ({ current }),
}));

// Node tests mount only the shell hooks and panel ref. Dispatch through the
// actual document capture listener, including shadow-DOM event retargeting.
function element(tagName: string, attributes: Record<string, string> = {}): HTMLElement {
  return {
    tagName,
    hasAttribute: (name: string) => name in attributes,
    getAttribute: (name: string) => attributes[name] ?? null,
  } as unknown as HTMLElement;
}

describe("panel Enter handling (FYM-377)", () => {
  const panel = element("DIV");
  let onKey: (event: KeyboardEvent) => void;
  let clearPanel: () => void;
  let cleanups: Array<() => void>;

  beforeEach(() => {
    hooks.effects = [];
    cleanups = [];
    open.value = true;
    query.value = "";
    selected.value = "module-a";
    expanded.value = new Set();
    viewport.value = { w: 1200, h: 900 };
    vi.stubGlobal("document", {
      addEventListener: (name: string, listener: typeof onKey) => {
        if (name === "keydown") onKey = listener;
      },
      removeEventListener: vi.fn(),
    });
    const props: AppProps = {
      adapter: {
        current: () => new Promise(() => {}),
        subscribe: () => () => {},
        setLive: vi.fn(),
      } as unknown as AppProps["adapter"],
      corner: "bottom-right",
      showLauncher: false,
      hotkey: false,
    };
    const root = App(props);
    for (const effect of hooks.effects) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    const overlay = (root.props.children as VNode[])[1];
    const renderOverlay = overlay.type as (props: unknown) => VNode;
    const overlayNode = renderOverlay(overlay.props);
    const setPanel = overlayNode.ref as (element: HTMLElement | null) => void;
    setPanel(panel);
    clearPanel = () => setPanel(null);
  });

  afterEach(() => {
    clearPanel();
    cleanups.forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
    open.value = false;
    selected.value = null;
    expanded.value = new Set();
  });

  function enter(targets: HTMLElement[], overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      key: "Enter",
      target: element("INSPECTOR-HOST"),
      composedPath: () => [...targets, panel, document],
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    onKey(event);
    return event;
  }

  it.each([
    ["Close", element("BUTTON")],
    ["tab", element("BUTTON", { role: "tab" })],
    ["link", element("A", { href: "https://example.test/module.js" })],
    ["summary", element("SUMMARY")],
    ["custom button", element("DIV", { role: "button" })],
  ])("preserves Enter for a focused %s with a selected module", (_label, control) => {
    expect(enter([control]).preventDefault).not.toHaveBeenCalled();
    expect(expanded.value.size).toBe(0);
  });

  it("recognizes a control ancestor in the composed path", () => {
    const event = enter([element("svg"), element("BUTTON")]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(expanded.value.size).toBe(0);
  });

  it("still expands and collapses the selected row with Enter", () => {
    const row = element("DIV", { role: "row" });
    expect(enter([row]).preventDefault).toHaveBeenCalledOnce();
    expect(expanded.value.has("module-a")).toBe(true);
    expect(enter([row]).preventDefault).toHaveBeenCalledOnce();
    expect(expanded.value.has("module-a")).toBe(false);
  });

  it("leaves modified Enter and editable fields untouched", () => {
    expect(enter([element("DIV")], { shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(enter([element("INPUT")]).preventDefault).not.toHaveBeenCalled();
    expect(expanded.value.size).toBe(0);
  });

  it("does not intercept Enter outside the panel", () => {
    const event = enter([], { composedPath: () => [element("BUTTON"), document] });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(expanded.value.size).toBe(0);
  });
});
