# FynMesh — Notes

Working notes, design docs, and roadmaps for the FynMesh framework. Start here to
get oriented before diving into the code. For the user-facing project overview see
the repo root [`README.md`](../README.md); for agent/build conventions see
[`CLAUDE.md`](../CLAUDE.md) and [`AGENTS.md`](../AGENTS.md).

## What is FynMesh

A large-scale micro-frontend framework built on Rollup-based Module Federation. A
central **kernel** loads and coordinates independently deployed **FynApps**,
manages shared dependencies (including multiple versions side-by-side), and runs a
**middleware** system for cross-app concerns.

## Monorepo layout

| Path                  | Contents                                                        |
| --------------------- | -------------------------------------------------------------- |
| `core/kernel`         | The kernel: module loading, bootstrap, middleware, telemetry   |
| `rollup-federation`   | `rollup-plugin-federation`, `federation-js`, federation samples |
| `dev-tools`           | `create-fynapp` scaffolder, `rollup-wrap-plugin`               |
| `demo`                | Demo server + ~25 example FynApps (React, Vue, Marko, Solid…)  |
| `demo-rollup-externals` | ESM externals/sharing experiments                           |

## Notes index

| File                                                       | What it covers                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| [`FRAMEWORK_ROADMAP.md`](./FRAMEWORK_ROADMAP.md)           | Demo-ready → production-ready roadmap; framework gaps            |
| [`TODO.md`](./TODO.md)                                     | Development roadmap / completed-vs-pending checklist            |
| [`FYNAPP-HOWTO.md`](./FYNAPP-HOWTO.md)                     | Pointer → canonical FynApp docs in `dev-tools/create-fynapp/agent/` |
| [`BUILD-ARTIFACTS.md`](./BUILD-ARTIFACTS.md)               | The JSON a FynApp build emits: purpose, producers, consumers, what breaks |
| [`DEMO.md`](./DEMO.md)                                     | Demo quick reference: live URLs and local commands             |
| [`KERNEL_PRINCIPAL_REVIEW.md`](./KERNEL_PRINCIPAL_REVIEW.md) | Principal-engineer review of kernel risks (FYM-66/FYM-77)    |
| [`KERNEL_TELEMETRY_DESIGN.md`](./KERNEL_TELEMETRY_DESIGN.md) | KernelTelemetry runtime-observability design (FYM-49/53/54) — implemented |
| [`FYNBUS_DESIGN.md`](./FYNBUS_DESIGN.md)                   | FynBus inter-FynApp messaging design (FYM-13, epic FYM-2) — implemented |
| [`SHELL_LOAD_PERF.md`](./SHELL_LOAD_PERF.md)               | `/shell` load-perf analysis: measured federation waterfall + ranked fixes |

### Archived (`notes/archive/`)

Historical docs whose decisions have shipped; kept for rationale, not current-state.

| File                                                       | What it covers                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| [`archive/SHARED_STATE_ARCHITECTURE.md`](./archive/SHARED_STATE_ARCHITECTURE.md) | Design analysis behind the shipped middleware shared-state registry |

Stale or superseded docs should be moved into `notes/archive/`.

## Build & run (from repo root)

| Command            | Action                                            |
| ------------------ | ------------------------------------------------- |
| `fyn bootstrap`    | Rebuild the demo (auto-rebuilds deps like kernel) |
| `fyn build-prod`   | Build the production demo                          |
| `fyn clean:demo`   | Clean the demo                                     |
| `fyn start`        | Start demo at `http://localhost:3000`             |

Demo entry points: landing `/`, shell middleware `/shell.html`, all FynApps `/demo.html`.

## Task tracking

Outstanding work lives in the `fyntacks` task tracker under project **FynMesh**
(issue prefix `FYM`) — not in this directory. Check the ready queue there before
picking up work.
