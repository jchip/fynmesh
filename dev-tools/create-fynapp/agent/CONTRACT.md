# The FynApp Contract

**Audience: LLM coding agents modifying an existing FynApp.** This is the
authoritative, type-anchored contract for what a FynApp *is*. The kernel types and
selected lifecycle/runtime members described here are anchored by
`../src/fynapp-contract.ts`, which is compiled on every build. Additive and
behavioral changes still require a kernel API review. When you change a FynApp,
conform to this contract and then run `cfa check` (see §8).

> Scope note: creating a *new* FynApp is a static, mechanical operation — run the
> `create-fynapp` CLI (see `GUIDE.md`). This document is for *modifying* an
> existing app, which requires understanding the code.

---

## 1. Anatomy

```
<fynapp>/
├── package.json          # "type":"module"; build script "rollup -c"; deps below
├── rollup.config.ts      # THE defining file — federation name, exposes, framework
├── tsconfig.json
├── src/
│   ├── main.ts | main.tsx   # exports `const main` = a FynUnit  (the entry)
│   └── ...                   # App.tsx, middleware/, hooks/, styles.css, …
└── dist/                 # build output
    ├── fynapp-entry.js       # the federation entry the kernel loads (fixed name)
    └── fynapp.manifest.json  # generated manifest (name/version/exposes/…)
```

Two invariants hold for **every** FynApp:
1. `rollup.config.ts` declares a federation `name` and exposes `./main`. For
   `framework: "react"` the helper injects `./main` automatically; for
   non-React frameworks you must list it explicitly (see §3).
2. `src/main.ts` (or `.tsx`) exports `const main` implementing `FynUnit`.

There is **no** `"fynapp"` field in `package.json`; identity lives in
`rollup.config.ts` (`name`) and the generated `dist/fynapp.manifest.json`.

---

## 2. The `FynUnit` contract — what `src/main.ts` exports

Source: `@fynmesh/kernel` → `core/kernel/src/types.ts:121`.

```ts
export interface FynUnit {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
  initialize?(runtime: FynUnitRuntime):
    | Promise<{ status: string; mode?: string }>
    | { status: string; mode?: string };
  execute(runtime: FynUnitRuntime): Promise<any> | any;   // ONLY required method
  shutdown?(runtime: FynUnitRuntime): Promise<void> | void;
  suspend?(runtime: FynUnitRuntime): Promise<void> | void;
  resume?(runtime: FynUnitRuntime): Promise<void> | void;
  [key: string]: any;
}
```

| Method | When | Returns |
|--------|------|---------|
| `initialize(runtime)` | first, before middleware applies | `{ status: "ready" \| "defer", mode?, deferOk? }` |
| `execute(runtime)` | after middleware is ready | a render result (see §5) |
| `shutdown(runtime)` | on unload | `void` — clean up (unmount, remove listeners) |
| `suspend(runtime)` | when a mounted app is paused | `void` — pause timers/subscriptions |
| `resume(runtime)` | when a suspended app is restored | `void` — resume paused work |

`main` may be a **class instance** implementing `FynUnit`, a **plain object**
with at least `execute`, or the return value of **`useMiddleware([...], unit)`**.
A bare function export is also accepted (kernel wraps it as `{ execute: fn }`).

`FynModule` / `FynModuleRuntime` are **deprecated aliases** of `FynUnit` /
`FynUnitRuntime` — do not introduce them in new code.

### `FynUnitRuntime` — the `runtime` argument

`core/kernel/src/types.ts:82`:

```ts
export type FynUnitRuntime = {
  fynApp: FynApp;                                     // { name, version, packageName, entry, exposes, … }
  middlewareContext: Map<string, Record<string, any>>; // read consumed middleware here
  bus?: FynBus;                                       // inter-FynApp messaging
  [key: string]: any;
};
```

`runtime.bus` is the optional per-app messaging facade. It supports ephemeral
`emit`/`on`/`once`, request-response with `request`/`handle`, and isolated named
channels. Subscriptions return an unsubscribe function; release it from
`shutdown` or `suspend` as appropriate. State that late-loading apps must observe
belongs in the middleware state registry, not the bus.

There is **no `runtime.kernel`**. To reach the kernel from a FynUnit, use
`globalThis.fynMeshKernel`.

---

## 3. The `rollup.config.ts` contract

The **default and preferred** form is the high-level factory (this is what
current demo apps use — e.g. `demo/fynapp-6-react/rollup.config.ts`):

