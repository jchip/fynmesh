import React from "react";

/**
 * The Perf Lab's live metrics: what the suite fetched in this page load, and
 * how long it took to be ready. See notes/PERF-LAB-DESIGN.md.
 *
 * Everything comes from the browser's own Resource Timing, filtered to the
 * suite's dist dirs, plus the `perf-lab:ready` mark the dashboard sets once its
 * startup widgets have mounted. Nothing here times anything itself, so the
 * panel cannot flatter a mode by measuring differently in it.
 */

type Mode = "raw" | "combined" | "hints";

const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: "raw", label: "Raw" },
  { mode: "combined", label: "Combined" },
  { mode: "hints", label: "Combined + hints" },
];

/** `/<prefix>/fynapp-analytics-charts/dist-raw/grid-x.js` -> app `charts`, file `grid-x.js` */
const SUITE_URL = /\/fynapp-analytics(?:-([a-z]+))?\/dist(?:-raw)?\/([^/?#]+)/;

interface Fetch {
  app: string;
  file: string;
  start: number;
  end: number;
  bytes: number;
  cached: boolean;
}

function toFetch(entry: PerformanceResourceTiming): Fetch | null {
  const m = SUITE_URL.exec(new URL(entry.name).pathname);
  if (!m) return null;
  return {
    app: m[1] || "dashboard",
    file: m[2],
    start: entry.startTime,
    end: entry.responseEnd,
    bytes: entry.transferSize,
    // transferSize is 0 for a cache hit; decodedBodySize rules out an empty body
    cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
  };
}

/** Suite fetches and the ready time, kept current as idle and lazy loads land. */
function usePerfEntries(): { fetches: Fetch[]; ready: number | null } {
  const [state, setState] = React.useState<{ fetches: Fetch[]; ready: number | null }>({
    fetches: [],
    ready: null,
  });

  React.useEffect(() => {
    const read = () => {
      const fetches = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .map(toFetch)
        .filter((f): f is Fetch => f !== null)
        .sort((a, b) => a.start - b.start);
      const mark = performance.getEntriesByName("perf-lab:ready", "mark")[0];
      setState({ fetches, ready: mark ? mark.startTime : null });
    };
    read();
    const observer = new PerformanceObserver(read);
    observer.observe({ entryTypes: ["resource", "mark"] });
    return () => observer.disconnect();
  }, []);

  return state;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const ROW = 16;
const LABEL_W = 190;
const CHART_W = 520;

/** One bar per file from request start to last byte, with the ready mark across. */
function Waterfall({ fetches, ready }: { fetches: Fetch[]; ready: number | null }) {
  if (fetches.length === 0) return null;
  const t0 = fetches[0].start;
  const span = Math.max(...fetches.map((f) => f.end), ready ?? 0) - t0 || 1;
  const x = (t: number) => LABEL_W + ((t - t0) / span) * CHART_W;
  const height = fetches.length * ROW + 24;

  return (
    <svg
      viewBox={`0 0 ${LABEL_W + CHART_W + 60} ${height}`}
      style={{ width: "100%", maxWidth: 800, fontSize: 10, fontFamily: "ui-monospace, monospace" }}
      role="img"
      aria-label="Waterfall of the suite's fetches"
    >
      {fetches.map((f, i) => {
        const y = i * ROW + 4;
        const afterReady = ready !== null && f.start > ready;
        return (
          <g key={`${f.app}/${f.file}/${i}`}>
            <text x={0} y={y + 10} fill="currentColor">
              {`${f.app}/${f.file}`.slice(0, 30)}
            </text>
            <rect
              x={x(f.start)}
              y={y}
              width={Math.max(2, x(f.end) - x(f.start))}
              height={ROW - 5}
              rx={2}
              fill={afterReady ? "var(--fynmesh-color-secondary, #64748b)" : "var(--fynmesh-color-primary, #2563eb)"}
              opacity={f.cached ? 0.35 : 1}
            />
            <text x={x(f.end) + 4} y={y + 10} fill="currentColor" opacity={0.7}>
              {f.cached ? "cache" : kb(f.bytes)}
            </text>
          </g>
        );
      })}
      {ready !== null && (
        <g>
          <line x1={x(ready)} x2={x(ready)} y1={0} y2={height - 14} stroke="var(--fynmesh-color-success, #16a34a)" strokeDasharray="4 3" />
          <text x={x(ready)} y={height - 2} fill="var(--fynmesh-color-success, #16a34a)" textAnchor="middle">
            ready {Math.round(ready)} ms
          </text>
        </g>
      )}
    </svg>
  );
}

export function PerfPanel() {
  const lab = (globalThis as any).__fynmeshPerfLab as { mode: Mode } | undefined;
  const { fetches, ready } = usePerfEntries();

  const startup = ready === null ? fetches : fetches.filter((f) => f.start <= ready);
  const later = fetches.length - startup.length;
  const network = startup.filter((f) => !f.cached);

  const go = (mode: Mode) => {
    const params = new URLSearchParams(location.search);
    params.set("perf", mode);
    location.search = params.toString();
  };

  return (
    <section
      style={{
        border: "1px solid var(--fynmesh-color-border, #e2e8f0)",
        borderRadius: "var(--fynmesh-radius-lg, 12px)",
        padding: 16,
        marginBottom: 16,
        background: "var(--fynmesh-color-light, #fff)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <strong style={{ marginRight: 8 }}>Perf Lab</strong>
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => go(mode)}
            aria-pressed={lab?.mode === mode}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--fynmesh-color-primary, #2563eb)",
              background: lab?.mode === mode ? "var(--fynmesh-color-primary, #2563eb)" : "transparent",
              color: lab?.mode === mode ? "var(--fynmesh-color-light, #fff)" : "inherit",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <button onClick={() => location.reload()} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}>
          Reload warm
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 12 }}>
        <Stat label="Startup requests" value={String(startup.length)} />
        <Stat label="Over the network" value={kb(network.reduce((n, f) => n + f.bytes, 0))} />
        <Stat label="From cache" value={`${startup.length - network.length} files`} />
        <Stat label="Ready at" value={ready === null ? "…" : `${Math.round(ready)} ms`} />
        <Stat label="After ready" value={`${later} files`} />
      </div>

      <Waterfall fetches={fetches} ready={ready} />

      <p style={{ fontSize: 12, opacity: 0.7, margin: "8px 0 0" }}>
        Blue bars load before ready. Gray bars load after it: reports at idle, and chunks you click for. Faded bars came
        from cache. On localhost a round trip costs about 0 ms, so the modes look alike. Use the live site or DevTools
        throttling, and turn on "Disable cache" for cold numbers.
      </p>
    </section>
  );
}
