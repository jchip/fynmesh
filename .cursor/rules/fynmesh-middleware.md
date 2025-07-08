# FynMesh Middleware System Rules for Cursor

## Middleware System

### Middleware Provider FynApps Contract

- Kernel checks any FynApp expose module name starts with `./middleware` for middlewares. Examples: `./middleware-react-context`, `./middleware/analytics`, `./middleware-auth`
- **File Structure Convention**: Exposed module names must mirror actual file structure
  - `./middleware-react-context` → `./src/middleware-react-context.ts`
  - `./middleware/analytics` → `./src/middleware/analytics.ts`
- From these exposed modules, Kernel detects any exports with `__middleware__` prefix: `export const __middleware__MyMiddleware = middlewareImplementation` and automatically register them as middleware
- Kernel also checks `./main` expose module for middlewares.

### Middleware Implementation Pattern

- **File Structure**: Place middleware source code files in `src/` or `src/middleware` directory
- **Module Exposure**: Expose middleware modules with names starting with `./middleware`, mirroring actual file structure
- **Export Naming**: Export middleware using name `__middleware__<MiddlewareName>`
- **Main Expose**: The `./main` expose module can export middlewares that the kernel will automatically loads.

### Middleware Usage Pattern

- Use `useMiddleware` API to consume middleware in FynApp code:

  ```typescript
  const middlewareUser = {
    initialize(runtime: FynModuleRuntime) {
      // Optional readiness check
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
        provider: "provider-fynapp",
        name: "middleware-name",
        version: "^1.0.0",
      },
      config: {},
    },
    middlewareUser
  );
  ```

- `useMiddleware` takes two parameters: middleware metadata and FynModule user object
- `useMiddleware` returns object with `__middlewareMeta` field for kernel detection
- When kernel loads an exposed module from a FynApp, it scans all exports for `__middlewareMeta` marker
- When found, kernel looks up middleware and invokes it on the usage object
- `provider` field should match the provider FynApp name
- `name` field should match the middleware name within that FynApp
- **Configuration**: ALL middleware configuration comes from `useMiddleware` calls - no `middlewareConfig` in FynApp config
- Kernel only automatically loads the `./main` exposed module by default.

### FynModule Interface

- FynApps implement the standardized `FynModule` interface:
  ```typescript
  export interface FynModule {
    initialize?(runtime: FynModuleRuntime): any;
    execute(runtime: FynModuleRuntime): Promise<void> | void;
  }
  ```
- `initialize()`: Optional method called first to determine readiness
- `execute()`: Required method that does the actual work when middleware is ready
- Both object-based and class-based implementations supported

### Middleware Implementation

- Implement `FynAppMiddleware` interface with `name`, `setup()`, `apply()` methods
- Registry key format: `"provider-fynapp::middleware-name"`
- **Version Tracking**: Middleware versions are tracked by hosting FynApp version
- **Setup Method**: Called for each FynApp that uses the middleware
- **Apply Method**: Called after setup for final integration steps

### Middleware Lifecycle

1. **Auto-Detection Phase**: FynApp loads → Kernel scans expose modules with name starts with `./middleware` for `__middleware__*` exports
2. **Registration Phase**: Middleware implementations automatically registered with provider::name keys
3. **Bootstrap Phase**: Kernel loads FynApp main module → Detects `useMiddleware` usage objects with `__middlewareMeta` field
4. **Setup Phase**: Middleware `setup()` method called for each FynApp
5. **Application Phase**: User `initialize()` called → Middleware `apply()` called → User `execute()` called

### Middleware Context

- The kernel will initialize a `middlewareContext` object in each FynApp
- Each middleware can set its own data in this context, that is specific for each FynApp
- Access via `runtime.middlewareContext.get("middleware-name")`
- Store data via `cc.runtime.middlewareContext.set(this.name, data)`

### Middleware Lookup and Resolution

- **Provider Specification**: Consumers specify provider for exact lookup: `getMiddleware("name", "provider")`
- **Registry Format**: `"provider::middleware-name"` prevents naming conflicts
- **Version Resolution**: Latest version selected by default, specific versions can be requested
- **Error Handling**: Descriptive error messages when middleware not found

### Middleware Invocation

- Each middleware defines its contract with its user individually
- The kernel is responsible for detecting, loading, and facilitating the lifecycle steps
- When a FynApp module exports a MiddlewareUsage object, the kernel ensures everything is loaded and setup, then invokes the middleware
- Middleware can maintain context data that is shared across FynApps (implementation-specific pattern)
- Core architecture provides framework, specific patterns (shared data, events, etc.) are middleware-specific
