# Packages consumed by workflow-engine `web/federation/`

Date: 2026-08-11 (America/Los_Angeles)

A consumer inventory, written from the consuming repo. It does not request or authorize
publication — `CREATE-FYNAPP-RELEASE-HANDOFF.md` governs that — and it asks nothing of this repo
beyond the release track already tracked by CFA-20, CFA-25, CFA-33 and CFA-34.

## The consumer

ID.me's workflow-engine repo carries `web/federation/`: six packages — `bootstrap`,
`fynapp-react-lib`, `fynapp-vendor`, `fynapp-shared`, `fynapp-screens`, `fynapp-hello` — that
build the product's WDUX screens as FynApps.

They reach this repo through a gitignored symlink, `web/federation/_fyn/fynmesh` → the local
clone (default `~/dev/fynmesh`), with every dependency written
`file:../_fyn/fynmesh/<path>`. That symlink is the reason workflow-engine's CI cannot build
`web/federation/` at all: the source exists only on a developer's disk. Registry publication of
the packages below is the prerequisite for that build ever running in CI.

## The seven packages consumed

| package | version | path in this repo | consumed by | in the browser bundle |
| --- | --- | --- | --- | --- |
| `federation-js` | 1.0.0 | `rollup-federation/federation-js` | all six | yes |
| `@fynmesh/kernel` | 1.0.0 | `core/kernel` | `bootstrap`, `fynapp-hello` | yes — bundled into `fynmesh-bootstrap*.js` |
| `esm-react` | 19.2.8 | `misc/esm-react-19` | the five fynapps — **vendored, see below** | yes — bundled into `fynapp-react-lib` |
| `esm-react-dom` | 19.2.8 | `misc/esm-react-dom-19` | the five fynapps — **vendored, see below** | yes — bundled into `fynapp-react-lib` |
| `rollup-plugin-federation` | 1.0.0 | `rollup-federation/rollup-plugin-federation` | the five fynapps | build-time |
| `rollup-wrap-plugin` | 1.0.0 | `dev-tools/rollup-wrap-plugin` | the five fynapps | build-time |
| `create-fynapp` | 1.0.0 | `dev-tools/create-fynapp` | the five fynapps | build-time |

All seven are declared as devDependencies over there, but the first four put bytes in the shipped
bundles — the declaration means "not imported by application source", not "not shipped".

The set is closed under its own dependencies: nothing else from this repo is pulled in
transitively. `create-fynapp` is used for `setupFynAppOutputConfig`, `setupFederationPlugins`,
`setupReactAliasPlugins`, `setupMinifyPlugins`, `fynappEntryFilename`, `env` and `isProduction`.

## Mapping onto the current release scope

Five of the seven are exactly the core set already tracked:

| package | ticket |
| --- | --- |
| `federation-js` | CFA-33 |
| `rollup-plugin-federation` | CFA-20 |
| `rollup-wrap-plugin` | CFA-34 |
| `@fynmesh/kernel` | (after CFA-33) |
| `create-fynapp` | CFA-25 |

Nothing beyond that set is needed for these consumers, and the publish order in the release
handoff's *Continuation sequence* is the order they need.

## `esm-react` / `esm-react-dom` — resolved by the consumer, no action here

**CFA-35 stands.** workflow-engine has copied both packages verbatim into its own repo
(`web/misc/esm-react-19`, `web/misc/esm-react-dom-19`) and its five fynapps now resolve them from
there. Nothing is asked of this repo for these two, and neither needs to be published. The rest of
this section records why that was the outcome.

The copies are at **19.2.8**, taken from `main` at `503780a`, every content file byte-identical to
this repo's. An earlier copy went in at 19.1.0 — it came off `kernel-size-optimizations`, whose
base predates `386b778` (FYM-188) — and was replaced within the hour. The consumer's
shared-singleton declaration is `^19.0.0`, so it was never broken by the lag, and re-copying stays
a consumer-side decision with no dependency in this direction.

One thing worth knowing on this side: 19.2.8's `scripts/gen-esm.mjs` means `fyn install` rebuilds
`esm-react`'s committed sources from whatever `react` resolves. In the consumer that regenerated
byte-identical output, so the vendored files stay clean — but it does make an install capable of
rewriting tracked files if `react` ever floats past 19.2.8 there.

CFA-35 is closed `wont_do` on the grounds that these are local demo packages, not public release
prerequisites. `web/federation/` is nevertheless built the way this repo's demos are built:

- all five fynapps carry `esm-react` and `esm-react-dom` as build dependencies;
- `fynapp-react-lib` declares both as federation-shared **singletons** at `^19.0.0`, which is what
  makes every screen share one React instance across the boundary;
- their rollup configs select the production/development build through the packages' own export
  conditions.

CFA-37 kept these adapters out of public scaffolds, which use standard `react`/`react-dom`.
Migrating the consumer onto that path would have meant rewriting how its screens share React, and
publishing instead was not available either: the name `esm-react` is taken on public npm by an
unrelated package (16.8.3, last modified 2022-05-01) against this repo's 19.x. Vendoring cost
nine files and settled it without either.

The copies are marked do-not-edit and carry their provenance; upstream stays the source of truth.
If these packages ever do move onto a release track, the consumer drops its copies and takes the
published versions.

## Public npm registry state, checked 2026-08-11

| name | result |
| --- | --- |
| `@fynmesh/kernel` | 404 |
| `federation-js` | 404 |
| `rollup-plugin-federation` | 404 |
| `rollup-wrap-plugin` | 404 |
| `create-fynapp` | 404 |
| `esm-react-dom` | 404 |
| `esm-react` | **taken** — unrelated package, 16.8.3, modified 2022-05-01 |

Five of the free names are unscoped and stay free only until someone takes them.

## Consumer-side follow-through, once packages are public

The five remaining `file:../_fyn/fynmesh/...` entries across six `package.json` files become semver
ranges, the `_fyn/` symlink and its `FYNMESH_DIR` bootstrap step are deleted, and
`web/federation/README.md` is rewritten to match. That work is entirely in the workflow-engine
repo and blocks nothing here.
