import { useEffect, useRef, useState } from "preact/hooks";
import { density, dock, persist, snapshot, theme, type Dock, type Theme } from "../state.js";
import type { Density } from "../metrics.js";
import { reflowFloat } from "./Resize.js";
import { Icons } from "./atoms.jsx";

/**
 * True when the settings menu owns this keystroke, and the panel should not
 * act on it.
 *
 * Only an *open* menu owns anything. Closing it hands focus to its trigger,
 * and the trigger lives inside the same `<details>` -- so a closed menu that
 * still claimed the keys passing through it would swallow the very next
 * Escape, and the panel could not be closed from the keyboard once the menu
 * had been. Escape on an open menu is consumed (closed, focus returned);
 * every other key inside an open menu is left to its control.
 */
export function handleSettingsKey(
  event: KeyboardEvent,
  path: EventTarget[],
  panel: HTMLElement
): boolean {
  const menu = panel.querySelector?.<HTMLDetailsElement>("[data-inspector-settings]");
  if (!menu?.open) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    menu.open = false;
    menu.querySelector("summary")?.focus();
    return true;
  }
  return path.includes(menu);
}

export function SettingsMenu() {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    const menu = menuRef.current;
    const dismissOutside = (event: Event) => {
      if (menu?.open && !event.composedPath().includes(menu)) menu.open = false;
    };
    // Focus events carry a relatedTarget, and the DOM trims their path at the
    // common ancestor of the two -- so tabbing from the popover to another
    // control in the panel never reaches `document`, which sits outside the
    // panel's shadow root. The menu is on that path either way, so it is where
    // a Tab out of the popover has to be caught. Focus moving *within* the
    // menu is trimmed below it and leaves the menu open, as does focus
    // leaving the page entirely (a null relatedTarget).
    const dismissBlur = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (menu?.open && next && !menu.contains(next)) menu.open = false;
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    menu?.addEventListener("focusout", dismissBlur);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
      menu?.removeEventListener("focusout", dismissBlur);
    };
  }, []);

  const copySnapshot = async () => {
    setCopying(true);
    setCopyStatus("Copying snapshot…");
    const current = snapshot.value;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(JSON.stringify(current, null, 2));
      setCopyStatus("Snapshot copied to clipboard.");
    } catch {
      console.log("[federation-inspector] snapshot:", current);
      setCopyStatus("Clipboard unavailable. Snapshot logged to console instead.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <details class="settings-menu" data-inspector-settings ref={menuRef}>
      <summary
        class="iconbtn settings-trigger"
        title="Theme, text size, dock and copy"
        aria-label="Settings"
      >
        {Icons.settings}
        <span>Settings</span>
      </summary>
      <div class="settings-popover" role="group" aria-label="Inspector settings">
        <label class="settings-field">
          <span>Theme</span>
          <select value={theme.value} onChange={(event) => {
            theme.value = event.currentTarget.value as Theme;
            persist();
          }}>
            <option value="auto">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label class="settings-field">
          <span>Text size</span>
          <select value={density.value} onChange={(event) => {
            density.value = event.currentTarget.value as Density;
            persist();
          }}>
            <option value="compact">Compact</option>
            <option value="normal">Normal</option>
            <option value="relaxed">Large</option>
          </select>
        </label>
        <label class="settings-field">
          <span>Dock</span>
          <select value={dock.value} onChange={(event) => {
            dock.value = event.currentTarget.value as Dock;
            // `size` means width when docked right and height when docked
            // bottom, so the same number has to be re-clamped against the
            // other axis -- a 760px-wide panel became a 760px-tall one on a
            // laptop.
            reflowFloat();
            persist();
          }}>
            <option value="dock-right">Right</option>
            <option value="dock-bottom">Bottom</option>
            <option value="float">Floating</option>
            <option value="full">Fullscreen</option>
          </select>
        </label>
        <button
          type="button"
          class="settings-copy"
          title="Copy the snapshot as JSON"
          disabled={copying}
          onClick={copySnapshot}
        >
          Copy snapshot
        </button>
        <div class="settings-status" role="status">{copyStatus}</div>
      </div>
    </details>
  );
}
