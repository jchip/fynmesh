# `standard` loader pair — frozen

The pre-overhaul loader pair: **stock SystemJS + the last `federation-js` that
ran against it.** Serve it with `FEDERATION=standard`.

These files are committed and must never be regenerated from a moving branch.
That is the whole point: upstream can't move, so this copy can't go stale.

## federation-js

| | |
|---|---|
| repo | `jchip/rollup-federation` |
| ref | tag `standard-systemjs-base` (branch `standard-systemjs`) |
| commit | `158e8af536439b96ec0e179e821da4059a3ce05f` |
| built with | `fyn install` in `federation-js/` (runs `xrun -s clean tsc rollup minify`) |
| `federation-js.dev.js` sha256 | `75db3f444a0a6d4d439e28544be770c3dc7015a311955ad2419c050830ef04db` |

That commit is the last one before the SystemJS overhaul began; the next commit
on the overhaul line is `f1bc4c3 SJS-15: move systemjs fork into monorepo as
workspace package`.

This build was verified byte-identical (`cmp`, same sha256) to the copy that had
been installed at `demo-server/node_modules/federation-js/dist` since 2026-08-13
— i.e. the artifact the demo actually ran before the fork work started. The
committed bundle is the known-good one, not a fresh guess at it.

## SystemJS

Stock **SystemJS 6.14.2**, copied from `demo-server/public/system.js`. Those
root-level copies stay where they are because `scripts/build-demo-site.mts`
reads them by name for the static site build.

## Why this pair must switch together

`federation-js` and the loader under it are one unit. The fork keeps its module
registry, name→url, url→module and per-version qualifiers in
`System.registrations`, which stock SystemJS does not have. So:

- old `federation-js` + stock SystemJS — this directory. Works.
- new `federation-js` + the fork — `FEDERATION=fork`. Works.
- either crossed pair — broken.

Mixing them is not a hypothetical. The demo spent 2026-08-17 to 08-19 serving
stock SystemJS 6.14.2 against a fork-era `federation-js`, and the failure was
invisible because the two stale halves were self-consistent. Switching by
variant directory keeps the halves together by construction.
