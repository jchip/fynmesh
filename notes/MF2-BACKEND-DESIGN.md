# FynMesh on Module Federation 2 — design and plan

Status: **proposed**, 2026-09-26. Nothing here is built yet.

FynMesh can run on one of two federation backends: today's `federation-js`, or Module Federation 2
(MF2). A deployment picks one. The two never share a page. The MF2 backend gets its own kernel
bundles, its own FynApp build, and its own demo in `demo-mf2/`.

Background on how the two stacks differ is in [`MF2-VS-FEDERATION-JS.md`](./MF2-VS-FEDERATION-JS.md).
MF source references below are to `module-federation-core` @ `c38c4c0e4` (packages at 2.9.0).

---

## Goals

- `kernel-core` runs unchanged on MF2: lifecycle, middleware, FynBus, bootstrap ordering, telemetry.
- FynApps built for MF2 keep the FynApp authoring contract: `./main` FynUnit, `useMiddleware`,
  `fynapp-middleware` imports, and `mf-expose` imports with a semver range.
- Many versions of one FynApp run side by side, picked by semver range (the `fynapp-x1` v1/v2 case).
- Shared packages resolve across all loaded FynApps through one share scope, with no per-app remote
  declarations.

## Non-goals

- Mixing backends on one page.
- Any compatibility layer between the two builds.
- Node kernel on MF2. `node-kernel.ts` stays as it is.
- Vite dev server and HMR. v1 serves built `dist/` output, like `demo/` does today.
- Porting `federation-combine`, the `Federation.__I()` inspector, or the SystemJS loader variants.
- Porting every `demo/` app. `demo-mf2/` starts with a minimal set.

---

## Architecture

```
                 federation-js backend                    MF2 backend
                 ─────────────────────                    ───────────
 page loads      system.js + federation-js                (nothing extra)
                 fynmesh-browser-kernel.min.js            fynmesh-browser-kernel-mf2.min.js
                          │                                         │
                          ▼                                         ▼
                 browser-kernel.ts                        browser-kernel-mf2.ts
                 Federation.import(entry)                 MF2 host instance (createInstance)
                          │                                 registerRemotes + loadRemote
                          │                                         │
                          └──────────► FynAppEntry-shaped ◄─────────┘
                                       object
                                          │
                                          ▼
                              kernel-core (shared, unchanged)
                              module-loader, lifecycle, middleware,
                              FynBus, bootstrap-coordinator

 app build       Rollup + rollup-plugin-federation        Vite + @module-federation/vite
                 → fynapp-entry.js (System.register)      → remoteEntry.js (ESM)
                 → fynapp.manifest.json                   → fynapp.manifest.json (+ mf2 block)
```

The key idea: **the MF2 backend hands `kernel-core` an object shaped like today's `FynAppEntry`.**
Everything above that object changes. Everything below it does not.

---

## 1. The kernel seam

`kernel-core` and `module-loader` read these fields off a loaded entry:

| Field / call | Read at | MF2 adapter supplies it from |
| --- | --- | --- |
| `container.name`, `container.version` | `kernel-core.ts:342`, `module-loader.ts:196` | `fynapp.manifest.json` `name` / `version` (the logical identity) |
| `container.$E` (expose map) | `kernel-core.ts:404`, `module-loader.ts:90,234` | `fynapp.manifest.json` `exposes` |
| `container.$SS` (already-initialized guard) | `module-loader.ts:212` | Set by the adapter after its first `init()` |
| `init()` | `module-loader.ts:216` | No-op. MF2 initializes a remote on its first `loadRemote` |
| `get(expose)` → `() => module` | `module-loader.ts:109,235` | `host.loadRemote(containerName + expose.slice(1))`, wrapped as `() => mod` |
| `container.__FYNAPP_MANIFEST__` | `module-loader.ts:265` | The fetched `fynapp.manifest.json` object |

Only the backend-specific files change:

| File | federation-js | MF2 |
| --- | --- | --- |
| Browser kernel | `browser-kernel.ts`: `Federation.import(url)` | New `browser-kernel-mf2.ts`: fetch manifest, register remote, build adapter |
| Manifest tier 1 | `manifest-resolver.ts:168` imports the entry to read the embedded manifest | Skip tier 1. Tier 2 (`fynapp.manifest.json`) already exists and becomes the only source |
| Combine URLs | `browser-kernel.ts:61` `Federation.bundleUrlFor` | Not present. That call already falls back to the plain URL |
| Entry preload | Classic `<script>` preload of `fynapp-entry.js` | `modulepreload` of `remoteEntry.js`, or none in v1 |

