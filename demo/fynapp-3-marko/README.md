# fynapp-3-marko

FynApp using Marko framework.

## Framework
Marko 5

## Features
- Demonstrates Marko integration with FynMesh
- Server-side rendering capable
- **Negative demo: unprovided shared module.** `marko` is declared in `shared`
  with nothing providing it, so the federation inspector reports
  `share-not-provided: marko@5.37.31` on every load. That warning is the point
  — it exercises share-not-provided detection against a *real* package, unlike
  [fynapp-test-shared](../fynapp-test-shared/), which uses a synthetic name.
  Marko is unprovidable by design: its compiler bundles the runtime into each
  app and tree-shakes it per component set, so there is no single lib to hand
  out. The app renders from its own bundled copy. Do not remove the declaration
  and do not add a provider — see the comment in `rollup.config.ts`.

## Build
```bash
fyn install
nvx rollup -c
```
