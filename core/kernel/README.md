# FynMesh Kernel

The FynMesh kernel is a generic lifecycle engine for micro-frontend orchestration. It manages FynApp loading, middleware coordination, and bootstrap dependencies while remaining agnostic to specific frameworks or rendering strategies.

**FynMesh:** [Website](https://www.fynmesh.fyi) · [Demo](https://www.fynmesh.fyi/demo) · [Shell demo](https://www.fynmesh.fyi/shell)

## Overview

The kernel provides:

1. **FynApp Loading**: Load and initialize FynApps via Module Federation
2. **Middleware System**: Extensible middleware for cross-cutting concerns
3. **Bootstrap Coordination**: Dependency resolution between FynApps
4. **Lifecycle Management**: Setup, apply, execute phases for FynUnits

### What the kernel reads about a FynApp

Everything the kernel knows before running a FynApp comes from that FynApp's **manifest**,
which the build emits in two copies with identical content: embedded in `fynapp-entry.js` as
`__FYNAPP_MANIFEST__`, and as `dist/fynapp.manifest.json`. The embedded copy is preferred
because the entry file is fetched regardless, so reading it costs no extra request.

The manifest fields that drive loading are `requires`, `import-exposed`, and
`shared-providers` — `manifest-resolver.ts` walks them to build the dependency graph, and
`module-loader.ts` re-reads `import-exposed` off the container to register middleware from
provider FynApps. That second read has **no fallback**; the rest of the chain does.

**→ [Build artifacts reference](../../notes/BUILD-ARTIFACTS.md)** for the exact shapes, the
four-tier resolution chain, and what each fallback does and does not recover.

## Installation

```bash
fyn add @fynmesh/kernel
```

## Core Concepts

### FynUnit

A `FynUnit` is the execution contract for a FynApp's main module. It can be:

- A simple function
- An object with `execute` method
- A class instance with `initialize` and `execute` methods
- Any of the above wrapped with `useMiddleware()`

```typescript
// Simple function
export const main = (runtime: FynUnitRuntime) => {
  // execution logic
};

// Object with execute
export const main = {
  initialize(runtime: FynUnitRuntime) {
    return { status: "ready" };
  },
  execute(runtime: FynUnitRuntime) {
    return { type: "component-factory", componentFactory: () => MyComponent };
  }
};

// With middleware (see "Using Middleware" for the full declaration)
export const main = useMiddleware(
  {
    mw: import("fynapp-design-tokens/middleware/design-tokens/design-tokens",
      { with: { type: "fynapp-middleware" } }),
    config: {}
  },
  {
    execute(runtime) {
      return { type: "react-component", component: MyApp };
    }
  }
);
```

### FynUnitRuntime

The runtime context provided to FynUnits during execution:

```typescript
type FynUnitRuntime = {
  fynApp: FynApp;
  middlewareContext: Map<string, Record<string, any>>;
  bus?: FynBus; // present when the bus add-on is installed
  [key: string]: any; // middleware may add more fields
};
```

The kernel itself is the global `fynMeshKernel`. It is not a field of the runtime.

### Middleware

Middleware intercept and extend FynUnit execution:

```typescript
type FynAppMiddleware = {
  name: string;

  // Auto-apply without useMiddleware(); explicit useMiddleware() always works
  autoApplyScope?: ("all" | "fynapp" | "middleware")[];
  shouldApply?(fynApp: FynApp): boolean;

  // Setup phase - initialize middleware state
  setup?(context: FynAppMiddlewareCallContext): Promise<{ status: string; share?: any } | void>;

  // Apply phase - provide APIs to FynUnit
  apply?(context: FynAppMiddlewareCallContext): Promise<void> | void;

  // Override execution - take control of FynUnit execution
  canOverrideExecution?(fynApp: FynApp, fynUnit: FynUnit): boolean;
  overrideInitialize?(context: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }>;
  overrideExecute?(context: FynAppMiddlewareCallContext): Promise<void>;
};
```

### Execution Paths

The kernel supports 2 execution paths:

**Path 1: Simple Function**
```typescript
export const main = (runtime: FynUnitRuntime) => {
  // Kernel wraps as { execute: fn }
};
```

**Path 2: FynUnit Object (with or without middleware)**
```typescript
// Without middleware - auto-apply middleware only
export const main = {
  execute(runtime) { /* ... */ }
};

// With middleware - full middleware coordination
export const main = useMiddleware({ mw: import(/* ... */), config: {} }, {
  execute(runtime) { /* ... */ }
});
```

### Execution Flow

```
1. Load FynApp entry module
2. Validate FynUnit (check for execute method or function)
3. Load middleware dependencies (from __middlewareMeta)
4. For each middleware:
   a. setup() - Initialize middleware
   b. apply() - Inject APIs into middlewareContext
5. Call FynUnit.initialize() (or middleware override)
6. Call FynUnit.execute() (or middleware override)
7. Signal bootstrap complete (FYNAPP_BOOTSTRAPPED)
```

### Runtime Validation

The kernel validates FynUnit shape at runtime:

```typescript
// Valid FynUnits:
export const main = (runtime) => {};           // Function
export const main = { execute(runtime) {} };   // Object with execute
export const main = new MyClass();             // Class instance with execute

// Invalid - will throw error:
export const main = {};                        // No execute method
export const main = { run() {} };              // Wrong method name
```

## Bundles and Add-ons

The core kernel loads, orders and bootstraps FynApps. Everything else is an add-on.

| Add-on | Adds |
| --- | --- |
| middleware | `registerMiddleware`, `getMiddleware`, `getMiddlewareRegistry`, `signalMiddlewareReady`, auto-apply, execution overrides |
| bus | `kernel.bus` and per-app `runtime.bus` |
| telemetry | `kernel.setTelemetry(config)` |
| dev-overlay | an on-page panel for bootstrap failures (dev only) |

Browser bundles in `dist/`:

| File | Contents |
| --- | --- |
| `fynmesh-browser-kernel.{dev,min}.js` | core and every add-on; the dev one also has the overlay |
| `fynmesh-kernel-core.{dev,min}.js` | core only |
| `fynmesh-kernel-middleware.{dev,min}.js` | middleware add-on |
| `fynmesh-kernel-bus.{dev,min}.js` | bus add-on |
| `fynmesh-kernel-telemetry.{dev,min}.js` | telemetry add-on |
| `fynmesh-kernel-dev-overlay.dev.js` | dev overlay add-on |

Load core first. Each add-on installs itself into `globalThis.fynMeshKernel` when it runs, and throws if core is missing.
Order among add-ons does not matter, and loading one twice is harmless.

```html
<script src="fynmesh-kernel-core.min.js"></script>
<script src="fynmesh-kernel-middleware.min.js"></script>
<script src="fynmesh-kernel-bus.min.js"></script>
```

To ship one file, concatenate them with core first:

```sh
cat fynmesh-kernel-core.min.js fynmesh-kernel-middleware.min.js fynmesh-kernel-bus.min.js > kernel.js
```

Without the middleware add-on, a FynUnit runs as plain `initialize` then `execute`.
A unit that declares middleware gets a console warning.

## Usage

### Basic Kernel Setup

A host page loads the kernel as a script. The browser bundle creates the global `fynMeshKernel`. There is no class to construct.

Load order matters. SystemJS comes first, then federation-js, then the kernel bundle. Each one reads the global the previous one defines. Script paths depend on your deployment.

```html
<script src="/path/to/system.min.js"></script>
<script src="/path/to/federation-js.min.js"></script>
<script src="/path/to/fynmesh-browser-kernel.min.js"></script>
```

`fynmesh-browser-kernel.{dev,min}.js` includes core and every add-on, so it is the simplest choice. For a smaller page, load `fynmesh-kernel-core.min.js` plus only the add-ons you need. See [Bundles and Add-ons](#bundles-and-add-ons).

The kernel ships with a demo resolver that maps a name to `/<name>/dist/fynapp.manifest.json`. A real host sets its own resolver, then asks for FynApps by name and optional semver range.

```html
<script>
  (async () => {
    fynMeshKernel.setRegistryResolver(async (name, range) => ({
      name,
      version: "1.0.0", // resolved version; keys the dependency graph
      url: `https://cdn.example.com/${name}/dist/fynapp.manifest.json`,
      distBase: `https://cdn.example.com/${name}/dist/` // optional
    }));

    await fynMeshKernel.loadFynAppsByName(
      [{ name: "fynapp-1" }, { name: "fynapp-x1", range: "^2.0.0" }],
      { concurrency: 4, preload: 1 }
    );
  })();
