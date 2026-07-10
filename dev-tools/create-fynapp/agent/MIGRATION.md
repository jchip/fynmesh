# Kernel API Migration Playbook

**Audience: an LLM coding agent updating FynApps after the `@fynmesh/kernel` API
changes.** FynApps code against the kernel contract ([`CONTRACT.md`](./CONTRACT.md));
when the kernel changes, apps and this package's contract must be brought back
into alignment.

## How drift is detected

`../src/fynapp-contract.ts` re-exports the exact kernel types the contract
depends on and is compiled on every build. So the first signal is mechanical:

```bash
cd dev-tools/create-fynapp
node_modules/.bin/tsc --build tsconfig.lib.json   # rebuild kernel types first if needed
fyn build                                          # compiles fynapp-contract.ts
```

If a kernel type was renamed, removed, or reshaped, `fynapp-contract.ts` fails to
compile — pointing you straight at what changed. A clean build means the *names
and shapes* the contract anchors to still exist (it does not prove semantics
unchanged — read the kernel changelog too).

## Procedure

Do this whenever `core/kernel` ships an API change:

1. **Rebuild kernel types** so consumers see the new surface:
   ```bash
   cd core/kernel && node_modules/.bin/tsc --build tsconfig.lib.json
   ```
2. **Reconcile the anchor & contract.** In `dev-tools/create-fynapp`, run
   `fyn build`. Fix `src/fynapp-contract.ts` to match the new kernel API, then
   update [`CONTRACT.md`](./CONTRACT.md) prose and any affected [`../examples/`](../examples)
   so all three agree. Add an entry to the changelog below.
3. **Migrate each FynApp.** For every app under `demo/` (and any external
   FynApps), apply the change per the changelog entry, following CONTRACT.md.
   Prefer the smallest edit that conforms. Typical changes: renamed
   type/method, new/changed `initialize` return fields, changed middleware
   phase signatures, new required lifecycle handling.
4. **Validate each app**:
   ```bash
   cd demo/<fynapp> && cfa validate
   ```
5. **Full rebuild** from the repo root to catch cross-app/federation breakage:
   ```bash
   fyn bootstrap && fyn start   # then load /demo.html and /shell.html
   ```
6. **Bump** the kernel `semver` used in app `useMiddleware`/`shared` declarations
   only if the kernel's version range actually changed.

## When to update the anchor vs. the apps

- **Rename/removal of a type or export** → update `fynapp-contract.ts` +
  `CONTRACT.md` first (they won't compile/read correctly otherwise), then apps.
- **New optional capability** (e.g. a new optional `FynUnit` hook) → document in
  `CONTRACT.md` and add an example; apps need no change unless they opt in.
- **Behavioral change with same types** → the build stays green; rely on the
  changelog + `fyn start` runtime checks, not the compiler.

---

## Changelog — kernel API changes & required app migrations

Record each kernel API change here so future migrations are repeatable. Newest
first. Use the template.

### Template

```
### <date> — kernel <version>: <one-line summary>
- **What changed:** <type/method/event added|renamed|removed|reshaped>
- **Anchor/contract edits:** <files touched in create-fynapp>
- **App migration:** <exact steps to update a FynApp>
- **Detection:** <compile error you'll see, or "runtime-only — see …">
```

### 2026-07-09 — baseline (kernel ^1.0.0)

- **Contract surface anchored:** `FynUnit`, `FynUnitRuntime`, `FynApp`,
  `MiddlewareUseMeta`, `MiddlewareInfo`, `FynAppMiddleware`,
  `FynAppMiddlewareCallContext`, plus values `useMiddleware`, `noOpFynUnit`
  (see `src/fynapp-contract.ts`).
- **Known deprecated aliases** (still compile; don't use in new code):
  `FynModule`, `FynModuleRuntime`, `noOpMiddlewareUser`, `cc.fynMod`.
- **Known stale sources to ignore:** `core/kernel/examples/simple-usage.ts`;
  any `runtime.kernel` reference; the `{ info: MiddlewareInfo }` consumer form.