```ts
import { createFynAppRollupConfig } from "create-fynapp";

export default createFynAppRollupConfig({
  name: "my-fynapp",           // federation identity — REQUIRED
  framework: "react",          // "react" | "vanilla" | "vue" | … (drives aliases/externals)
  typescript: true,
  exposes: {},                 // "./main" is added automatically
  // extraPlugins: [ newRollupPlugin(postcss)() ],  // for CSS, etc.
});
```

`createFynAppRollupConfig` (`../src/rollup-config-factory.ts`) assembles, in
fixed order: dummy-entry → node-resolve → `extraPlugins` → federation → react
demo alias (only with `reactPackages: "esm-adapters"`) → `extraPluginsAfter` →
typescript → minify (prod).
It always emits SystemJS output to `dist/` with share scope `fynmesh`, input
`[fynappDummyEntryName, fynappEntryFilename]`.

**What the federation configuration guarantees** (`../src/index.ts`):
- For React, the preferred factory always includes `"./main": "./src/main.ts"`.
  The generic low-level `setupFederationPlugins` does **not** inject it — add
  `"./main": "./src/main.ts"` to `exposes` yourself.
- React frameworks consume `react`, `react-dom`, and `react-dom/client` as
  singleton shared packages. Source and `package.json` use those standard public
  packages directly.
- Repository demos that intentionally use the local ESM adapters opt in with
  `reactPackages: "esm-adapters"`. The low-level `setupReactFederationPlugins`
  and `setupReactAliasPlugins` helpers exist for that demo mode.
- `renderDynamicImport` enables the `import(..., { with: { type: "fynapp-middleware" } })`
  syntax used by consumers (§4).
- `enrichManifest` + `emitFederationMeta` produce `dist/fynapp.manifest.json`.

**Escape hatch (advanced):** the low-level form — call
`setupDummyEntryPlugins`, `setupReactFederationPlugins`/`setupFederationPlugins`,
`setupReactAliasPlugins`, `setupMinifyPlugins` yourself and assemble the
`defineConfig([...])` array (see `demo/fynapp-react-middleware/rollup.config.ts`).
Use only when the factory's ordering/options are insufficient.

To expose extra modules (e.g. a middleware), add to `exposes`:

```ts
exposes: { "./middleware/greeting": "./src/middleware/greeting.ts" },
```

---

## 4. Consuming middleware

Declare needs with `useMiddleware` (`core/kernel/src/use-middleware.ts:22`),
then read the provider's published API from `runtime.middlewareContext`:

```ts
import { useMiddleware } from "@fynmesh/kernel";

export const main = useMiddleware(
  {
    // @ts-ignore — TS can't type module-federation remote containers
    middleware: import("fynapp-design-tokens/middleware/design-tokens/design-tokens",
      { with: { type: "fynapp-middleware" } }),
    config: { theme: "fynmesh-default", cssCustomProperties: true },
  },
  new MyUnit(),
);
```

- The import specifier is `<package>/<exposeModule>/<middlewareName>` — e.g.
  `fynapp-design-tokens` + expose `middleware/design-tokens` + middleware
  `design-tokens`.
- `config` is passed to the provider verbatim as `cc.meta.config`. The string
  `"consume-only"` is a common convention meaning "consumer, don't provide".
- Pass an **array** to use several middlewares.
- In `execute`, read the API: `const dt = runtime.middlewareContext.get("design-tokens"); dt?.api?.setTheme(...)`.
- If the provider may load later, return `{ status: "ready", deferOk: true }` from
  `initialize` and handle a missing entry gracefully (re-render on the
  `MIDDLEWARE_READY` kernel event — see §6).

---

## 5. Render results (returned from `execute`)

The shell-layout middleware defines the result contract
(`demo/fynapp-shell-mw/src/middleware/shell-layout.ts`). The common cases:

```ts
// FynApp renders itself into a DOM node it owns:
{ type: "self-managed", target: HTMLElement, cleanup?: () => void }

// The shell renders the FynApp (when shell-managed):
{ type: "component-factory", componentFactory: (React) => ({ component, props }) }

// Cannot render:
{ type: "no-render", message: string }
```

A FynApp that supports both modes branches on
`runtime.middlewareContext.get("shell-layout")?.isShellManaged` inside `execute`.

---

## 6. Authoring a middleware (provider)

A **provider** is a FynApp that exposes one or more `./middleware/*` modules. The
kernel discovers a middleware by finding, in an exposed module, an export whose
name starts with `__middleware__` (marker `MIDDLEWARE_EXPORT_PREFIX`,
`core/kernel/src/util.ts`).

The exported instance implements `FynAppMiddleware`
(`core/kernel/src/types.ts:177`):

