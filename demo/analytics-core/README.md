# analytics-core

The shared library of the Perf Lab suite. It's a plain ESM package, not a FynApp. `fynapp-analytics-lib` bundles it and provides it as a shared module, and three suite apps consume it. See [`notes/PERF-LAB-DESIGN.md`](../../notes/PERF-LAB-DESIGN.md).

Its job in the demo is to be one big file fetched once, about 61 KB minified. Most of that size is data from `scripts/generate.mts`: 40 locale tables, 1,387 daily metric rows, and 20 palettes. The generator uses a seeded PRNG, so its output is byte-identical on every build. That keeps chunk hashes stable. `src/generated/` is build output and is gitignored.

The API is in `src/index.ts`: formatters built on the locale tables (no `Intl`), stats helpers, and dataset queries like `summarize`, `timeSeries`, `groupBy` and `compareRanges`.
