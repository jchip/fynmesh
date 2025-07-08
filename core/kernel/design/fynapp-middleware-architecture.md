# FynApp Middleware Architecture

## Overview

The FynMesh middleware system provides a standardized way for FynApps to share functionality through a kernel-managed middleware registry. The architecture enables middleware providers to offer services and capabilities that consumer FynApps can utilize through a consistent API, while maintaining clean separation and avoiding naming conflicts.

## Core Concepts

### 1. **Middleware Lifecycle**

Middleware follows a two-phase lifecycle for each FynApp:

1. **Setup Phase**: Called for each FynApp that uses the middleware
2. **Apply Phase**: Called after setup for final integration

### 2. **Provider-Consumer Pattern**

- **Provider**: FynApp that implements and exports middleware functionality
- **Consumer**: FynApp that uses middleware through the `useMiddleware` API
- Each middleware usage includes configuration specific to that FynApp's needs

### 3. **FynModule Interface**

FynApps implement the standardized `FynModule` interface:

- `initialize(runtime)`: Optional method called first to determine readiness
- `execute(runtime)`: Required method that does the actual work when middleware is ready

### 4. **Registry and Discovery**

- Middleware are automatically detected through export naming conventions
- Registry uses `provider::middleware-name` format to avoid naming conflicts
- Version tracking based on hosting FynApp version

## Core Architecture Components

### useMiddleware API

```typescript
export const useMiddleware = <UserT extends FynModule = FynModule>(
  meta: MiddlewareUseMeta<unknown>,
  user: UserT,
): MiddlewareUsage<UserT>
```

**Parameters:**

1. **Middleware metadata**: Object with `info` and `config` fields
2. **User module**: Object implementing the `FynModule` interface

### FynModule Interface

```typescript
export interface FynModule {
  initialize?(runtime: FynModuleRuntime): any;
  execute(runtime: FynModuleRuntime): Promise<void> | void;
}

export type FynModuleRuntime = {
  fynApp: FynApp;
  middlewareContext: Map<string, Record<string, any>>;
  [key: string]: any;
};
```

### Middleware Implementation Interface

```typescript
export type FynAppMiddleware = {
  name: string;
  setup?(context: FynAppMiddlewareCallContext): Promise<void> | void;
  apply?(context: FynAppMiddlewareCallContext): Promise<void> | void;
};
```

## Middleware Provider Implementation

### Export Convention

```typescript
export const __middleware__MyMiddleware: FynAppMiddleware = {
  name: "my-middleware",

  async setup(cc: FynAppMiddlewareCallContext): Promise<any> {
    // One-time initialization logic
    return { status: "ready" };
  },

  apply(cc: FynAppMiddlewareCallContext) {
    // Per-FynApp integration logic
  },
};
```

### Middleware Context

```typescript
// Store middleware-specific data for this FynApp
cc.runtime.middlewareContext.set(this.name, middlewareData);

// Retrieve data later
const data = runtime.middlewareContext.get("middleware-name");
```

## FynApp Consumer Implementation

### Basic Usage Pattern

```typescript
import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";

const middlewareUser = {
  initialize(runtime: FynModuleRuntime) {
    return { status: "ready" };
  },

  async execute(runtime: FynModuleRuntime) {
    // Main application logic
    // Access middleware data via runtime.middlewareContext
  },
};

export const main = useMiddleware(
  {
    info: {
      name: "middleware-name",
      provider: "provider-fynapp",
      version: "^1.0.0",
    },
    config: {
      // Middleware-specific configuration
    },
  },
  middlewareUser,
);
```

### Alternative Patterns

```typescript
// Object-based
const middlewareUser = {
  initialize(runtime: FynModuleRuntime) {
    /* ... */
  },
  async execute(runtime: FynModuleRuntime) {
    /* ... */
  },
};

// Class-based
class MiddlewareUser implements FynModule {
  initialize(runtime: FynModuleRuntime) {
    /* ... */
  }
  async execute(runtime: FynModuleRuntime) {
    /* ... */
  }
}
```

## Registry and Discovery

### Automatic Detection

- Module names starting with `./middleware` are scanned
- Exports with `__middleware__` prefix are registered
- Main modules (`./main`) are also scanned for middleware exports

### Registry Structure

```typescript
runTime.middlewares = {
  "provider-fynapp::middleware-name": {
    "1.0.0": {
      fynApp: { name: "provider-fynapp", version: "1.0.0" },
      implementation: MiddlewareImplementation,
    },
  },
};
```

