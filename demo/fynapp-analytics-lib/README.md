# fynapp-analytics-lib

Provides [`analytics-core`](../analytics-core/README.md) to the Perf Lab suite as a singleton shared module, the way `fynapp-ag-grid-lib` provides AG Grid. The dashboard, charts and reports apps all declare it with `import: false`, so the browser fetches it once. Suite overview: [`fynapp-analytics`](../fynapp-analytics/README.md).

It has nothing small enough to combine, but its build still writes `dist-raw`. The shell's resolver sends every suite app to `dist-raw` in raw mode, so this one must have it too.