`manifest-resolver.ts` needs one switch so tier 1 is skipped. The cleanest form is a resolver option
set by the MF2 browser kernel. `getFederation()` must not be called on the MF2 path.

### New kernel bundles

`core/kernel/rollup.config.ts` gains two outputs:

- `dist/fynmesh-browser-kernel-mf2.dev.js` from `src/browser-mf2-dev.ts`
- `dist/fynmesh-browser-kernel-mf2.min.js` from `src/browser-mf2.ts`

These two builds add `@rollup/plugin-node-resolve`. It bundles `@module-federation/runtime` into
the kernel. The federation-js bundles keep their current config. `semver-range.ts:9` explains why
that config has no resolver.

---

## 2. Container naming and version addressing

**Problem.** An MF2 host keys remotes by `name`. `registerRemote` rejects a second remote with the
same name (`runtime-core/src/remote/index.ts:691`). With `force`, it replaces the first one. The
loaded module cache is keyed by name too (`remote/index.ts:530,738`). So `fynapp-x1@1.0.0` and
`fynapp-x1@2.0.0` cannot both register as `fynapp-x1`. The entry cache is not the issue. Its key is
name plus entry URL (`utils/load.ts:330`).

**Decision.** Each MF2 build gets a **version-unique container name**. The logical name stays in the
FynApp manifest.

| | Value for `fynapp-x1` 2.0.0 |
| --- | --- |
| Logical name (kernel, manifest, imports) | `fynapp-x1` |
| MF2 container name (build `name`, `registerRemotes`) | `fynapp_x1__2_0_0` (candidate) |

The candidate encoding turns every character outside `[A-Za-z0-9_]` into `_`. Then it joins name
and version with `__`. Phase 1 finds out which characters MF2 accepts.

The build writes the container name into the manifest:

```json
{
  "name": "fynapp-x1",
  "version": "2.0.0",
  "exposes": { "./main": "src/main.ts" },
  "import-exposed": { },
  "shared-providers": { },
  "mf2": { "container": "fynapp_x1__2_0_0", "entry": "remoteEntry.js" }
}
```

**Range resolution** stays in the kernel. It works the same as today:

1. Code calls `import("fynapp-x1/main", { with: { type: "mf-expose", semver: "^2.0.0" } })`.
2. The build rewrites it to `globalThis.fynMeshKernel.importExpose("fynapp-x1", "./main", "^2.0.0")`.
3. `importExpose` looks for a loaded `fynapp-x1` whose version satisfies the range. It uses
   `semver-range.ts`.
4. If none is loaded, it asks the registry resolver for `(name, range)`. Then it loads that app.
5. It returns the module from the adapter's `get("./main")`.

Step 4 rarely runs. The manifest's `import-exposed` already lists `fynapp-x1` with its range.
`buildGraph` reads that and loads x1 before the consumer bootstraps.

`importExpose` is a new public kernel method. Only the MF2 kernel needs it. The federation-js build
keeps emitting `Federation._importExpose`.

---

## 3. Share scope

The kernel creates **one** MF2 host instance at startup:

```ts
const host = createInstance({
  name: "fynmesh-kernel",
  remotes: [],
  shared: {},
  shareStrategy: "loaded-first", // to confirm in phase 1
});
```

Every FynApp registers as a remote of this host with `shareScope: "fynmesh"`. MF2 passes the host's
share scope map to each remote's `init`. The remote adds its provided packages to that map
(`runtime-core/src/module/index.ts:194-234`). Every loaded FynApp then resolves from the same map.
This is FynMesh's "join by loading" behavior, with the kernel as the only composer.

FynApp builds declare shared packages the way `create-fynapp` does today. `react`, `react-dom` and
`react-dom/client` are singletons with `requiredVersion` from `package.json`. React 18 and 19 on one
page rely on each app's `requiredVersion`. If that is not enough, those apps turn off `singleton`.

**Strategy choice.** The default `version-first` initializes every registered remote during
`initializeSharing()`. The source marks that behavior for removal
(`runtime-core/src/shared/index.ts:576,581-585`). `loaded-first` skips that eager init. Both keep an
already-loaded copy. Phase 1 tests both.

---

## 4. App build

`create-fynapp` gains a second factory next to `createFynAppRollupConfig`:

