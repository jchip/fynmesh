/**
 * A small, real SVG chart engine: scales, axes, line/area/bar/donut
 * generators, a legend with click-to-hide, gridlines, a hover tooltip +
 * crosshair model, and a ResizeObserver-backed responsive-sizing hook.
 * `./grid` builds the four dashboard charts out of these primitives; nothing
 * here is dashboard-specific.
 */
import React from "react";

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN: Margin = { top: 16, right: 16, bottom: 32, left: 48 };

/**
 * Tracks an element's content box with a ResizeObserver, falling back to a
 * single measurement (no live resize) when ResizeObserver is unavailable.
 */
export function useResizeObserver<T extends HTMLElement>(): [
  (node: T | null) => void,
  { width: number; height: number },
] {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const elementRef = React.useRef<T | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const setRef = React.useCallback((node: T | null) => {
    if (observerRef.current && elementRef.current) {
      observerRef.current.unobserve(elementRef.current);
    }
    elementRef.current = node;
    if (!node) return;

    if (typeof ResizeObserver === "undefined") {
      setSize({ width: node.clientWidth, height: node.clientHeight });
      return;
    }
    if (!observerRef.current) {
      observerRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const box = entry.contentBoxSize?.[0];
          if (box) {
            setSize({ width: box.inlineSize, height: box.blockSize });
          } else {
            setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
          }
        }
      });
    }
    observerRef.current.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
  }, []);

  React.useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return [setRef, size];
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export interface Scale {
  (value: number): number;
  invert(pixel: number): number;
  domain: [number, number];
  range: [number, number];
}

/** A "nice" step size for `count` ticks over `span` (1/2/5 * 10^n), à la D3. */
function niceStep(span: number, count: number): number {
  if (span <= 0 || count <= 0) return 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return step * magnitude;
}

/** Rounds a domain outward to whole ticks, so the axis never clips its own labels. */
export function niceLinearDomain(domain: [number, number], count = 5): [number, number] {
  const [lo, hi] = domain;
  if (lo === hi) return [lo - 1, hi + 1];
  const step = niceStep(hi - lo, count);
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export function linearTicks(domain: [number, number], count = 5): number[] {
  const [lo, hi] = domain;
  if (lo === hi) return [lo];
  const step = niceStep(hi - lo, count);
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}

/**
 * How many ticks fit an axis of this many pixels without crowding — an axis
 * that halves in width should show roughly half as many labels.
 */
export function tickCountForWidth(pixels: number, pixelsPerTick = 90): number {
  return Math.max(2, Math.min(10, Math.round(pixels / pixelsPerTick)));
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const fn = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  fn.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

/** A day-index domain, meant to be ticked and labeled through analytics-core's formatDate. */
export function timeScale(domain: [number, number], range: [number, number]): Scale {
  return linearScale(domain, range);
}

export interface BandScale {
  (key: string): number;
  bandwidth: number;
  domain: string[];
  range: [number, number];
}

export function bandScale(domain: string[], range: [number, number], padding = 0.2): BandScale {
  const [r0, r1] = range;
  const step = domain.length === 0 ? 0 : (r1 - r0) / domain.length;
  const bandwidth = step * (1 - padding);
  const offset = (step - bandwidth) / 2;
  const fn = ((key: string) => {
    const i = domain.indexOf(key);
    return i < 0 ? r0 : r0 + i * step + offset;
  }) as BandScale;
  fn.bandwidth = bandwidth;
  fn.domain = domain;
  fn.range = range;
  return fn;
}

// ---------------------------------------------------------------------------
// Line / area path generators (monotone cubic, Fritsch-Carlson)
// ---------------------------------------------------------------------------

/** Per-segment tangents that keep the curve monotone (no overshoot past neighbors). */
function monotoneTangents(points: Point[]): number[] {
  const n = points.length;
  const d: number[] = new Array(Math.max(0, n - 1));
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    d[i] = dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx;
  }
  m[0] = d[0] ?? 0;
  m[n - 1] = d[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] === 0 || d[i] === 0 || (d[i - 1] < 0) !== (d[i] < 0)) {
      m[i] = 0;
    } else {
      m[i] = (d[i - 1] + d[i]) / 2;
    }
  }
  // Clamp so the cubic never overshoots between two points with equal slope sign.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return m;
}

