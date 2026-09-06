import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VNode } from "preact";
import { App, type AppProps } from "../src/ui/App.js";
import { expanded, open, query, selected, view, viewport } from "../src/ui/state.js";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("preact/hooks", () => ({
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useLayoutEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
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

type KeyListener = (event: KeyboardEvent) => void;

/**
 * Mount the shell around `panel`: run the App effects so the document capture
 * listener is installed, render the overlay far enough to hand it the panel
 * element, and return a way to press keys through the real listener.
 */
function mountShell(panel: HTMLElement) {
  let onKey!: KeyListener;
  const cleanups: Array<() => void> = [];
  const onClose = vi.fn();
  hooks.effects = [];
  vi.stubGlobal("document", {
    addEventListener: (name: string, listener: KeyListener) => {
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
    onClose,
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

  return {
    onClose,
    press(key: string, targets: EventTarget[], overrides: Partial<KeyboardEvent> = {}) {
      const event = {
        key,
        target: element("INSPECTOR-HOST"),
        composedPath: () => [...targets, panel, document],
        preventDefault: vi.fn(),
        ...overrides,
      } as unknown as KeyboardEvent;
      onKey(event);
      return event;
    },
    unmount() {
      setPanel(null);
      cleanups.forEach((cleanup) => cleanup());
      vi.unstubAllGlobals();
    },
  };
}

function resetPanelState(): void {
  open.value = true;
  query.value = "";
  view.value = "modules";
  selected.value = "module-a";
  expanded.value = new Set();
  viewport.value = { w: 1200, h: 900 };
}

describe("panel Enter handling (FYM-377)", () => {
  const panel = element("DIV");
  let shell: ReturnType<typeof mountShell>;

  beforeEach(() => {
    resetPanelState();
    shell = mountShell(panel);
  });

  afterEach(() => {
    shell.unmount();
    open.value = false;
    selected.value = undefined;
    expanded.value = new Set();
  });

  const enter = (targets: HTMLElement[], overrides: Partial<KeyboardEvent> = {}) =>
    shell.press("Enter", targets, overrides);

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

describe("settings menu keys (FYM-379)", () => {
  const focus = vi.fn();
  // the <details> the panel finds by its data attribute; `open` is the
  // browser's own reflection of the menu being shown
  const menu = { open: false, querySelector: () => ({ focus }) } as unknown as HTMLElement & {
    open: boolean;
  };
  const panel = {
    ...element("DIV"),
    querySelector: (selector: string) => (selector === "[data-inspector-settings]" ? menu : null),
  } as unknown as HTMLElement;
  let shell: ReturnType<typeof mountShell>;

  beforeEach(() => {
    resetPanelState();
    menu.open = false;
    focus.mockClear();
    shell = mountShell(panel);
  });

  afterEach(() => {
    shell.unmount();
    open.value = false;
    selected.value = undefined;
  });

  it("Escape closes an open menu, returns focus to its trigger, and leaves the panel open", () => {
    menu.open = true;
    const event = shell.press("Escape", [element("BUTTON"), menu]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(menu.open).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
    expect(open.value).toBe(true);
    expect(shell.onClose).not.toHaveBeenCalled();
  });

  it("a second Escape, with focus left on the closed menu's trigger, closes the panel", () => {
    // the sequence the browser check caught: Escape closes the menu and
    // focuses its summary, which sits inside the <details>; the next Escape
    // must reach the panel rather than be swallowed by a menu that is shut
    menu.open = true;
    shell.press("Escape", [element("BUTTON"), menu]);
    expect(menu.open).toBe(false);
    expect(open.value).toBe(true);
    const again = shell.press("Escape", [element("SUMMARY"), menu]);
    expect(again.preventDefault).not.toHaveBeenCalled();
    expect(open.value).toBe(false);
    expect(shell.onClose).toHaveBeenCalledOnce();
  });

  it("Escape with the menu closed still closes the panel, without preventDefault", () => {
    const event = shell.press("Escape", [element("BUTTON")]);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(open.value).toBe(false);
    expect(shell.onClose).toHaveBeenCalledOnce();
  });

  it("leaves every other key inside the open menu to its control", () => {
    menu.open = true;
    const arrow = shell.press("ArrowDown", [element("BUTTON"), menu]);
    expect(arrow.preventDefault).not.toHaveBeenCalled();
    const bracket = shell.press("]", [element("BUTTON"), menu]);
    expect(bracket.preventDefault).not.toHaveBeenCalled();
    expect(view.value).toBe("modules");
  });

  it("keys outside the menu still belong to the panel", () => {
    const event = shell.press("]", [element("DIV", { role: "row" })]);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(view.value).not.toBe("modules");
  });
});
