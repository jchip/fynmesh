# FynApp Middleware Architecture

## Overview

The FynMesh middleware system provides a standardized way for FynApps to share functionality through a kernel-managed middleware registry. The architecture enables middleware providers to offer services and capabilities that consumer FynApps can utilize through a consistent API, while maintaining clean separation and avoiding naming conflicts.

**Status: ✅ FULLY IMPLEMENTED** - The middleware system is now complete with production-ready examples including Design Tokens Middleware.

## Core Concepts

### 1. **Middleware Lifecycle**

Middleware follows a comprehensive lifecycle for each FynApp:

1. **Auto-Detection Phase**: Kernel scans FynApp exposed modules for middleware exports
2. **Registration Phase**: Middleware implementations are registered in the kernel registry
3. **Setup Phase**: Called for each FynApp that uses the middleware
4. **Application Phase**: Called after setup for final integration
5. **Execution Phase**: User code executes with middleware context available

### 2. **Provider-Consumer Pattern**

- **Provider**: FynApp that implements and exports middleware functionality
- **Consumer**: FynApp that uses middleware through the `useMiddleware` API
- **Registry**: Kernel-managed registry using `provider::middleware-name` format
- **Context**: Per-FynApp middleware data storage and sharing

### 3. **FynModule Interface**

FynApps implement the standardized `FynModule` interface:

```typescript
export interface FynModule {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
  initialize?(runtime: FynModuleRuntime): any;
  execute(runtime: FynModuleRuntime): Promise<void> | void;
}
```

### 4. **Registry and Discovery**

- **Automatic Detection**: Middleware are automatically detected through export naming conventions
- **Registry Format**: `provider::middleware-name` prevents naming conflicts
- **Version Tracking**: Middleware versions are tracked by hosting FynApp version
- **Lookup System**: Efficient middleware resolution with fallback mechanisms

## Core Architecture Components

### useMiddleware API

```typescript
export const useMiddleware = <UserT extends FynModule = FynModule>(
  meta: MiddlewareUseMeta<unknown> | MiddlewareUseMeta<unknown>[],
  user: UserT,
): UserT
```

**Parameters:**
1. **Middleware metadata**: Object(s) with `info` and `config` fields
2. **User module**: Object implementing the `FynModule` interface

**Returns:** The user module with `__middlewareMeta` field attached

### FynModule Interface

```typescript
export interface FynModule {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
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
  setup?(context: FynAppMiddlewareCallContext): Promise<{ status: string }>;
  apply?(context: FynAppMiddlewareCallContext): Promise<void> | void;
};

export type FynAppMiddlewareCallContext = {
  meta: MiddlewareUseMeta<unknown>;
  fynMod: FynModule;
  fynApp: FynApp;
  reg: FynAppMiddlewareReg;
  runtime: FynModuleRuntime;
  kernel: FynMeshKernel;
  status: string;
};
```

## Middleware Provider Implementation

### Export Convention

Middleware providers must export middleware with the `__middleware__` prefix:

```typescript
export const __middleware__MyMiddleware: FynAppMiddleware = {
  name: "my-middleware",

  async setup(cc: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    // One-time initialization logic for this FynApp
    const config = cc.meta.config;

    // Validate configuration
    if (!this.validateConfig(config)) {
      throw new Error("Invalid middleware configuration");
    }

    // Store FynApp-specific data
    cc.runtime.middlewareContext.set(this.name, {
      config,
      // ... other middleware data
    });

    return { status: "ready" };
  },

  async apply(cc: FynAppMiddlewareCallContext): Promise<void> {
    // Final integration logic for this FynApp
    const { fynApp, runtime } = cc;

    // Get stored data from setup
    const middlewareData = runtime.middlewareContext.get(this.name);

    // Perform final setup steps
    this.performFinalSetup(fynApp, middlewareData);
  },

  private validateConfig(config: any): boolean {
    // Configuration validation logic
    return true;
  },

  private performFinalSetup(fynApp: FynApp, data: any): void {
    // Final setup implementation
  }
};
```

