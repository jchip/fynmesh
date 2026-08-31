# FynApp Guide — Create vs. Modify

This package supports two distinct workflows. Pick the right one.

| You want to… | Do this |
|--------------|---------|
| **Create a new FynApp** | Run the static `create-fynapp` CLI (§1). Mechanical, no code understanding needed. |
| **Modify an existing FynApp** | You're a coding agent — follow [`CONTRACT.md`](./CONTRACT.md), copy from the [FynMesh examples](https://github.com/jchip/fynmesh/tree/main/dev-tools/create-fynapp/examples), then `cfa check` (§2). |
| **Update FynApps to a changed kernel API** | Follow [`MIGRATION.md`](./MIGRATION.md). |

> **Claude Code skills (opt-in).** This package bundles two skills under
> [`../skills/`](../skills) — `fynapp-modify` and `fynapp-migrate-kernel`. They
> are **not** installed automatically. To make them available in a project, run
> `cfa install-skills` — it copies them into `<project>/.claude/skills/`
> (`--force` to overwrite). `.claude/` is typically gitignored, so each user
> decides whether to install them.

---

## 1. Create a new FynApp (CLI — static scaffold)

From the monorepo root:

```bash
create-fynapp --name my-fynapp --framework react
# options: --name/-n, --framework/-f (react | vue),
#          --dir/-d (defaults to the name), --skip-install
```

The release CLI scaffolds React and Vue. Other framework demos and build-helper
settings are references for manually authored apps; additional static templates
remain roadmap work.

Run from the monorepo root this scaffolds `demo/my-fynapp/`; run anywhere else
it scaffolds `my-fynapp/` in the current directory. Either way from static
templates for the chosen framework: `package.json`,
`tsconfig.json`, `rollup.config.ts` (the `createFynAppRollupConfig` factory
form), and a starter `src/`. It does **not** reason about your code — it just
stamps out a known-good skeleton that already conforms to
[`CONTRACT.md`](./CONTRACT.md).

### Register the new app in the demo server

The scaffold creates the app but the demo server must be told about it:

1. **`demo/demo-server/templates/components/fynapp-loader.html`** — add your app
   to the `features` map: `"my-fynapp": true` (`true` = eager, `"lazy"` =
   button-triggered, omit = off).
2. **`demo/demo-server/src/dev-proxy.ts`** — add a path mapping so the dev server
   can find its files:
   ```ts
   [ { path: "/my-fynapp" },
     { protocol: "file", path: Path.join(__dirname, "../../my-fynapp") } ],
   ```

Then from the repo root: `fyn bootstrap` (build all) and `fyn start`
(→ `http://localhost:3000/demo.html`).

> Editing `fynapp-loader.html`/`dev-proxy.ts` is a *trivial config edit* — do it
> mechanically. Anything beyond stamping the skeleton (real components,
> middleware, rendering logic) is a **modify** task → §2.

---

## 2. Modify an existing FynApp (coding agent)

Modifying requires understanding the code, so it is your job, not a code-mod's.
The loop:

1. **Read the contract.** [`CONTRACT.md`](./CONTRACT.md) is authoritative for the
   `FynUnit` lifecycle, `rollup.config.ts`, middleware consume/provide, render
   results, and package/tsconfig shape.
2. **Copy a pattern.** Find the closest match in the [FynMesh examples](https://github.com/jchip/fynmesh/tree/main/dev-tools/create-fynapp/examples):
   - `react-minimal` — standalone React app.
   - `middleware-consumer` — consume another app's middleware.
   - `middleware-provider` — author a middleware.
   - `vanilla` — framework-agnostic.
   The working demo apps `demo/fynapp-6-react` and `demo/fynapp-design-tokens`
   are the fuller, real-world versions.
3. **Make the surgical edit** to `src/` (and, if adding an exposed module or a
   dependency, the *trivial* config edits to `rollup.config.ts` / `package.json`).
4. **Check** — the change is not done until this passes:
   ```bash
   cd demo/<fynapp> && cfa check
   ```
   `cfa check` builds via rollup and checks the federation output
   (`dist/fynapp-entry.js` + a valid `dist/fynapp.manifest.json` exposing
   `./main`). Use `--no-build` to check an existing `dist/`.
5. If the app renders UI, also load it in the demo (`fyn start`) to confirm
   runtime behavior — types and manifest passing does not prove it renders.

### Common modifications (all → CONTRACT.md sections)

- Add/adjust rendering → `FynUnit.execute` + render results (CONTRACT §2, §5).
- Consume a middleware → `useMiddleware` + `middlewareContext.get` (CONTRACT §4).
- Provide a middleware → `__middleware__` export + `setup`/`apply` (CONTRACT §6);
  add the `./middleware/*` expose to `rollup.config.ts` (CONTRACT §3).
- Add a dependency → `package.json` (trivial); React apps use public `react`/`react-dom`.

---

## 3. Build helpers exported by `create-fynapp`

`rollup.config.ts` files import these from `create-fynapp`:

| API | Purpose |
|-----|---------|
| `createFynAppRollupConfig(opts)` | **Preferred** whole-config factory |
| `setupFynAppOutputConfig()` | Standard `dist/` SystemJS output |
| `setupDummyEntryPlugins()` | Virtual entry federation requires |
| `setupReactFederationPlugins(cfg)` / `setupFederationPlugins(cfg)` | Federation + manifest |
| `setupReactAliasPlugins()` | Local-demo alias: `react` → `esm-react` |
| `setupMinifyPlugins()` | Terser (production only) |
| `fynappDummyEntryName`, `fynappEntryFilename`, `env` | Constants for the low-level form |
| `checkFynApp`, `runCheck` | Programmatic output check (what `cfa check` calls) |

Debug the build with `DEBUG=create-fynapp`.
