import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VNode } from "preact";
import { handleSettingsKey, SettingsMenu } from "../src/ui/components/SettingsMenu.js";
import { density, dock, snapshot, theme } from "../src/ui/state.js";

const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, updates: [] as unknown[] }));
vi.mock("preact/hooks", () => ({
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useState: (initial: unknown) => [initial, (value: unknown) => hooks.updates.push(value)],
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("../src/ui/components/Resize.js", () => ({ reflowFloat: vi.fn() }));

function descendants(node: VNode): VNode[] {
  const children = [node.props.children].flat(Infinity).filter((child): child is VNode =>
    !!child && typeof child === "object" && "type" in child);
  return [node, ...children.flatMap(descendants)];
}

describe("settings menu (FYM-379)", () => {
  beforeEach(() => {
    hooks.effects = [];
    hooks.updates = [];
    theme.value = "auto";
    density.value = "normal";
    dock.value = "dock-right";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers labeled preferences and every dock mode without width restrictions, saving choices", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    const root = SettingsMenu();
    const nodes = descendants(root);
    const labels = nodes.filter((node) => node.type === "label");
    expect(labels.map((label) => (label.props.children as VNode[])[0].props.children))
      .toEqual(["Theme", "Text size", "Dock"]);
    expect(nodes.some((node) => node.props.class?.includes("hide-sm"))).toBe(false);
    const selects = nodes.filter((node) => node.type === "select");
    expect((selects[2].props.children as VNode[]).map((option) => option.props.value))
      .toEqual(["dock-right", "dock-bottom", "float", "full"]);
    ["dark", "relaxed", "full"].forEach((value, index) =>
      selects[index].props.onChange({ currentTarget: { value } }));
    expect([theme.value, density.value, dock.value]).toEqual(["dark", "relaxed", "full"]);
    expect(setItem).toHaveBeenCalledTimes(3);
    expect(JSON.parse(setItem.mock.calls[2][1])).toMatchObject({ theme: "dark", density: "relaxed", dock: "full" });
  });

  it("Escape closes settings and restores its trigger; other keys retain native behavior", () => {
    const focus = vi.fn();
    const menu = { open: true, querySelector: () => ({ focus }) };
    const panel = { querySelector: () => menu } as unknown as HTMLElement;
    const inMenu = [menu as unknown as EventTarget];
    const arrow = { key: "ArrowDown", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    expect(handleSettingsKey(arrow, inMenu, panel)).toBe(true);
    expect(arrow.preventDefault).not.toHaveBeenCalled();
    expect(handleSettingsKey(arrow, [], panel)).toBe(false);

    const event = { key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    expect(handleSettingsKey(event, inMenu, panel)).toBe(true);
    expect(menu.open).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("a closed menu owns nothing, even with its trigger focused", () => {
    // Escape hands focus to the summary, which is inside the <details>: the
    // next Escape (and every other key) must fall through to the panel
    const menu = { open: false, querySelector: () => ({ focus: vi.fn() }) };
    const panel = { querySelector: () => menu } as unknown as HTMLElement;
    const summary = {} as EventTarget;
    for (const key of ["Escape", "ArrowDown", "]"]) {
      const event = { key, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      expect(handleSettingsKey(event, [summary, menu as unknown as EventTarget], panel)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(menu.open).toBe(false);
  });

  it("dismisses on outside pointer and focus events, respecting shadow composed paths", () => {
    const listeners = new Map<string, (event: Event) => void>();
    const menuListeners = new Map<string, (event: Event) => void>();
    const removeEventListener = vi.fn();
    const menuRemove = vi.fn();
    vi.stubGlobal("document", { addEventListener: (name: string, listener: (event: Event) => void) => listeners.set(name, listener), removeEventListener });
    const root = SettingsMenu();
    const inside = {} as Node;
    const menu = {
      open: true,
      contains: (node: Node) => node === inside,
      addEventListener: (name: string, listener: (event: Event) => void) => menuListeners.set(name, listener),
      removeEventListener: menuRemove,
    };
    (root.ref as { current: unknown }).current = menu;
    const cleanup = hooks.effects[0]();
    for (const name of ["pointerdown", "focusin"]) {
      menu.open = true;
      listeners.get(name)!({ composedPath: () => [menu] } as unknown as Event);
      expect(menu.open).toBe(true);
      listeners.get(name)!({ composedPath: () => [] } as unknown as Event);
      expect(menu.open).toBe(false);
    }

    // Tabbing out stays inside the shadow root, so `document` never hears it:
    // only the menu's own focusout sees focus land on a control outside it
    const focusout = menuListeners.get("focusout")!;
    menu.open = true;
    focusout({ relatedTarget: inside } as unknown as Event);
    expect(menu.open).toBe(true);
    focusout({ relatedTarget: null } as unknown as Event);
    expect(menu.open).toBe(true);
    focusout({ relatedTarget: {} as Node } as unknown as Event);
    expect(menu.open).toBe(false);

    cleanup!();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
    expect(menuRemove).toHaveBeenCalledOnce();
  });

  it.each(["success", "rejection", "missing", "throw"])("reports clipboard %s visibly", async (outcome) => {
    const writeText = vi.fn(() => {
      if (outcome === "throw") throw new Error("Permission denied");
      return outcome === "rejection" ? Promise.reject(new Error("Denied")) : Promise.resolve();
    });
    vi.stubGlobal("navigator", { clipboard: outcome === "missing" ? undefined : { writeText } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const button = descendants(SettingsMenu()).find((node) => node.type === "button")!;
    await button.props.onClick();
    expect(hooks.updates).toContain("Copying snapshot…");
    expect(hooks.updates).toContain(outcome === "success"
      ? "Snapshot copied to clipboard."
      : "Clipboard unavailable. Snapshot logged to console instead.");
    expect(hooks.updates.at(-1)).toBe(false);
    if (outcome === "success") expect(writeText).toHaveBeenCalledWith(JSON.stringify(snapshot.value, null, 2));
    else expect(log).toHaveBeenCalledWith("[federation-inspector] snapshot:", snapshot.value);
    log.mockRestore();
  });
});