### Module Exposure

```typescript
// In rollup.config.ts
export default {
  plugins: [
    setupReactFederationPlugins({
      exposes: {
        "./middleware/my-middleware": "./src/middleware/my-middleware.ts",
        "./main": "./src/main.ts"
      }
    })
  ]
};
```

### FynApp Configuration

```typescript
// In src/config.ts
export const config = {
  loadMiddlewares: true, // Enable middleware loading
};
```

## FynApp Consumer Implementation

### Basic Usage Pattern

```typescript
import { useMiddleware, FynModule, FynModuleRuntime } from "@fynmesh/kernel";

const middlewareUser: FynModule = {
  initialize(runtime: FynModuleRuntime) {
    // Optional readiness check
    return { status: "ready" };
  },

  async execute(runtime: FynModuleRuntime) {
    // Main application logic
    const middlewareData = runtime.middlewareContext.get("my-middleware");

    if (middlewareData) {
      // Use middleware functionality
      console.log("Middleware available:", middlewareData);
    }
  },
};

export const main = useMiddleware(
  {
    info: {
      name: "my-middleware",
      provider: "provider-fynapp",
      version: "^1.0.0",
    },
    config: {
      // Middleware-specific configuration
      theme: "dark",
      features: ["feature1", "feature2"]
    },
  },
  middlewareUser,
);
```

### Multiple Middleware Usage

```typescript
export const main = useMiddleware(
  [
    {
      info: {
        name: "design-tokens",
        provider: "fynapp-design-tokens",
        version: "^1.0.0",
      },
      config: {
        theme: "fynmesh-default",
        cssCustomProperties: true,
      },
    },
    {
      info: {
        name: "react-context",
        provider: "fynapp-react-middleware",
        version: "^1.0.0",
      },
      config: "primary",
    },
  ],
  middlewareUser,
);
```

### Class-Based Implementation

```typescript
class MiddlewareUser implements FynModule {
  private designTokens: any;
  private reactContext: any;

  initialize(runtime: FynModuleRuntime) {
    // Get middleware data
    this.designTokens = runtime.middlewareContext.get("design-tokens");
    this.reactContext = runtime.middlewareContext.get("react-context");

    return { status: "ready" };
  }

  async execute(runtime: FynModuleRuntime) {
    // Use middleware functionality
    if (this.designTokens?.api) {
      this.designTokens.api.setTheme("fynmesh-dark");
    }

    if (this.reactContext?.provider) {
      // Use React context provider
    }
  }
}
```

## Registry and Discovery

### Automatic Detection

The kernel automatically detects middleware using multiple strategies:

1. **Module Scanning**: Exposed modules starting with `./middleware` are scanned
2. **Export Detection**: Exports with `__middleware__` prefix are registered
3. **Main Module**: The `./main` exposed module is also scanned for middleware exports

### Registry Structure

```typescript
interface MiddlewareRegistry {
  [key: string]: FynAppMiddlewareVersionMap;
}

interface FynAppMiddlewareVersionMap {
  [version: string]: FynAppMiddlewareReg;
  default: FynAppMiddlewareReg;
}

// Example:
runTime.middlewares = {
  "fynapp-design-tokens::design-tokens": {
    "1.0.0": {
      regKey: "fynapp-design-tokens::design-tokens",
      fullKey: "fynapp-design-tokens@1.0.0::design-tokens",
      hostFynApp: fynAppInstance,
      middleware: designTokensMiddleware,
    },
    default: /* same as 1.0.0 */
  },
};
```

### Middleware Lookup

```typescript
// Exact provider lookup
const middleware = kernel.getMiddleware("design-tokens", "fynapp-design-tokens");

// Fallback lookup (searches all providers)
const middleware = kernel.getMiddleware("design-tokens");
```

