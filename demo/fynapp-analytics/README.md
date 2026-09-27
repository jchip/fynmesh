# fynapp-analytics

The host dashboard of the Perf Lab suite. It loads only in `/shell?perf=raw|combined|hints`. Design, measured results and findings: [`notes/PERF-LAB-DESIGN.md`](../../notes/PERF-LAB-DESIGN.md).

The suite:

| Package | Role |
|---|---|
| `fynapp-analytics` | this dashboard, rendered through `./component` |
| `fynapp-analytics-charts` | chart grid and SVG chart engine |
| `fynapp-analytics-reports` | report table, loaded at browser idle |
| `fynapp-analytics-lib` | provides `analytics-core` as a shared module |
| `analytics-core` | formatters, stats, and a seeded dataset |

## Why so many tiny exposes

`header`, `toolbar`, `filters`, `date-range`, `kpi-tile`, `format-badge` and `empty-state` are each their own expose, and each builds to under 2 KB. That is on purpose. `federation-combine`'s default policy takes chunks at or below 2 KB, so it folds them and `main` into one `combo-*.js`. Keep them small, or the combine demo stops forming.

All of them load statically at startup, through `component` or, for `format-badge`, through `kpi-tile`. The exception is `empty-state`, which loads only when a filter leaves no rows. In combined mode it arrives inside the combo file, registered but not run.

## Why the build writes two dists

```
rm -rf dist dist-raw && rollup -c && cp -R dist dist-raw && federation-combine dist
```

`dist-raw` is the output before combining. The shell's resolver serves it in `raw` mode and `dist` otherwise. Every suite app builds this way, and `combine-demo` leaves an app that combined itself alone.

## The panel and the ready mark

`perf-panel.tsx` reads Resource Timing for the suite's files. `component.tsx` sets `performance.mark("perf-lab:ready")` once the KPI tiles and chart grid have painted. Then it imports the reports table at browser idle.