/** Builds an SVG path `d` string through `points`, monotone-cubic smoothed. */
export function lineGenerator(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const m = monotoneTangents(points);
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) / 3;
    const c1x = p0.x + dx;
    const c1y = p0.y + m[i] * dx;
    const c2x = p1.x - dx;
    const c2y = p1.y - m[i + 1] * dx;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/** Closed path for the area under (or between) a smoothed line and `baselineY`. */
export function areaGenerator(points: Point[], baselineY: number): string {
  if (points.length === 0) return "";
  const top = lineGenerator(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${top} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

/** Index of the point whose x is closest to `targetX`, by binary search over sorted x's. */
export function nearestIndexByX(points: Point[], targetX: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < targetX) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].x - targetX) < Math.abs(points[lo].x - targetX)) {
    return lo - 1;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Donut / arc generator
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angle: number): Point {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/** Path for one donut segment between two angles (radians, 0 = top, clockwise). */
export function arcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

export interface PieSlice {
  key: string;
  value: number;
  startAngle: number;
  endAngle: number;
}

/** Lays out values as pie slices (radians), in the order given, with a small gap between them. */
export function pieLayout(values: Array<{ key: string; value: number }>, padAngle = 0.02): PieSlice[] {
  const total = values.reduce((a, v) => a + v.value, 0) || 1;
  let angle = 0;
  return values.map(({ key, value }) => {
    const span = (value / total) * (Math.PI * 2 - padAngle * values.length);
    const startAngle = angle + padAngle / 2;
    const endAngle = startAngle + span;
    angle = endAngle + padAngle / 2;
    return { key, value, startAngle, endAngle };
  });
}

// ---------------------------------------------------------------------------
// Color assignment
// ---------------------------------------------------------------------------

/** Cycles a palette's colors across a stable order of keys. */
export function assignColors(keys: string[], palette: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  const source = palette.length > 0 ? palette : ["#888888"];
  keys.forEach((key, i) => {
    colors[key] = source[i % source.length];
  });
  return colors;
}

// ---------------------------------------------------------------------------
// Series visibility (legend click-to-hide)
// ---------------------------------------------------------------------------

/** Tracks which series ids a legend click has hidden, shared by every chart below. */
export function useSeriesVisibility() {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set());

  const toggle = React.useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isHidden = React.useCallback((id: string) => hidden.has(id), [hidden]);

  return { hidden, toggle, isHidden };
}

// ---------------------------------------------------------------------------
// Tooltip model
// ---------------------------------------------------------------------------

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
}

const HIDDEN_TOOLTIP: TooltipState = { visible: false, x: 0, y: 0, content: null };

export function useTooltip() {
  const [tooltip, setTooltip] = React.useState<TooltipState>(HIDDEN_TOOLTIP);

  const showTooltip = React.useCallback((x: number, y: number, content: React.ReactNode) => {
    setTooltip({ visible: true, x, y, content });
  }, []);
  const hideTooltip = React.useCallback(() => setTooltip(HIDDEN_TOOLTIP), []);

  return { tooltip, showTooltip, hideTooltip };
}

export function Tooltip({ state }: { state: TooltipState }): React.ReactElement | null {
  if (!state.visible) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: state.x,
        top: state.y,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
        background: "var(--fynmesh-color-dark, #1f2937)",
        color: "var(--fynmesh-color-light, #ffffff)",
        padding: "6px 9px",
        borderRadius: "var(--fynmesh-radius-sm, 4px)",
        fontSize: 11,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
        boxShadow: "var(--fynmesh-shadow-sm, 0 1px 2px rgba(0,0,0,0.2))",
        zIndex: 10,
      }}
    >
      {state.content}
    </div>
  );
}