## Complete Lifecycle Flow

### 1. **Auto-Detection Phase**

When a FynApp loads:
- Kernel scans all exposed modules with names starting with `./middleware`
- Scans the `./main` exposed module for middleware exports
- Any exports with `__middleware__` prefix are detected and registered

### 2. **Registration Phase**

For each detected middleware:
- Creates `FynAppMiddlewareReg` with registry key `provider::middleware-name`
- Stores in kernel registry with version tracking
- Logs successful registration

### 3. **Bootstrap Phase**

When bootstrapping a FynApp:
- Loads the main module
- Detects `useMiddleware` usage objects with `__middlewareMeta` field
- Creates `FynAppMiddlewareCallContext` for each middleware usage
- Prepares middleware call contexts

### 4. **Setup Phase**

For each middleware usage:
- Calls middleware `setup()` method with call context
- Middleware can prepare resources or configurations specific to this FynApp
- Middleware can return status information (e.g., "ready", "defer")

### 5. **Readiness Check**

- User `initialize()` method called (optional readiness check)
- Can return status information to control execution flow
- Middleware system handles deferred execution if needed

### 6. **Application Phase**

- Middleware `apply()` method called for final integration
- User `execute()` method called when everything is ready
- Full middleware functionality is available

## Real-World Example: Design Tokens Middleware

### Provider Implementation

```typescript
// fynapp-design-tokens/src/middleware/design-tokens.ts
export class DesignTokensMiddleware implements FynAppMiddleware {
  public readonly name = "design-tokens";
  private designTokens: DesignTokens;
  private fynAppConfigs = new WeakMap<FynApp, DesignTokensMiddlewareConfig>();

  constructor() {
    this.designTokens = new DesignTokens();
  }

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    const { fynApp, meta } = context;
    const config = this.validateConfig(meta.config);

    this.fynAppConfigs.set(fynApp, config);

    console.debug(`🎨 Design Tokens Middleware setup for ${fynApp.name}`);
    return { status: "ready" };
  }

  async apply(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynApp, runtime } = context;
    const config = this.fynAppConfigs.get(fynApp)!;

    // Set up theme
    if (config.theme) {
      this.designTokens.setTheme(config.theme);
    }

    // Inject CSS custom properties
    if (config.cssCustomProperties !== false) {
      this.designTokens.injectCSSCustomProperties(fynApp.name, config.cssVariablePrefix);
    }

    // Create API for this FynApp
    const api = this.createDesignTokensAPI(fynApp, config);

    // Store in middleware context
    runtime.middlewareContext.set(this.name, {
      designTokens: this.designTokens,
      api,
      tokens: this.designTokens.getTokens(),
      theme: this.designTokens.getTheme(),
    });

    console.debug(`✅ Design Tokens Middleware applied to ${fynApp.name}`);
  }

  private validateConfig(config: any): DesignTokensMiddlewareConfig {
    return {
      theme: config?.theme || 'fynmesh-default',
      cssCustomProperties: config?.cssCustomProperties !== false,
      cssVariablePrefix: config?.cssVariablePrefix || 'fynmesh',
      // ... other config options
    };
  }

  private createDesignTokensAPI(fynApp: FynApp, config: DesignTokensMiddlewareConfig): DesignTokensAPI {
    return {
      getTokens: () => this.designTokens.getTokens(),
      getTheme: () => this.designTokens.getTheme(),
      setTheme: (theme: string) => this.designTokens.setTheme(theme),
      getCSSVariable: (tokenPath: string) => {
        const prefix = config.cssVariablePrefix || 'fynmesh';
        return this.designTokens.getCSSVariable(tokenPath, prefix);
      },
      subscribeToThemeChanges: (callback) => {
        return this.designTokens.subscribeToThemeChanges(callback);
      },
      // ... other API methods
    };
  }
}

// Export the middleware instance
export const __middleware__DesignTokens = new DesignTokensMiddleware();
```