```ts
export type FynAppMiddleware = {
  name: string;
  autoApplyScope?: ("all" | "fynapp" | "middleware")[];   // auto-apply w/o useMiddleware
  shouldApply?(fynApp: FynApp): boolean;
  setup?(cc: FynAppMiddlewareCallContext): Promise<{ status: string; share?: any } | void>;
  apply?(cc: FynAppMiddlewareCallContext): Promise<void> | void;
  // execution-override hooks (used by shell-layout):
  canOverrideExecution?(fynApp: FynApp, fynUnit: FynUnit): boolean;   // note arg order
  overrideInitialize?(cc: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }>;
  overrideExecute?(cc: FynAppMiddlewareCallContext): Promise<void>;
};
```

Phases:
1. **`setup(cc)`** — one-time per consuming FynApp. Check `cc.meta.config`.
   Return `{ status: "ready" }`, or `{ status: "defer" }` to postpone the
   consumer's `execute` until readiness is signalled. Signal readiness for
   deferred flows with `await cc.kernel.signalMiddlewareReady(cc, { name, status: "ready" })`.
2. **`apply(cc)`** — integrate. Publish your API for consumers:
   `cc.runtime.middlewareContext.set(this.name, api)`.

`FynAppMiddlewareCallContext` (`core/kernel/src/types.ts:162`) gives you
`{ meta, fynUnit, fynApp, reg, runtime, kernel, status }`.

Minimal shape:

```ts
import type { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

class GreetingMiddleware implements FynAppMiddleware {
  readonly name = "greeting";
  async setup(cc: FynAppMiddlewareCallContext) {
    await cc.kernel.signalMiddlewareReady(cc, { name: this.name, status: "ready" });
    return { status: "ready" };
  }
  apply(cc: FynAppMiddlewareCallContext) {
    cc.runtime.middlewareContext.set(this.name, { greet: (n: string) => `Hello, ${n}!` });
  }
}
export const __middleware__Greeting = new GreetingMiddleware();
```

**Cross-FynApp shared state**: use the reactive registry
`cc.kernel.getMiddlewareRegistry("global")` → `provide(key, data)` /
`lookup(key)` / `waitFor(key, timeoutMs)` (backed by `ObservableState`). See
`demo/fynapp-react-middleware` (`basic-counter`) for the provider/consumer
dual-mode pattern.

A provider still needs `src/main.ts`; if it *only* provides middleware, that file
is just `export {};` (because `./main` is always exposed).

---

## 7. package.json / tsconfig contract

`package.json` essentials:
```jsonc
{
  "type": "module",
  "scripts": { "build": "rm -rf dist && rollup -c", "dev": "rollup -c -w" },
  "devDependencies": {
    "@fynmesh/kernel": "^1.0.0", "create-fynapp": "^1.0.0",
    "rollup": "^4.9.1", "rollup-plugin-federation": "^1.0.0",
    "rollup-wrap-plugin": "^1.0.0", "typescript": "^5.2.2"
    // React apps also: react, react-dom, @rollup/plugin-*, @types/react, rollup-plugin-postcss
  }
}
```
React apps depend on the standard public `react`/`react-dom` packages.

`tsconfig.json`: ESNext/ES2020 module, `moduleResolution: "bundler"`,
`jsx: "react"`, `declaration: true`,
`include: ["src/**/*"]`. Copy an existing app's `tsconfig.json`.

---

## 8. Check (always, after any change)

```bash
cd <fynapp> && cfa check      # builds via rollup + checks the federation output
```

`cfa check` (implemented in `../src/check-fynapp.ts`) builds the app and
asserts `dist/fynapp-entry.js` and a parseable `dist/fynapp.manifest.json` with
`name`, `version`, and the `./main` expose. Use `cfa check --no-build` to check
an existing `dist/`. A change is not done until this passes.

---

## Sources of truth — and stale sources to IGNORE

**Trust:** `@fynmesh/kernel` (types re-exported via `core/kernel/src/index.ts`),
`../src/fynapp-contract.ts` (the compiled anchor), and the working demo apps
`demo/fynapp-6-react` (consumer) and `demo/fynapp-design-tokens` (provider).

**Do NOT trust (stale/aspirational):**
- `core/kernel/examples/simple-usage.ts` — references a non-existent
  `new Kernel(...)` / `loadFynapp` / `getModule` API.
- Any claim that `runtime.kernel` exists — it does not (use `globalThis.fynMeshKernel`).
- `canOverrideExecution` argument order in `execution-override-architecture.md`
  (doc shows `(fynUnit, fynApp)`); the real signature is `(fynApp, fynUnit)`.
- The `{ info: MiddlewareInfo }` form of a consumer declaration — the runtime uses
  the `{ middleware: import(...), config }` form shown in §4.