/** One row of a multi-series tooltip: a color swatch, a label, and a formatted value. */
function TooltipRow({ color, label, value }: { color: string; label: string; value: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ opacity: 0.85 }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Axes, gridlines, legend
// ---------------------------------------------------------------------------

export function GridlinesY({
  ticks,
  scale,
  x0,
  x1,
}: {
  ticks: number[];
  scale: Scale;
  x0: number;
  x1: number;
}): React.ReactElement {
  return (
    <g stroke="var(--fynmesh-color-secondary, #e5e7eb)" strokeWidth={1} opacity={0.6}>
      {ticks.map((t) => (
        <line key={t} x1={x0} x2={x1} y1={scale(t)} y2={scale(t)} />
      ))}
    </g>
  );
}

export function AxisLeft({
  ticks,
  scale,
  x,
  format,
}: {
  ticks: number[];
  scale: Scale;
  x: number;
  format: (v: number) => string;
}): React.ReactElement {
  return (
    <g fontSize={10} fill="var(--fynmesh-color-dark, #374151)" textAnchor="end">
      {ticks.map((t) => (
        <text key={t} x={x - 8} y={scale(t)} dominantBaseline="middle">
          {format(t)}
        </text>
      ))}
    </g>
  );
}

/**
 * Bottom axis that rotates its labels when there is not enough room to lay
 * them out flat — the estimate is a character-width heuristic, not measured
 * text, so it errs on the side of rotating a little early rather than late.
 */
export function AxisBottom({
  ticks,
  scale,
  y,
  format,
}: {
  ticks: number[];
  scale: Scale;
  y: number;
  format: (v: number) => string;
}): React.ReactElement {
  const labels = ticks.map((t) => format(t));
  const step = ticks.length > 1 ? Math.abs(scale(ticks[1]) - scale(ticks[0])) : Infinity;
  const longest = labels.reduce((a, l) => Math.max(a, l.length), 0);
  const rotate = longest * 5.5 > step;

  return (
    <g
      fontSize={10}
      fill="var(--fynmesh-color-dark, #374151)"
      textAnchor={rotate ? "end" : "middle"}
    >
      {ticks.map((t, i) => (
        <text
          key={t}
          x={scale(t)}
          y={y + 16}
          transform={rotate ? `rotate(-35 ${scale(t)} ${y + 16})` : undefined}
        >
          {labels[i]}
        </text>
      ))}
    </g>
  );
}

export interface LegendItem {
  id: string;
  label: string;
  color: string;
}

export function Legend({
  items,
  hidden,
  onToggle,
}: {
  items: LegendItem[];
  hidden?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, marginTop: 6 }}>
      {items.map((item) => {
        const isHidden = hidden?.has(item.id) ?? false;
        return (
          <button
            key={item.id}
            type="button"
            onClick={onToggle ? () => onToggle(item.id) : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              padding: 0,
              cursor: onToggle ? "pointer" : "default",
              opacity: isHidden ? 0.4 : 1,
              font: "inherit",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--fynmesh-radius-full, 9999px)",
                background: item.color,
                display: "inline-block",
              }}
            />
            <span
              style={{
                color: "var(--fynmesh-color-dark, #374151)",
                textDecoration: isHidden ? "line-through" : "none",
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart frame: shared container, sizing and title
// ---------------------------------------------------------------------------

/**
 * Lazy-loads `./export` only when a chart's download button is actually
 * clicked, and rasterizes that chart's own `<svg>` to a PNG.
 */
function useChartPngExport(filenameBase: string) {
  return React.useCallback(async (svg: SVGSVGElement) => {
    const mod = await import("./export");
    await mod.downloadSvgAsPng(svg, mod.stampedFilename(filenameBase, "png"));
  }, [filenameBase]);
}

function DownloadIcon(): React.ReactElement {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 3v12m0 0l-5-5m5 5l5-5M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Shared card: title row (with an optional PNG-download button), a
 * fixed-height measured drawing area, and an optional legend below it — the
 * legend renders outside the measured box so it never clips the chart above it.
 */
function ChartFrame({
  title,
  height = 220,
  legend,
  onExportPng,
  children,
}: {
  title: string;
  height?: number;
  legend?: React.ReactNode;
  onExportPng?: (svg: SVGSVGElement) => void;
  children: (dims: { width: number; height: number }) => React.ReactNode;
}): React.ReactElement {
  const [setRef, size] = useResizeObserver<HTMLDivElement>();
  const drawRef = React.useRef<HTMLDivElement | null>(null);
  const combinedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      drawRef.current = node;
      setRef(node);
    },
    [setRef],
  );

  const handleExport = () => {
    const svg = drawRef.current?.querySelector("svg");
    if (svg && onExportPng) onExportPng(svg);
  };

  return (
    <div
      style={{
        background: "var(--fynmesh-color-light, #ffffff)",
        borderRadius: "var(--fynmesh-radius-lg, 8px)",
        boxShadow: "var(--fynmesh-shadow-sm, 0 1px 2px rgba(0,0,0,0.08))",
        padding: 12,
        position: "relative",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fynmesh-color-dark, #111827)" }}>{title}</div>
        {onExportPng && (
          <button
            type="button"
            onClick={handleExport}
            title={`Download "${title}" as PNG`}
            aria-label={`Download ${title} as PNG`}
            style={{
              display: "flex",
              alignItems: "center",
              background: "none",
              border: "none",
              padding: 2,
              cursor: "pointer",
              color: "var(--fynmesh-color-secondary, #64748b)",
            }}
          >
            <DownloadIcon />
          </button>
        )}
      </div>
      <div ref={combinedRef} style={{ width: "100%", height }}>
        {size.width > 0 ? children(size) : null}
      </div>
      {legend}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Concrete charts
// ---------------------------------------------------------------------------

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  points: Array<{ t: number; v: number }>;
  dashed?: boolean;
}

export function LineChart({
  title,
  series,
  formatX,
  formatY,
  margin = DEFAULT_MARGIN,
}: {
  title: string;
  series: LineSeries[];
  formatX: (t: number) => string;
  formatY: (v: number) => string;
  margin?: Margin;
}): React.ReactElement {
  const { tooltip, showTooltip, hideTooltip } = useTooltip();
  const { hidden, toggle, isHidden } = useSeriesVisibility();
  const exportPng = useChartPngExport(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const visibleSeries = series.filter((s) => !isHidden(s.id));

  return (
    <ChartFrame
      title={title}
      onExportPng={exportPng}
      legend={
        <Legend
          items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))}
          hidden={hidden}
          onToggle={toggle}
        />
      }
    >
      {({ width, height }) => {
        const shown = visibleSeries.length > 0 ? visibleSeries : series;
        const allT = shown.flatMap((s) => s.points.map((p) => p.t));
        const allV = shown.flatMap((s) => s.points.map((p) => p.v));
        const xDomain: [number, number] = [Math.min(...allT), Math.max(...allT)];
        const yDomain = niceLinearDomain([0, Math.max(...allV, 1)]);
        const innerW = Math.max(0, width - margin.left - margin.right);
        const innerH = Math.max(0, height - margin.top - margin.bottom);
        const x = linearScale(xDomain, [margin.left, margin.left + innerW]);
        const y = linearScale(yDomain, [margin.top + innerH, margin.top]);
        const yTicks = linearTicks(yDomain, tickCountForWidth(innerH, 40));
        const xTicks = linearTicks(xDomain, tickCountForWidth(innerW));

        const anchor = shown[0]?.points.map((p) => ({ x: x(p.t), y: y(p.v) })) ?? [];

        const handleMove = (evt: React.MouseEvent<SVGRectElement>) => {
          if (anchor.length === 0) return;
          const rect = evt.currentTarget.getBoundingClientRect();
          const mouseX = evt.clientX - rect.left + margin.left;
          const idx = nearestIndexByX(anchor, mouseX);
          const t = shown[0].points[idx].t;
          const rows = shown.map((s) => (
            <TooltipRow key={s.id} color={s.color} label={s.label} value={formatY(s.points[idx]?.v ?? 0)} />
          ));
          showTooltip(anchor[idx].x, margin.top - 4, (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatX(t)}</div>
              {rows}
            </div>
          ));
        };

        const hoverX = anchor.length && tooltip.visible ? tooltip.x : null;

        return (
          <svg width={width} height={height}>
            <GridlinesY ticks={yTicks} scale={y} x0={margin.left} x1={width - margin.right} />
            <AxisLeft ticks={yTicks} scale={y} x={margin.left} format={formatY} />
            <AxisBottom ticks={xTicks} scale={x} y={margin.top + innerH} format={formatX} />
            {shown.map((s) => (
              <path
                key={s.id}
                d={lineGenerator(s.points.map((p) => ({ x: x(p.t), y: y(p.v) })))}
                fill="none"
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? "4 3" : undefined}
              />
            ))}
            {hoverX !== null && (
              <line
                x1={hoverX}
                x2={hoverX}
                y1={margin.top}
                y2={margin.top + innerH}
                stroke="var(--fynmesh-color-secondary, #94a3b8)"
                strokeDasharray="2 2"
              />
            )}
            <rect
              x={margin.left}
              y={margin.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={hideTooltip}
            />
            <foreignObject x={0} y={0} width={width} height={height} style={{ pointerEvents: "none" }}>
              <Tooltip state={tooltip} />
            </foreignObject>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function AreaChart({
  title,
  points,
  color,
  formatX,
  formatY,
  margin = DEFAULT_MARGIN,
}: {
  title: string;
  points: Array<{ t: number; v: number }>;
  color: string;
  formatX: (t: number) => string;
  formatY: (v: number) => string;
  margin?: Margin;
}): React.ReactElement {
  const { tooltip, showTooltip, hideTooltip } = useTooltip();
  const exportPng = useChartPngExport(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  return (
    <ChartFrame title={title} onExportPng={exportPng}>
      {({ width, height }) => {
        const xDomain: [number, number] = [
          Math.min(...points.map((p) => p.t)),
          Math.max(...points.map((p) => p.t)),
        ];
        const yDomain = niceLinearDomain([0, Math.max(...points.map((p) => p.v), 1)]);
        const innerW = Math.max(0, width - margin.left - margin.right);
        const innerH = Math.max(0, height - margin.top - margin.bottom);
        const x = linearScale(xDomain, [margin.left, margin.left + innerW]);
        const y = linearScale(yDomain, [margin.top + innerH, margin.top]);
        const yTicks = linearTicks(yDomain, tickCountForWidth(innerH, 40));
        const xTicks = linearTicks(xDomain, tickCountForWidth(innerW));
        const pixelPoints = points.map((p) => ({ x: x(p.t), y: y(p.v) }));

        const handleMove = (evt: React.MouseEvent<SVGRectElement>) => {
          const rect = evt.currentTarget.getBoundingClientRect();
          const mouseX = evt.clientX - rect.left + margin.left;
          const idx = nearestIndexByX(pixelPoints, mouseX);
          if (idx < 0) return;
          showTooltip(pixelPoints[idx].x, pixelPoints[idx].y + margin.top - 10, (
            <TooltipRow color={color} label={formatX(points[idx].t)} value={formatY(points[idx].v)} />
          ));
        };

        return (
          <svg width={width} height={height}>
            <GridlinesY ticks={yTicks} scale={y} x0={margin.left} x1={width - margin.right} />
            <AxisLeft ticks={yTicks} scale={y} x={margin.left} format={formatY} />
            <AxisBottom ticks={xTicks} scale={x} y={margin.top + innerH} format={formatX} />
            <path d={areaGenerator(pixelPoints, margin.top + innerH)} fill={color} opacity={0.25} />
            <path d={lineGenerator(pixelPoints)} fill="none" stroke={color} strokeWidth={2} />
            {tooltip.visible && (
              <line
                x1={tooltip.x}
                x2={tooltip.x}
                y1={margin.top}
                y2={margin.top + innerH}
                stroke="var(--fynmesh-color-secondary, #94a3b8)"
                strokeDasharray="2 2"
              />
            )}
            <rect
              x={margin.left}
              y={margin.top}
              width={innerW}
              height={innerH}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={hideTooltip}
            />
            <foreignObject x={0} y={0} width={width} height={height} style={{ pointerEvents: "none" }}>
              <Tooltip state={tooltip} />
            </foreignObject>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export interface BarSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
}

export function GroupedBarChart({
  title,
  categories,
  series,
  formatY,
}: {
  title: string;
  categories: string[];
  series: BarSeries[];
  formatY: (v: number) => string;
}): React.ReactElement {
  const { tooltip, showTooltip, hideTooltip } = useTooltip();
  const { hidden, toggle, isHidden } = useSeriesVisibility();
  const exportPng = useChartPngExport(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const longest = categories.reduce((a, c) => Math.max(a, c.length), 0);
  const visibleSeries = series.filter((s) => !isHidden(s.id));
  const shown = visibleSeries.length > 0 ? visibleSeries : series;

  return (
    <ChartFrame
      title={title}
      onExportPng={exportPng}
      legend={
        series.length > 1 ? (
          <Legend
            items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))}
            hidden={hidden}
            onToggle={toggle}
          />
        ) : undefined
      }
    >
      {({ width, height }) => {
        // Same rule as AxisBottom: rotate labels that don't fit their band, and
        // grow the bottom margin to hold the longest one at -35°.
        const bandW = (width - DEFAULT_MARGIN.left - DEFAULT_MARGIN.right) / Math.max(1, categories.length);
        const rotate = longest * 5.5 > bandW;
        const margin = rotate
          ? { ...DEFAULT_MARGIN, bottom: 20 + Math.ceil(longest * 5.5 * Math.sin((35 * Math.PI) / 180)) }
          : DEFAULT_MARGIN;
        const innerW = Math.max(0, width - margin.left - margin.right);
        const innerH = Math.max(0, height - margin.top - margin.bottom);
        const maxV = Math.max(...shown.flatMap((s) => s.values), 1);
        const yDomain = niceLinearDomain([0, maxV]);
        const y = linearScale(yDomain, [margin.top + innerH, margin.top]);
        const yTicks = linearTicks(yDomain, tickCountForWidth(innerH, 40));
        const outer = bandScale(categories, [margin.left, margin.left + innerW], 0.3);
        const inner = bandScale(
          shown.map((s) => s.id),
          [0, outer.bandwidth],
          0.15,
        );

        return (
          <svg width={width} height={height} onMouseLeave={hideTooltip}>
            <GridlinesY ticks={yTicks} scale={y} x0={margin.left} x1={width - margin.right} />
            <AxisLeft ticks={yTicks} scale={y} x={margin.left} format={formatY} />
            <g fontSize={10} fill="var(--fynmesh-color-dark, #374151)" textAnchor={rotate ? "end" : "middle"}>
              {categories.map((category) => {
                const x = outer(category) + outer.bandwidth / 2;
                const y = margin.top + innerH + 16;
                return (
                  <text key={category} x={x} y={y} transform={rotate ? `rotate(-35 ${x} ${y})` : undefined}>
                    {category}
                  </text>
                );
              })}
            </g>
            {categories.map((category) =>
              shown.map((s) => {
                const value = s.values[categories.indexOf(category)] ?? 0;
                const barX = outer(category) + inner(s.id);
                const barY = y(value);
                return (
                  <rect
                    key={`${category}-${s.id}`}
                    x={barX}
                    y={barY}
                    width={inner.bandwidth}
                    height={margin.top + innerH - barY}
                    fill={s.color}
                    rx={2}
                    onMouseEnter={() =>
                      showTooltip(
                        barX + inner.bandwidth / 2,
                        barY + margin.top - 8,
                        <TooltipRow color={s.color} label={category} value={formatY(value)} />,
                      )
                    }
                  />
                );
              }),
            )}
            <foreignObject x={0} y={0} width={width} height={height} style={{ pointerEvents: "none" }}>
              <Tooltip state={tooltip} />
            </foreignObject>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  title,
  segments,
  formatValue,
  centerLabel,
}: {
  title: string;
  segments: DonutSegment[];
  formatValue: (v: number) => string;
  centerLabel: string;
}): React.ReactElement {
  const { tooltip, showTooltip, hideTooltip } = useTooltip();
  const { hidden, toggle, isHidden } = useSeriesVisibility();
  const exportPng = useChartPngExport(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const visible = segments.filter((s) => !isHidden(s.key));
  const shown = visible.length > 0 ? visible : segments;

  return (
    <ChartFrame
      title={title}
      height={240}
      onExportPng={exportPng}
      legend={
        <Legend
          items={segments.map((s) => ({ id: s.key, label: s.label, color: s.color }))}
          hidden={hidden}
          onToggle={toggle}
        />
      }
    >
      {({ width, height }) => {
        const cx = width / 2;
        const cy = height / 2;
        const outerR = Math.max(10, Math.min(cx, cy) - 8);
        const innerR = outerR * 0.6;
        const total = shown.reduce((a, s) => a + s.value, 0);
        const slices = pieLayout(shown.map((s) => ({ key: s.key, value: s.value })));

        return (
          <svg width={width} height={height} onMouseLeave={hideTooltip}>
              {slices.map((slice, i) => {
                const segment = shown[i];
                const mid = (slice.startAngle + slice.endAngle) / 2;
                const labelPoint = polarToCartesian(cx, cy, (outerR + innerR) / 2, mid);
                return (
                  <path
                    key={segment.key}
                    d={arcPath(cx, cy, innerR, outerR, slice.startAngle, slice.endAngle)}
                    fill={segment.color}
                    onMouseEnter={() =>
                      showTooltip(
                        labelPoint.x,
                        labelPoint.y - 4,
                        <TooltipRow
                          color={segment.color}
                          label={segment.label}
                          value={`${formatValue(segment.value)} (${((segment.value / (total || 1)) * 100).toFixed(1)}%)`}
                        />,
                      )
                    }
                  />
                );
              })}
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--fynmesh-color-dark, #111827)"
              >
                {centerLabel}
              </text>
              <foreignObject x={0} y={0} width={width} height={height} style={{ pointerEvents: "none" }}>
                <Tooltip state={tooltip} />
              </foreignObject>
          </svg>
        );
      }}
    </ChartFrame>
  );
}
