import type { ComponentChildren, JSX } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ViewName } from "../../core/model.js";
import { Icons } from "./atoms.jsx";

interface Tab {
  id: ViewName;
  label: string;
  count?: ComponentChildren;
}

/** Reveal just the tab strip; scrollIntoView would also scroll the host page. */
export function revealActiveTab(strip: HTMLElement): void {
  const active = strip.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!active) return;
  const bounds = strip.getBoundingClientRect();
  const tab = active.getBoundingClientRect();
  const delta = tab.left < bounds.left ? tab.left - bounds.left
    : tab.right > bounds.right ? tab.right - bounds.right : 0;
  strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + delta));
}

export function TabStrip({ tabs, active, onSelect }: {
  tabs: Tab[];
  active: ViewName;
  onSelect: (id: ViewName) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;
    setEdges((prev) => prev.left === left && prev.right === right ? prev : { left, right });
  };
  const reveal = () => {
    if (ref.current) revealActiveTab(ref.current);
    measure();
  };
  // Reconnect when capability-dependent tabs appear. ResizeObserver also sees
  // count, density and dock changes, without snapping back on manual scrolling.
  const ids = tabs.map((tab) => tab.id).join(",");
  useLayoutEffect(() => {
    reveal();
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reveal);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [ids]);
  useLayoutEffect(reveal, [active]);

  const scroll = (direction: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft += direction * Math.max(80, el.clientWidth * 0.8);
    measure();
  };
  const overflow = edges.left || edges.right;
  return (
    <div class="tab-row">
      {overflow ? <button class="iconbtn tab-scroll" title="Scroll tabs left" aria-label="Scroll tabs left"
        disabled={!edges.left} onClick={() => scroll(-1)}>{Icons.back}</button> : null}
      <div class="tabs" role="tablist" aria-label="Inspector views" ref={ref} onScroll={measure}>
        {tabs.map((tab, index) => (
          <button key={tab.id} class="tab" role="tab" aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1} onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => {
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              onSelect(tabs[next].id);
              (ref.current?.children[next] as HTMLElement | undefined)?.focus();
            }}>
            {tab.label}{tab.count}
          </button>
        ))}
      </div>
      {overflow ? <button class="iconbtn tab-scroll" title="Scroll tabs right" aria-label="Scroll tabs right"
        disabled={!edges.right} onClick={() => scroll(1)}>{Icons.forward}</button> : null}
    </div>
  );
}
