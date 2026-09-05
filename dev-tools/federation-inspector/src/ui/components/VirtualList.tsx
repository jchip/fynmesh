/**
 * Windowed list rendering, with variable row heights.
 *
 * A real federated page carries a few thousand load records and the Modules
 * view is the one people scroll, so rendering every row costs a DOM node per
 * module and makes the 500ms live refresh visibly janky. Only the rows in (and
 * just outside) the viewport are rendered; the rest is height, not DOM.
 *
 * Rows are *not* uniform, because expanding one in place is the core
 * interaction of this tool -- you compare a module against the list it sits
 * in, which a modal or a second pane would hide. So heights come from a
 * callback, an expanded row's real height is measured once it renders, and the
 * offsets are a prefix sum rebuilt only when a height actually changes.
 *
 * The prefix sum is O(n) over a few thousand numbers, which is fast enough to
 * do on any change and far simpler than maintaining an incremental structure.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

export interface VirtualListProps<T> {
  items: T[];
  /** height of a collapsed row */
  rowHeight: number;
  /** stable identity, used to key measured heights */
  keyOf: (item: T) => string;
  /** extra height beyond `rowHeight`; return 0 for a plain row */
  extraHeight?: (item: T, measured: number | undefined) => number;
  /**
   * Changes when `extraHeight` would return something different.
   *
   * The offsets memo cannot depend on `extraHeight` itself: it is an inline
   * closure, so its identity changes on every render, and scrolling renders --
   * which meant the O(n) prefix sum was rebuilt on every scroll frame. Pass the
   * thing the closure actually reads (the expanded-row set) instead.
   */
  heightsKey?: unknown;
  /** rows rendered beyond each edge of the viewport */
  overscan?: number;
  renderRow: (item: T, index: number, measureRef: (el: HTMLElement | null) => void) => JSX.Element;
  /** scroll this index into view when it changes */
  scrollTo?: number;
  class?: string;
  /** rendered above the rows, inside the scroll container */
  header?: JSX.Element;
  empty?: JSX.Element;
}

export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  const { items, rowHeight, overscan = 8 } = props;

  const scroller = useRef<HTMLDivElement>(null);
  const measured = useRef(new Map<string, number>());
  const [, forceRender] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });

  /**
   * Offsets for every row, plus the total.
   *
   * Recomputed whenever the item list or a measurement changes. `measureTick`
   * is the dependency that carries "a height was measured" -- the map itself
   * is a ref, so mutating it cannot be a dependency.
   */
  const measureTick = useRef(0);
  const layout = useMemo(() => {
    const offsets = new Float64Array(items.length + 1);
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      offsets[i] = acc;
      const key = props.keyOf(items[i]);
      const extra = props.extraHeight
        ? props.extraHeight(items[i], measured.current.get(key))
        : 0;
      acc += rowHeight + extra;
    }
    offsets[items.length] = acc;
    return { offsets, total: acc };
  }, [items, rowHeight, measureTick.current, props.heightsKey]);

  /** last index whose offset is <= y */
  const indexAt = (y: number): number => {
    const { offsets } = layout;
    let lo = 0;
    let hi = items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= y) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };

  const readViewport = () => {
    const el = scroller.current;
    if (!el) {
      return;
    }
    setViewport({ top: el.scrollTop, height: el.clientHeight });
  };

  useEffect(() => {
    readViewport();
    const el = scroller.current;
    if (!el) {
      return;
    }
    // ResizeObserver rather than a window listener: the panel resizes
    // independently of the window, and a window listener misses that drag.
    const ro = new ResizeObserver(readViewport);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || props.scrollTo === undefined || props.scrollTo < 0 || !items.length) {
      return;
    }
    const i = Math.min(props.scrollTo, items.length - 1);
    const top = layout.offsets[i];
    const bottom = layout.offsets[i + 1];
    if (top < el.scrollTop || bottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }
  }, [props.scrollTo, items.length]);

  /**
   * Record a rendered row's real height.
   *
   * Only heights that differ from the prediction trigger a re-layout, so a
   * plain row -- which is every row until something is expanded -- costs one
   * comparison and nothing else.
   */
  const measure = (key: string) => (el: HTMLElement | null) => {
    if (!el) {
      return;
    }
    const h = el.offsetHeight;
    if (h > 0 && measured.current.get(key) !== h) {
      measured.current.set(key, h);
      measureTick.current++;
      forceRender((n) => n + 1);
    }
  };

  const slice: JSX.Element[] = [];
  let startIndex = 0;
  if (items.length) {
    startIndex = Math.max(0, indexAt(Math.max(0, viewport.top - overscan * rowHeight)));
    const limit = viewport.top + viewport.height + overscan * rowHeight;
    for (let i = startIndex; i < items.length; i++) {
      if (layout.offsets[i] > limit) {
        break;
      }
      const item = items[i];
      slice.push(props.renderRow(item, i, measure(props.keyOf(item))));
    }
  }

  return (
    <div class={"scroll " + (props.class ?? "")} ref={scroller} onScroll={readViewport}>
      {props.header}
      {items.length === 0 ? (
        props.empty ?? null
      ) : (
        <div class="rows" style={{ height: layout.total + "px" }}>
          <div style={{ transform: `translateY(${layout.offsets[startIndex]}px)` }}>
            {slice}
          </div>
        </div>
      )}
    </div>
  );
}
