---
name: fynapp-migrate-kernel
description: Update FynApps after the @fynmesh/kernel API changes (a type/method/event renamed, removed, reshaped, or added). Use when the kernel changed and FynApps must be brought back into alignment, or when apps report build/type errors after a kernel update. NOT for a single feature edit to one app (use fynapp-modify).
---

# Migrate FynApps to a changed kernel API

The FynApp contract is type-anchored: `create-fynapp`'s
`src/fynapp-contract.ts` re-exports the kernel types apps depend on, so a kernel
change that breaks the contract shows up as a compile error there first.

The full playbook and its changelog ship in the installed package at
`node_modules/create-fynapp/agent/MIGRATION.md` (in the fynmesh monorepo:
`dev-tools/create-fynapp/agent/MIGRATION.md`).

## Do this — follow the playbook

1. **Rebuild kernel types** so consumers see the new surface (in the kernel
   package: `tsc --build tsconfig.lib.json`).
2. **Reconcile the anchor + contract:** in the `create-fynapp` package run its
   build. Fix `src/fynapp-contract.ts` to match the new API, then update
   `agent/CONTRACT.md` prose and any affected `examples/`. Add a changelog entry
   to `agent/MIGRATION.md`.
3. **Migrate each FynApp** per the changelog entry, conforming to
   `agent/CONTRACT.md`. Smallest conforming edit wins.
4. **Validate each:** `cd <fynapp> && cfa validate`.
5. **Full rebuild / run** to catch cross-app/federation breakage a compiler
   can't see (in the fynmesh monorepo: `fyn bootstrap && fyn start`).

## Guardrails
- Update the anchor/contract/examples **before** editing apps — apps depend on them.
- A green build proves names/shapes match, not behavior. For same-type behavioral
  changes, rely on the changelog + runtime checks.
- Don't trust `core/kernel/examples/simple-usage.ts` or `runtime.kernel`
  (both stale/nonexistent — see CONTRACT.md's "stale sources" list).