### Middleware Lookup

```typescript
const middleware = kernel.getMiddleware("middleware-name", "provider-fynapp");
```

## Lifecycle Flow

### 1. **Auto-Detection Phase**

- FynApp loads → Kernel scans exposed modules for middleware
- Exports with `__middleware__` prefix are detected and registered

### 2. **Bootstrap Phase**

- Kernel loads FynApp main module
- Detects `useMiddleware` usage objects with `__middlewareMeta` field
- Creates `FynAppMiddlewareCallContext`

### 3. **Setup Phase**

- Middleware `setup()` method called for each FynApp
- Middleware can prepare resources or configurations specific to this FynApp

### 4. **Application Phase**

- User `initialize()` method called (optional readiness check)
- Middleware `apply()` method called for this specific FynApp
- User `execute()` method called when everything is ready

## Best Practices

### FynModule Structure

- Keep `initialize()` lightweight for quick readiness checks
- Put main application logic in `execute()` method
- Return meaningful status information from `initialize()`

### Middleware Design

- Use `setup()` for per-FynApp initialization and configuration
- Use `apply()` for final integration steps for this FynApp
- Store FynApp-specific data in `runtime.middlewareContext`

### Configuration

- Use the `config` field in `useMiddleware` for FynApp-specific settings
- Keep configurations simple and well-documented
- Validate configurations in middleware implementation

### Error Handling

- Provide clear error messages when middleware is not found
- Handle missing or invalid configurations gracefully
- Use try-catch blocks around middleware context access

### Type Safety

- Define TypeScript interfaces for configurations
- Type middleware context data structures
- Use generic types for reusable middleware patterns

## Example: Basic Counter Middleware

### Middleware Implementation

```typescript
export const __middleware__BasicCounter: FynAppMiddleware = {
  name: "basic-counter",

  async setup(cc: FynAppMiddlewareCallContext): Promise<any> {
    const config = cc.meta.config;

    if (config !== "consume-only") {
      const shareKey = `${cc.reg.fullKey}-${cc.fynApp.name}@${cc.fynApp.version}`;
      const initialConfig = { count: 0, ...(config as any) };

      const data = {
        initialConfig,
        config: { ...initialConfig },
        eventTarget: new EventTarget(),

        increment(source?: string) {
          this.config.count++;
          this.eventTarget.dispatchEvent(
            new CustomEvent("counterChanged", {
              detail: { count: this.config.count, source },
            }),
          );
          return this.config.count;
        },

        reset(source?: string) {
          this.config.count = this.initialConfig.count;
          this.eventTarget.dispatchEvent(
            new CustomEvent("counterChanged", {
              detail: { count: this.config.count, source },
            }),
          );
          return this.config.count;
        },
      };

      cc.runtime.middlewareContext.set(this.name, data);
      cc.reg.hostFynApp.middlewareContext.set(shareKey, data);

      cc.kernel.emitAsync(
        new CustomEvent("MIDDLEWARE_READY", {
          detail: { name: this.name, share: { shareKey }, status: "ready", cc },
        }),
      );
    } else {
      const shareKey = cc.runtime.share?.shareKey;
      const data = cc.reg.hostFynApp.middlewareContext.get(shareKey);
      if (data) {
        cc.runtime.middlewareContext.set(this.name, data);
      }
    }

    return { status: "ready" };
  },
};
```

### FynApp Usage (Provider)

```typescript
const middlewareUser = {
  initialize(runtime: FynModuleRuntime) {
    return { status: "ready", mode: "provider" };
  },

  async execute(runtime: FynModuleRuntime) {
    const sharedData = runtime.middlewareContext.get("basic-counter");

    const handleIncrement = () => {
      if (sharedData?.increment) {
        sharedData.increment(runtime.fynApp.name);
      }
    };

    if (sharedData?.eventTarget) {
      sharedData.eventTarget.addEventListener("counterChanged", (event) => {
        const { count, source } = event.detail;
        if (source !== runtime.fynApp.name) {
          // Update UI
        }
      });
    }
  },
};

export const main = useMiddleware(
  {
    info: {
      name: "basic-counter",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: { count: 10 },
  },
  middlewareUser,
);
```

### FynApp Usage (Consumer)

```typescript
export const main = useMiddleware(
  {
    info: {
      name: "basic-counter",
      provider: "fynapp-react-middleware",
      version: "^1.0.0",
    },
    config: "consume-only",
  },
  middlewareUser,
);
```
