# fynapp-analytics-charts

The Perf Lab's chart grid. The dashboard imports `./grid` as an `mf-expose`. Suite overview: [`fynapp-analytics`](../fynapp-analytics/README.md).

- `./grid` statically imports `./renderer`, a small SVG chart engine. The build joins the two with an explicit group, `--group startup=grid,renderer`, so one file carries a big chunk and a small one.
- `export.ts` is a plain dynamic import, loaded only when Export is clicked. It stays out of every group, so it's always its own file.
