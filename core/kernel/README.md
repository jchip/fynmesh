# FynMesh Kernel

The FynMesh kernel is a generic lifecycle engine for micro-frontend orchestration. It manages FynApp loading, middleware coordination, and bootstrap dependencies while remaining agnostic to specific frameworks or rendering strategies.

## Overview

The kernel provides:

1. **FynApp Loading**: Load and initialize FynApps via Module Federation
2. **Middleware System**: Extensible middleware for cross-cutting concerns
3. **Bootstrap Coordination**: Dependency resolution between FynApps
4. **Lifecycle Management**: Setup, apply, execute phases for FynUnits

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

// With middleware
export const main = useMiddleware(
  [
    { middleware: import("fynapp-design-tokens/middleware"), config: {} },
    { middleware: import("fynapp-shell-mw/middleware"), config: {} }
  ],
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
interface FynUnitRuntime {
  kernel: FynMeshKernel;
  fynApp: FynApp;
  middlewareContext: Map<string, any>;
}
```

### Middleware

Middleware intercept and extend FynUnit execution:

```typescript
interface FynAppMiddleware {
  name: string;

  // Setup phase - initialize middleware state
  setup?(context: FynAppMiddlewareSetupContext): Promise<MiddlewareSetupResult>;

  // Apply phase - provide APIs to FynUnit
  apply?(context: FynAppMiddlewareCallContext): Promise<void>;

  // Override execution - take control of FynUnit execution
  canOverrideExecution?(fynUnit: FynUnit, fynApp: FynApp): boolean;
  overrideInitialize?(context: FynAppMiddlewareCallContext): Promise<InitializeResult>;
  overrideExecute?(context: FynAppMiddlewareCallContext): Promise<any>;
}
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
export const main = useMiddleware([...], {
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
7. Signal bootstrap complete
```

### Runtime Validation

The kernel validates FynUnit shape at runtime:

```typescript
// Valid FynUnits:
export const main = (runtime) => {};           // Function
export const main = { execute(runtime) {} };   // Object with execute
export const main = new MyClass();             // Class instance with execute
export class main { static execute(runtime) {} } // Class with static execute

// Invalid - will throw error:
export const main = {};                        // No execute method
export const main = { run() {} };              // Wrong method name
```

## Usage

### Basic Kernel Setup

```typescript
import { FynMeshKernel } from "@fynmesh/kernel";

const kernel = new FynMeshKernel({
  debug: true,
  bootstrapTimeout: 30000
});

// Load a FynApp
await kernel.loadFynApp("/path/to/fynapp/dist");
```

### Using Middleware

```typescript
import { useMiddleware } from "@fynmesh/kernel";

const middlewareUser = {
  initialize(runtime) {
    const designTokens = runtime.middlewareContext.get("design-tokens");
    return { status: "ready" };
  },
  execute(runtime) {
    const shell = runtime.middlewareContext.get("shell-layout");
    return {
      type: "react-component",
      component: MyComponent
    };
  }
};

export const main = useMiddleware(
  [
    { middleware: import("fynapp-design-tokens/middleware/design-tokens") },
    { middleware: import("fynapp-shell-mw/middleware/shell-layout") }
  ],
  middlewareUser
);
```

### Creating Middleware

```typescript
import type { FynAppMiddleware } from "@fynmesh/kernel";

export const myMiddleware: FynAppMiddleware = {
  name: "my-middleware",

  async setup(context) {
    // Initialize middleware state
    return { status: "ready" };
  },

  async apply(context) {
    // Provide API to FynUnit
    context.runtime.middlewareContext.set("my-middleware", {
      doSomething: () => { /* ... */ }
    });
  },

  canOverrideExecution(fynUnit, fynApp) {
    // Return true to take control of execution
    return false;
  }
};
```

### Middleware Override Priority

When multiple middleware can override execution, **first-come-first-serve** applies:
- First middleware with `canOverrideExecution() === true` wins
- That middleware's `overrideInitialize()` and `overrideExecute()` are called
- Other middleware still run setup/apply phases

```typescript
// Shell middleware typically overrides all FynApps
canOverrideExecution(fynUnit, fynApp) {
  return true; // Takes control of rendering
}
```

## API Reference

### FynMeshKernel

```typescript
class FynMeshKernel {
  constructor(config?: KernelConfig);

  // Load a FynApp from a URL
  loadFynApp(urlPath: string): Promise<FynApp>;

  // Get a registered FynApp
  getFynApp(name: string): FynApp | undefined;

  // Register middleware
  registerMiddleware(middleware: FynAppMiddleware): void;

  // Get middleware by name
  getMiddleware(name: string): FynAppMiddleware | undefined;
}
```

### KernelConfig

```typescript
interface KernelConfig {
  debug?: boolean;
  bootstrapTimeout?: number;  // Default: 30000ms
}
```

### FynUnit

```typescript
interface FynUnit {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
  initialize?(runtime: FynUnitRuntime): Promise<InitializeResult> | InitializeResult;
  execute(runtime: FynUnitRuntime): Promise<any> | any;
}

// Deprecated aliases (for backwards compatibility)
type FynModule = FynUnit;
type FynModuleRuntime = FynUnitRuntime;
```

### useMiddleware

```typescript
function useMiddleware<T extends FynUnit = FynUnit>(
  meta: MiddlewareUseMeta | MiddlewareUseMeta[],
  unit: T
): T;

// For middleware that don't need a FynUnit
const noOpFynUnit: FynUnit;
```

## Kernel Events

The kernel emits events for monitoring:

| Event | Description |
|-------|-------------|
| `FYNAPP_LOADING` | FynApp load started |
| `FYNAPP_LOADED` | FynApp loaded successfully |
| `FYNAPP_BOOTSTRAP_STARTED` | Bootstrap phase started |
| `FYNAPP_BOOTSTRAP_COMPLETE` | Bootstrap completed |
| `FYNAPP_BOOTSTRAP_FAILED` | Bootstrap failed (error isolated) |
| `FYNAPP_BOOTSTRAP_TIMEOUT` | Bootstrap exceeded timeout |

## Error Handling

The kernel isolates errors to prevent one FynApp from crashing others:

- Failed FynApps emit `FYNAPP_BOOTSTRAP_FAILED` event but don't crash
- Bootstrap timeouts emit `FYNAPP_BOOTSTRAP_TIMEOUT` after 30s (configurable)
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
5. **Timeout Enforcement**: Bootstrap dependencies have configurable timeouts (30s default)

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

- [Execution Lifecycle Design](../../.design/execution-lifecycle-redesign.md)
- [Middleware Documentation](../../.design/middleware-architecture.md)
- [Demo Server](../../demo/demo-server/README.md)

## License

UNLICENSED