### Consumer Implementation

```typescript
// fynapp-1/src/main.ts
const middlewareUser: FynModule = {
  async execute(runtime: FynModuleRuntime) {
    // Get design tokens from middleware
    const designTokensContext = runtime.middlewareContext.get("design-tokens");
    const { api: designTokens } = designTokensContext || {};

    if (designTokens) {
      // Use design tokens
      console.log("🎨 Current theme:", designTokens.getTheme());

      // Subscribe to theme changes
      designTokens.subscribeToThemeChanges((theme: string, tokens: any) => {
        console.log(`Theme changed to ${theme}`);
        // Update UI accordingly
      });

      // Use CSS variables in components
      designTokens.injectCustomCSS(`
        .my-component {
          color: var(--fynmesh-color-primary);
          background: var(--fynmesh-color-light);
          padding: var(--fynmesh-spacing-md);
        }
      `);
    }

    // Main application logic
    // ... rest of the application
  },
};

export const main = useMiddleware(
  {
    info: {
      name: "design-tokens",
      provider: "fynapp-design-tokens",
      version: "^1.0.0",
    },
    config: {
      theme: "fynmesh-default",
      cssCustomProperties: true,
      cssVariablePrefix: "fynmesh",
    },
  },
  middlewareUser,
);
```

## Advanced Features

### Deferred Execution

Middleware can defer execution until certain conditions are met:

```typescript
async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
  const { fynApp } = context;

  // Check if prerequisites are met
  if (!this.isReady(fynApp)) {
    // Set up event listener for readiness
    this.setupReadinessListener(context);
    return { status: "defer" };
  }

  return { status: "ready" };
}

private setupReadinessListener(context: FynAppMiddlewareCallContext): void {
  // Listen for readiness event
  context.kernel.events.on("MIDDLEWARE_READY", (event: CustomEvent) => {
    const { name, cc } = event.detail;
    if (name === "prerequisite-middleware" && cc.fynApp === context.fynApp) {
      // Emit our own ready event
      context.kernel.events.emit("MIDDLEWARE_READY", {
        detail: { name: this.name, status: "ready", cc: context }
      });
    }
  });
}
```

### Error Handling and Fallbacks

```typescript
async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
  try {
    // Setup logic
    await this.performSetup(context);
    return { status: "ready" };
  } catch (error) {
    console.error(`❌ Middleware setup failed for ${context.fynApp.name}:`, error);

    // Provide fallback functionality
    this.setupFallback(context);
    return { status: "ready" }; // Continue with fallback
  }
}

private setupFallback(context: FynAppMiddlewareCallContext): void {
  // Provide minimal functionality
  context.runtime.middlewareContext.set(this.name, {
    api: this.createFallbackAPI(),
    status: "fallback",
  });
}
```

### Middleware Communication

```typescript
// Middleware can communicate through the kernel event system
export const __middleware__MiddlewareA: FynAppMiddleware = {
  name: "middleware-a",

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    // Listen for events from other middleware
    context.kernel.events.on("MIDDLEWARE_B_EVENT", (event: CustomEvent) => {
      // Handle event from middleware B
      this.handleMiddlewareBEvent(event.detail);
    });

    return { status: "ready" };
  },

  async apply(context: FynAppMiddlewareCallContext): Promise<void> {
    // Emit events for other middleware
    context.kernel.events.emit("MIDDLEWARE_A_READY", {
      detail: { fynApp: context.fynApp, data: "some data" }
    });
  }
};
```

## Best Practices

### FynModule Structure

- **Keep `initialize()` lightweight**: Only perform quick readiness checks
- **Use `execute()` for main logic**: Put the bulk of your application logic here
- **Return meaningful status**: Use status returns to control execution flow
- **Handle missing middleware gracefully**: Always check if middleware context exists

### Middleware Design

