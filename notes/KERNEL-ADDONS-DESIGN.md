# Kernel Add-ons Design

Implemented. Non-core capabilities are split out of the browser kernel into add-on bundles.
Each add-on installs itself into `globalThis.fynMeshKernel` when its script runs.
Bundles can also be concatenated into one file, core first.

## Core vs add-ons

| Piece | Where | Source today |
| --- | --- | --- |
| Manifest resolve, dep graph, preload, load, bootstrap lock, lifecycle, events | core | `kernel-core`, `browser-kernel`, `modules/*` minus middleware |
| Middleware: registry, executor, auto-apply, overrides, `MIDDLEWARE_READY`, state registry, semver | `middleware` add-on | `middleware-manager`, `middleware-executor`, `middleware-state-registry`, `observable-state`, `semver-range`, mw parts of `util` |
| FynBus | `bus` add-on | `fyn-bus` |
| Telemetry impl + console transport | `telemetry` add-on | `kernel-telemetry` (`KernelTelemetryImpl`) |
| Bootstrap error overlay | `dev-overlay` add-on | `dev-error-overlay` |

Core keeps the provider/consumer bootstrap wait in `BootstrapCoordinator`. It is small and generic.
Only the middleware add-on calls `registerProviderMode`.

Without the middleware add-on, core runs a FynUnit plainly: `initialize` then `execute`.
A unit carrying `__middlewareMeta` gets a console warning that the add-on is missing.

## Install protocol

```ts
interface KernelAddon {
  name: string;
  install(kernel: FynMeshKernel, hooks: KernelHooks): void;
}
```

- Core exposes `kernel.use(addon)`. Installing the same name twice is a no-op.
- An add-on script calls `globalThis.fynMeshKernel.use(addon)`. It throws if no kernel exists yet.
- So the core script loads first. `cat core.js mw.js bus.js > kernel.js` works; add-on order among themselves does not matter.
- Add-ons must be in place before the first `loadFynApps*` call. Script tags ahead of the page bootstrap code satisfy that.

## Core hooks

The extension points core calls. Each is a list; add-ons push handlers.

| Hook | Called from | Used by |
| --- | --- | --- |
| `exposeLoaded(fynApp, exposeName, module)` | `loadExposeModule` | middleware: scan + register |
| `basicsLoaded(fynApp, manifest)` | end of `loadFynAppBasics` | middleware: proactive `import-exposed` mw deps |
| `beforeMain(fynApp)` | `bootstrapFynApp` | middleware: load `./middleware*` exposes |
| `runUnit(fynApp, fynUnit, runtime) → handled?` | `bootstrapFynApp` | middleware: auto-apply, Path A, overrides |
| `runtime(fynApp, rt)` | `mkRuntime` | bus: `rt.bus` |
| `appGone(fynApp)` | shutdown and bootstrap failure | bus: dispose app |

Add-ons also attach kernel API:

- middleware: `registerMiddleware`, `getMiddleware`, `getMiddlewareRegistry`, `signalMiddlewareReady`.
- bus: `kernel.bus`.
- telemetry: `kernel.setTelemetry(config)`.

Types move with them. `FynMeshKernel` keeps only core members. `MiddlewareKernel` and `BusKernel` extend it.
`FynAppMiddlewareCallContext.kernel` is typed `FynMeshKernel & MiddlewareKernel`.

## Telemetry late binding

Today `kernel.tel` is chosen in the constructor, and modules grab `tel.scope(x)` at construction.
Core will hold a forwarding `tel` whose sink starts as no-op. `scope()` returns forwarders that read the sink at call time.
The telemetry add-on swaps the sink. Core pays a few lines; the impl and transports leave core.

## Mangling across bundles

The min build mangles properties. Separate bundles mangle independently, so every name crossing a bundle must be reserved.
`build/reserved-names.mjs` already reserves every identifier in the public `.d.ts`.
So the hook surface, `KernelAddon`, and add-on APIs are declared in `types.ts`, and they survive by derivation.
Add-ons reach core only through that surface, never through internals like `loader` or `mwMgr`.

## Build outputs (`core/kernel/dist`)

| File | Contents |
| --- | --- |
| `fynmesh-kernel-core.{dev,min}.js` | core only |
| `fynmesh-kernel-middleware.{dev,min}.js` | middleware add-on |
| `fynmesh-kernel-bus.{dev,min}.js` | FynBus add-on |
| `fynmesh-kernel-telemetry.{dev,min}.js` | telemetry add-on |
| `fynmesh-kernel-dev-overlay.dev.js` | overlay add-on (dev only) |
| `fynmesh-browser-kernel.{dev,min}.js` | core + all add-ons, one rollup input |
| `fynmesh-node-kernel.js` | node kernel with all add-ons |
| `index.js` | ESM: types and helpers; add-ons stay out so FynApps importing it do not grow |

Add-on sources live in `src/addons/`, and their bundle entries in `src/entries/`.
`tests/addon-bundles.test.ts` runs the min bundles together in one scope to prove the shared names survive mangling.

## Plan (done)

1. Add `KernelAddon`, `KernelHooks`, `use`, and the queue drain to core. Route existing middleware and bus calls through hooks, still bundled. Verify: all kernel tests pass unchanged.
2. Move middleware into `src/addons/middleware`. Core tests that need middleware install it. Verify: kernel tests pass.
3. Move bus into `src/addons/bus`. Verify: bus tests pass.
4. Telemetry forwarder in core, impl into `src/addons/telemetry`. Verify: telemetry tests pass.
5. Overlay add-on and rollup outputs. Verify: package-artifact test covers new files; core + add-on min bundles install in sequence, and an add-on without core throws (jsdom test).
6. Demo. Verify: `fyn bootstrap`, then `/`, `/shell.html`, `/demo.html` render with no console errors in agent-browser.
