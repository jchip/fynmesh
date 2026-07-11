---
name: fynapp-modify
description: Modify an existing FynApp — change rendering, add/consume/author middleware, adjust exposes or dependencies. Use whenever the user asks to change, extend, fix, or add a feature to a FynApp (any app whose rollup.config imports create-fynapp). NOT for creating a new FynApp (use the create-fynapp CLI) and NOT for a kernel-wide API migration (use fynapp-migrate-kernel).
---

# Modify an existing FynApp

FynApps are micro-frontends loaded by the fynmesh kernel. Modifying one requires
understanding its code, so it's your job — there is no code-mod for it.

The contract, guide, and examples ship inside the installed `create-fynapp`
package (paths below are `node_modules/create-fynapp/...`; in the fynmesh
monorepo itself they are `dev-tools/create-fynapp/...`).

## Do this

1. **Read the contract first** — authoritative and verifiable:
   `node_modules/create-fynapp/agent/CONTRACT.md`
   (`FynUnit` lifecycle, `rollup.config.ts`, consuming/providing middleware,
   render results, package/tsconfig shape). Fuller guide:
   `node_modules/create-fynapp/agent/GUIDE.md`.

2. **Copy the closest pattern** from `node_modules/create-fynapp/examples/`:
   `react-minimal`, `middleware-consumer`, `middleware-provider`, `vanilla`.

3. **Make a surgical edit.** Touch only what the request needs. `src/main.ts`
   exports `const main` implementing `FynUnit` (required `execute(runtime)`;
   optional `initialize`/`shutdown`). Read consumed middleware via
   `runtime.middlewareContext.get("<name>")`. There is **no `runtime.kernel`** —
   use `globalThis.fynMeshKernel`. Adding an exposed module or dependency is a
   trivial edit to `rollup.config.ts` / `package.json`.

4. **Check — required before you call it done:**
   ```bash
   cd <fynapp> && cfa check
   ```
   (builds via rollup + checks `dist/fynapp-entry.js` and a valid
   `dist/fynapp.manifest.json` exposing `./main`; `--no-build` checks an existing
   `dist/`). If the app renders UI, also load it in the browser to confirm it
   actually renders.

## Guardrails
- Match the app's existing style; don't refactor unrelated code.
- React apps import `react`/`react-dom` in source but depend on
  `esm-react`/`esm-react-dom` (aliased at build) — don't add `react` to deps.
- `FynModule`/`FynModuleRuntime` are deprecated aliases; use `FynUnit`/`FynUnitRuntime`.
- If a change needs a kernel API that doesn't exist yet, stop and surface it —
  don't invent kernel methods.