- **Single Responsibility**: Each middleware should have a clear, focused purpose
- **Stateless Design**: Avoid shared state between FynApps unless intentional
- **Configuration Validation**: Always validate configuration in `setup()`
- **Error Boundaries**: Provide fallback functionality when possible
- **Performance**: Be mindful of setup/apply time, especially for frequently used middleware

### Configuration Management

- **Type Safety**: Define TypeScript interfaces for all configurations
- **Validation**: Validate configurations early in the `setup()` phase
- **Defaults**: Provide sensible defaults for optional configuration
- **Documentation**: Document all configuration options thoroughly

### Error Handling

- **Descriptive Messages**: Provide clear error messages with context
- **Graceful Degradation**: Handle missing middleware gracefully
- **Fallback Strategies**: Implement fallback functionality when possible
- **Logging**: Use consistent logging with emojis for visual distinction

### Performance Optimization

- **Lazy Loading**: Only load middleware when needed
- **Caching**: Cache expensive operations in the middleware context
- **Batching**: Batch operations when possible
- **Memory Management**: Clean up resources properly

## Testing Strategies

### Unit Testing Middleware

```typescript
// middleware.test.ts
import { DesignTokensMiddleware } from "./design-tokens";

describe("DesignTokensMiddleware", () => {
  let middleware: DesignTokensMiddleware;
  let mockContext: FynAppMiddlewareCallContext;

  beforeEach(() => {
    middleware = new DesignTokensMiddleware();
    mockContext = createMockCallContext();
  });

  test("should setup with valid config", async () => {
    const result = await middleware.setup(mockContext);
    expect(result.status).toBe("ready");
  });

  test("should apply design tokens", async () => {
    await middleware.setup(mockContext);
    await middleware.apply(mockContext);

    const contextData = mockContext.runtime.middlewareContext.get("design-tokens");
    expect(contextData).toBeDefined();
    expect(contextData.api).toBeDefined();
  });
});
```

### Integration Testing

```typescript
// integration.test.ts
import { FynMeshKernelCore } from "@fynmesh/kernel";

describe("Middleware Integration", () => {
  let kernel: FynMeshKernelCore;

  beforeEach(() => {
    kernel = new FynMeshKernelCore();
  });

  test("should register and use middleware", async () => {
    // Register middleware
    const middlewareReg = createTestMiddlewareReg();
    kernel.registerMiddleware(middlewareReg);

    // Create test FynApp
    const fynApp = createTestFynApp();

    // Bootstrap should work
    await kernel.bootstrapFynApp(fynApp);

    // Verify middleware was applied
    expect(fynApp.middlewareContext.has("test-middleware")).toBe(true);
  });
});
```

## Migration Guide

### From Legacy Patterns

If you have existing FynApps using legacy patterns:

1. **Update Main Module**:
   ```typescript
   // Old pattern
   export function main(kernel: FynMeshKernel, fynApp: FynApp) {
     // ... logic
   }

   // New pattern
   const middlewareUser: FynModule = {
     async execute(runtime: FynModuleRuntime) {
       // ... logic
     }
   };

   export const main = useMiddleware(/* config */, middlewareUser);
   ```

2. **Update Dependency Access**:
   ```typescript
   // Old pattern
   const sharedData = fynApp.someSharedData;

   // New pattern
   const sharedData = runtime.middlewareContext.get("middleware-name");
   ```

3. **Update Configuration**:
   ```typescript
   // Old pattern
   export const config = {
     middlewareConfig: { /* ... */ }
   };

   // New pattern
   export const config = {
     loadMiddlewares: true
   };
   ```

## Conclusion

The FynMesh middleware system provides a powerful, flexible, and type-safe way to share functionality across micro frontends. With automatic discovery, lifecycle management, and robust error handling, it enables complex applications while maintaining clean separation of concerns.

The system is production-ready and includes comprehensive examples like the Design Tokens Middleware, demonstrating real-world usage patterns and best practices for building scalable micro frontend architectures.
