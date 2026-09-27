# fynapp-analytics-reports

The Perf Lab's report table. Suite overview: [`fynapp-analytics`](../fynapp-analytics/README.md).

The dashboard imports `./table` at browser idle, after its ready mark, so the table always lands after first paint. The kernel still loads this app's small entry at startup, because the dashboard's manifest lists it. `drilldown.tsx` is a plain dynamic import, loaded only on a row click.