</script>
```

The resolver returns a `RegistryResolverResult`: `name`, `version`, `url` (manifest), and optional `distBase`. Give each distinct version its own `version` so the dependency graph can tell them apart.

`loadFynAppsByName` takes `LoadFynAppsOptions`:

| Option | Meaning |
| --- | --- |
| `concurrency` | Max FynApps loaded in parallel. Default 4. |
| `preload` | A number (dependency depth to preload, default 1) or a `PreloadStrategy` object: `depth`, `priority`, `priorityByDepth`, `disabled`. |

It rejects when the batch cannot be planned, for example when no resolver is set. A single FynApp that fails to load does not abort the batch.

### Using Middleware

A FynApp declares the middleware it needs with `useMiddleware(meta, unit)`. Each declaration has an `mw` import and a `config`. The import must carry the `fynapp-middleware` attribute, and the specifier is `<package>/<exposeModule>/<middlewareName>`. The build turns it into an id string the kernel can read.

```typescript
import { useMiddleware } from "@fynmesh/kernel";

const unit = {
  initialize(runtime) {
    return { status: "ready" };
  },
  execute(runtime) {
    const tokens = runtime.middlewareContext.get("design-tokens");
    return { type: "react-component", component: MyComponent };
  }
};

export const main = useMiddleware(
  {
    mw: import("fynapp-design-tokens/middleware/design-tokens/design-tokens",
      { with: { type: "fynapp-middleware" } }),
    config: { theme: "fynmesh-default", cssCustomProperties: true }
  },
  unit
);
```

`config` is passed to the provider as `context.meta.config`. Pass an array to use several middleware.

The provider is a remote FynApp, so TypeScript has no types for its modules. Declare each provider once in a `.d.ts` file of the consumer, and every import from it type-checks:

```typescript
// src/remotes.d.ts
declare module "fynapp-design-tokens/*";
```

Each declaration is a `MiddlewareDeclaration`. Besides `{ mw, config }`, the kernel accepts a bare `mw` import, and `{ info: { name, provider, version? }, config }`, which looks up a middleware that is already registered by name and provider.

### Creating Middleware

A middleware provider is a FynApp that exposes a `./middleware*` module. The kernel scans every expose whose key starts with `./middleware`. It registers each export whose name starts with `__middleware__`.

```typescript
import type { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

class GreetingMiddleware implements FynAppMiddleware {
  name = "greeting";

  async setup(context: FynAppMiddlewareCallContext) {
    return { status: "ready" };
  }

  apply(context: FynAppMiddlewareCallContext) {
    // Provide an API to the FynUnit
    context.runtime.middlewareContext.set(this.name, {
      greet: (who: string) => `Hello, ${who}!`
    });
  }
}

export const __middleware__Greeting = new GreetingMiddleware();
```

Expose the module in the provider's federation config, for example `exposes: { "./middleware/greeting": "./src/middleware/greeting.ts" }`. A consumer then imports `<package>/middleware/greeting/greeting`. A provider still needs its own `src/main.ts`.

### Middleware Override Priority

A middleware can take over execution of a FynUnit. Only auto-applied middleware are asked, so set `autoApplyScope` on the middleware. **First-come-first-serve** applies:
- The first middleware with `canOverrideExecution(fynApp, fynUnit) === true` wins
- That middleware's `overrideInitialize()` and `overrideExecute()` are called
- Other middleware still run setup/apply phases

```typescript
// Shell middleware overrides every FynApp it applies to
autoApplyScope = ["fynapp", "middleware"];

canOverrideExecution(fynApp, fynUnit) {
  return true; // Takes control of rendering
}
```

## API Reference

### FynMeshKernel

The global `fynMeshKernel` implements this interface. `@fynmesh/kernel` exports it as a type.

```typescript
interface FynMeshKernel {
  events: FynAppEventTarget;   // emitter of kernel events, has on() and once()
  version: string;             // kernel version
  shareScopeName: string;      // federation share scope name

  use(addon: KernelAddon): void;                                  // install an add-on, no-op if already installed
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData;      // set the kernel runtime data
  setRegistryResolver(resolver: RegistryResolver): void;          // map name and range to a manifest URL

  loadFynAppsByName(                                              // load FynApps and their dependencies
    requests: Array<{ name: string; range?: string }>,
    options?: LoadFynAppsOptions
  ): Promise<void>;
  loadFynApp(baseUrl: string, loadId?: string): Promise<FynApp | null>; // load and bootstrap one FynApp, null on failure
  loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp>;    // load entry, config and main, run nothing
  bootstrapFynApp(fynApp: FynApp): Promise<void>;                 // run a loaded FynApp

  shutdownFynApp(name: string): Promise<boolean>;                 // call shutdown() and remove the FynApp
  suspendFynApp(name: string): Promise<boolean>;                  // call suspend() on a mounted FynApp
  resumeFynApp(name: string): Promise<boolean>;                   // call resume() on a suspended FynApp
  getFynAppState(name: string): FynAppState | undefined;          // "name" or "name@version"
  listFynAppStates(): FynAppState[];                              // state of every tracked FynApp

  emitAsync(event: CustomEvent): Promise<boolean>;                // dispatch an event on the kernel
}
```

Each add-on adds its own API to `fynMeshKernel` once installed:

- `MiddlewareKernelApi`: `registerMiddleware`, `getMiddleware`, `getMiddlewareRegistry`, `signalMiddlewareReady`
- `BusKernelApi`: `bus`
- `TelemetryKernelApi`: `setTelemetry(config?)`

### Kernel Configuration

The kernel has no constructor config. The browser bundle creates it for you.

- Registry: `setRegistryResolver(resolver)`
- Batch loading: `LoadFynAppsOptions` on `loadFynAppsByName`
- Telemetry: `setTelemetry({ transport?, maxBufferSize? })` from the telemetry add-on
- Bootstrap timeout: fixed at 30 seconds

### FynUnit

```typescript
interface FynUnit {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
  initialize?(runtime: FynUnitRuntime): Promise<{ status: string; mode?: string }> | { status: string; mode?: string };
  execute(runtime: FynUnitRuntime): Promise<any> | any;
  shutdown?(runtime: FynUnitRuntime): Promise<void> | void; // on shutdownFynApp
  suspend?(runtime: FynUnitRuntime): Promise<void> | void;  // on suspendFynApp
  resume?(runtime: FynUnitRuntime): Promise<void> | void;   // on resumeFynApp
}

// Deprecated aliases (for backwards compatibility)
type FynModule = FynUnit;
type FynModuleRuntime = FynUnitRuntime;
```

### useMiddleware

```typescript
function useMiddleware<T extends FynUnit = FynUnit>(
  meta: MiddlewareUseMeta<unknown> | MiddlewareUseMeta<unknown>[],
  unit: T
): T;

// For middleware that don't need a FynUnit
const noOpFynUnit: FynUnit;
```

## Kernel Events

The kernel emits events for monitoring:

| Event | Description |
|-------|-------------|
| `FYNAPP_LOADING` | FynApp load started (from `loadFynAppsByName`) |
| `FYNAPP_LOADED` | FynApp load attempt ended, `detail.ok` is false on failure |
| `FYNAPP_BOOTSTRAPPED` | Bootstrap completed |
| `FYNAPP_BOOTSTRAP_FAILED` | Bootstrap failed (error isolated) |
| `FYNAPP_BOOTSTRAP_TIMEOUT` | A deferred bootstrap waited too long for its dependencies |
| `FYNAPP_SUSPENDED` | FynApp suspended |
| `FYNAPP_RESUMED` | FynApp resumed |
| `FYNAPP_SHUTDOWN` | FynApp shut down |
| `MIDDLEWARE_READY` | A middleware signaled readiness (middleware add-on) |

## Error Handling

The kernel isolates errors to prevent one FynApp from crashing others:

- Failed FynApps emit `FYNAPP_BOOTSTRAP_FAILED` event but don't crash
- Bootstrap timeouts emit `FYNAPP_BOOTSTRAP_TIMEOUT` after 30s
- Middleware failures are logged but don't block other FynApps

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FynMesh Kernel                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Module    │  │  Middleware  │  │    Bootstrap      │  │
│  │   Loader    │  │  Executor    │  │   Coordinator     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Middleware Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Shell     │  │   Design     │  │      React        │  │
│  │   Layout    │  │   Tokens     │  │     Context       │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      FynApps (FynUnits)                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ React   │ │  Vue    │ │ Svelte  │ │ Marko   │  ...     │
│  │ 18/19   │ │  3.x    │ │  4.x    │ │  5.x    │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## Design Principles

1. **Generic Lifecycle Engine**: The kernel orchestrates lifecycle, middleware define contracts
2. **Framework Agnostic**: No React, Vue, or UI concepts in kernel core
3. **Code-First Configuration**: `useMiddleware()` provides type safety and IDE support
4. **Error Isolation**: Failed FynApps don't crash the system ("party goes on")
5. **Timeout Enforcement**: Bootstrap dependencies time out after 30s

## UI Types in Middleware (Not Kernel)

The kernel returns `any` from `execute()` - it has no knowledge of UI rendering. Middleware packages define their own result contracts:

```typescript
// Shell middleware defines its result types (NOT in kernel)
// fynapp-shell-mw/src/middleware/shell-layout.ts
export type ShellExecutionResult =
  | { type: 'component-factory', componentFactory: (React: any) => any }
  | { type: 'rendered-content', content: string | HTMLElement }
  | { type: 'self-managed', container: HTMLElement }
  | { type: 'react-component', component: any, props?: any }
  | { type: 'render-function', render: (container: HTMLElement) => void };
```

FynApps can optionally import these types for compile-time safety:
```typescript
import type { ShellExecutionResult } from 'fynapp-shell-mw';

export const main = {
  execute(runtime): ShellExecutionResult {
    return { type: 'react-component', component: MyApp };
  }
};
```

## Extensibility Patterns

Middleware can define their own conventions for discovering additional FynUnits beyond `main`:

```typescript
// Shell middleware might look for routes
export const __routes__ = [
  { path: '/dashboard', component: Dashboard },
  { path: '/settings', component: Settings }
];

// Test middleware might look for test exports
export const __test__counter = { /* test config */ };

// Worker middleware might look for worker exports
export const __worker__processor = { /* worker config */ };
```

Each middleware becomes a mini-kernel for its domain, processing its own FynUnit conventions.

## See Also

- [Live demos](https://www.fynmesh.fyi/demo) and [guides](https://www.fynmesh.fyi/guides)
- [Execution Override Architecture](https://github.com/jchip/fynmesh/blob/main/core/kernel/design/execution-override-architecture.md)
- [FynApp Middleware Architecture](https://github.com/jchip/fynmesh/blob/main/core/kernel/design/fynapp-middleware-architecture.md)
- [Kernel Add-ons Design](https://github.com/jchip/fynmesh/blob/main/notes/KERNEL-ADDONS-DESIGN.md)

## License

Apache-2.0