```ts
// demo-mf2/<app>/vite.config.ts
import { createFynAppViteConfig } from "create-fynapp/mf2";

export default createFynAppViteConfig({
  name: "fynapp-x1",
  framework: "react",
  exposes: {},            // "./main" added automatically, as today
});
```

It assembles:

1. The framework's Vite plugin (`@vitejs/plugin-react`, `@vitejs/plugin-vue`, …).
2. **`fynmesh-imports`**, a FynMesh plugin with a `transform` hook. It finds dynamic imports with
   `with: { type: "fynapp-middleware" | "mf-expose" }`, records each one for the manifest, and rewrites
   it:
   - `fynapp-middleware` → the same `-FYNAPP_MIDDLEWARE <pkg> <request> <semver>` string as today
     (`create-fynapp/src/index.ts:238-246`).
   - `mf-expose` → `globalThis.fynMeshKernel.importExpose(<pkg>, <expose>, <semver>)`.
3. `@module-federation/vite` with `name` set to the encoded container name, `filename:
   "remoteEntry.js"`, `shareScope: "fynmesh"`, `exposes`, and `shared`.
4. **`fynmesh-manifest`**, a FynMesh plugin with a `generateBundle` hook. It emits
   `fynapp.manifest.json` with these fields:
   - `name`, `version`, `exposes`
   - `import-exposed`, from the recorded imports
   - `shared-providers`, from the `shared` config
   - the `mf2` block

Today's manifest logic is in `create-fynapp/src/index.ts:380-420`. It reads `rollup-plugin-federation`'s
`baseManifest.dynamicImports`. The MF2 plugin feeds the same code from its own records. The output
shape stays identical.

The plugin uses `transform`, not Rollup's `resolveDynamicImport`. A transform also runs under the
Vite dev server, so dev mode can come later without a rewrite.

---

## 5. `demo-mf2/`

```
demo-mf2/
  demo-server/        static server, registry resolver, shell.html, demo.html
  fynapp-shell-mw/    shell layout middleware provider
  fynapp-design-tokens/ middleware provider
  fynapp-x1-v1/       logical fynapp-x1 @ 1.x
  fynapp-x1-v2/       logical fynapp-x1 @ 2.x
  fynapp-react-18/    consumes x1 ^1, design tokens
  fynapp-react-19/    consumes x1 ^2, design tokens
  fynapp-4-vue/       non-React framework check
```

- `fynpo.json` uses `autoSearch`, so `demo-mf2/*` packages are picked up without config changes.
- Root scripts: `bootstrap:mf2` builds the MF2 kernel and `demo-mf2`, and `start:mf2` starts the
  server. The default port is 3100, so it can run beside `demo/` on 3000. `PORT` overrides it.
- The registry resolver matches today's demo server: `/<name>/dist/fynapp.manifest.json`, with the
  version directory chosen by range.
- App sources are copied from `demo/` and only the build config changes. Source edits are limited to
  what the MF2 build requires.

---

## 6. What changes on MF2

| Lost | Gained |
| --- | --- |
| Manifest embedded in the entry (saves one request per app) | MF2 preload, DevTools, snapshot tooling (not used in v1) |
| `federation-combine` request reduction | Vite ecosystem, native ESM output |
| `Federation.__I()` registry inspector | MF2 runtime plugin hooks (retry, fallback, observability) |
| Per-chunk importer-range sets | Per-module `requiredVersion`, per-share scopes, prefix sharing |
| ~8.7 KB gz loader layer | Larger runtime in the kernel bundle. Each Vite remote may also carry its own adapter (unmeasured) |

`kernel.__I()` keeps working, since it reads kernel state, not federation state.

---

## 7. Open questions (answered in phase 1)

1. Which characters can an MF2 container `name` use? The answer fixes the encoding in §2.
2. Can a host with no build load a Vite ESM `remoteEntry.js`? The runtime accepts `esm` and
   `module` types (`utils/load.ts:48`). The Vite side is unconfirmed.
3. Which strategy gives one React 18 across React-18 apps in any load order? The same strategy must
   still give a React-19 app its React 19.
4. Can a `@module-federation/vite` build set `shareScope: "fynmesh"`? Does its `init` accept a scope
   map from outside?
5. How big is the kernel bundle with the MF2 runtime inside? How much runtime does each Vite remote
   carry?

The Vite plugin lives in a separate repo with no local checkout yet. Phase 1 installs it and answers
2, 4 and 5 by running it.

---

## 8. Plan

Each phase ends with a pass check. A phase only starts after the one before it passes.

### Phase 1 — spike (go / no-go)

Work in `demo-mf2/spike/`. It gets thrown away once phase 4 lands.

- Build `fynapp-x1` 1.0.0 and 2.0.0 with plain `@module-federation/vite`, using encoded names.
- Build one plain React-18 remote that shares `react` as a singleton.
- Write a static `index.html` that bundles `@module-federation/runtime`, creates one host, registers
  all three, and loads `./main` from each.
- Try both share strategies.

**Pass:**
- v1 and v2 load on one page. Each reports its own version.
- One copy of React 18 loads.
- `host.loadRemote` resolves every expose.
- Questions 1–5 in §7 have written answers.

**Fail:** two versions can't coexist even with unique names. Then stop and revise §2.

### Phase 2 — MF2 kernel bundle

- Add `browser-kernel-mf2.ts`, `browser-mf2.ts` and `browser-mf2-dev.ts`.
- Add the entry adapter (§1), the manifest-resolver tier-1 switch, and `importExpose` (§2).
- Add the two rollup outputs.
- Add kernel tests with a stubbed MF2 host: adapter fields, re-load guard, range resolution in
  `importExpose`.

**Pass:**
- `fyn test` in `core/kernel` is green, new tests included.
- The phase-1 page runs on the MF2 kernel bundle. It loads x1 v1 and v2 and bootstraps each `./main`.
- Kernel lifecycle events fire in order.

### Phase 3 — `create-fynapp` MF2 factory

- Add `createFynAppViteConfig` under a `create-fynapp/mf2` export.
- Add the `fynmesh-imports` and `fynmesh-manifest` plugins.
- Pull the `import-exposed` shape-building code out so both factories use it.
- Add unit tests for the rewrite output and the emitted manifest.

**Pass:**
- Tests are green.
- A test app built with the factory emits `remoteEntry.js` and `fynapp.manifest.json`.
- Its `import-exposed` matches the Rollup factory's output for the same source.

### Phase 4 — `demo-mf2/` minimal set

- Add `demo-mf2/demo-server` and the seven apps in §5.
- Add the `bootstrap:mf2` and `start:mf2` root scripts.
- Delete `demo-mf2/spike/`.

**Pass:** after `fyn bootstrap:mf2 && fyn start:mf2`, `http://localhost:3100/shell.html` shows:
- Every app renders.
- The React-18 app shows x1 v1. The React-19 app shows x1 v2.
- Design tokens reach both.
- The network tab shows one React 18 and one React 19.
- No console errors.

### Phase 5 — widen (optional)

Port more `demo/` apps as needed (Marko, Solid, Svelte, Preact, middleware-mismatch). Record kernel
bundle and per-app sizes next to the federation-js numbers.

### Work split

| Task | Nature | Owner |
| --- | --- | --- |
| Phase 1 spike, §7 answers | Investigation, judgment calls | Main session |
| Phase 2 adapter and `importExpose` | Design-sensitive | Main session |
| Phase 2 rollup outputs, test scaffolding | Mechanical | Subagent |
| Phase 3 plugins | Design-sensitive | Main session |
| Phase 3 unit tests | Mechanical | Subagent |
| Phase 4 app ports (copy source, write `vite.config.ts`) | Mechanical, parallel per app | Subagents |
| Phase 4 demo server | Mostly mechanical | Subagent |

---

## References

- MF2 runtime source: `/Users/joel.chen/dev/module-federation-core` @ `c38c4c0e4`
  - `packages/runtime-core/src/remote/index.ts` — remote registration, name keying
  - `packages/runtime-core/src/utils/load.ts` — entry loading, ESM types, entry cache key
  - `packages/runtime-core/src/type/config.ts` — `RemoteInfo`, `Shared`, `ShareScopeMap`
  - `packages/runtime-core/src/module/index.ts:194-234` — remote `init` with the host share scope
- MF2 Vite examples: `/Users/joel.chen/dev/module-federation-examples/module-federation-vite-*`
- Docs: <https://module-federation.io> (each page is also served as `.md`)
- FynMesh kernel seam: `core/kernel/src/{browser-kernel.ts,kernel-core.ts,modules/module-loader.ts,modules/manifest-resolver.ts}`
- FynApp contract: `dev-tools/create-fynapp/agent/CONTRACT.md`
