# FynApp Middleware Architecture - Concrete Implementation

## Overview

This document defines the concrete implementation of FynMesh's middleware system - the actual APIs, contracts, and workflows for middleware registration, loading, and application. This focuses on practical, implementable features that build on the current kernel foundation.

## Core Concepts

### What is Middleware?

Middleware in FynMesh extends FynApp capabilities through:

- **Service Providers**: Add APIs like storage, auth, analytics to FynApps
- **Component Wrappers**: Wrap FynApp UI with providers, error boundaries, etc.
- **Event Handlers**: React to FynApp lifecycle events
- **Configuration Injectors**: Provide runtime configuration and feature flags

### Current Implementation Foundation

The kernel already has basic middleware support:

- Middleware discovery via `__middleware*` exports in federation modules
- Basic `setup()` and `apply()` lifecycle hooks
- Middleware registry in kernel runtime

## API Contracts

### 1. Middleware Interface

```typescript
/**
 * Basic middleware contract that all middleware must implement
 */
export interface FynAppMiddleware {
  /** Unique name for this middleware */
  name: string;

  /** Optional version for compatibility checking */
  version?: string;

  /**
   * One-time setup called when middleware is registered
   * Use for global initialization, kernel feature registration
   */
  setup?(kernel: FynMeshKernel): Promise<void> | void;

  /**
   * Apply middleware to a specific FynApp instance
   * Called during FynApp bootstrap after loading
   */
  apply?(fynApp: FynApp, context: MiddlewareContext): Promise<void> | void;

  /**
   * Optional teardown when FynApp is unloaded
   */
  teardown?(fynApp: FynApp): Promise<void> | void;
}

/**
 * Context provided to middleware during application
 */
export interface MiddlewareContext {
  /** Middleware configuration from FynApp manifest */
  config: Record<string, any>;

  /** Kernel instance */
  kernel: FynMeshKernel;

  /** Other middleware APIs that this middleware can access */
  middleware: MiddlewareAPI;
}

/**
 * API surface that middleware can expose to FynApps
 */
export interface MiddlewareAPI {
  /** Get middleware instance by name */
  get<T = any>(name: string): T | undefined;

  /** Check if middleware is available */
  has(name: string): boolean;

  /** Get all available middleware names */
  list(): string[];
}
```

### 2. FynApp Middleware Declaration

FynApps declare middleware requirements in their federation configuration:

```typescript
/**
 * Middleware requirements in FynApp info
 */
export interface FynAppInfo {
  // ... existing properties

  /** Middleware that this FynApp wants to use */
  middlewareRequirements?: MiddlewareRequirement[];

  /** Configuration for requested middleware */
  middlewareConfig?: Record<string, Record<string, any>>;
}

export interface MiddlewareRequirement {
  /** Name of the middleware */
  name: string;

  /** Optional version constraint */
  version?: string;

  /** Whether this middleware is required or optional */
  required?: boolean;

  /** Source FynApp that provides this middleware (optional) */
  provider?: string;
}
```

### 3. Kernel Middleware Extensions

```typescript
export interface FynMeshKernel {
  // ... existing properties

  /**
   * Middleware registry and API
   */
  middleware: {
    /** Register a middleware implementation */
    register(middleware: FynAppMiddleware, provider?: string): void;

    /** Get middleware by name */
    get<T = any>(name: string): T | undefined;

    /** Check if middleware is available */
    has(name: string): boolean;

    /** List all available middleware */
    list(): MiddlewareInfo[];

    /** Create middleware context for FynApp */
    createContext(fynApp: FynApp): MiddlewareContext;
  };
}

export interface MiddlewareInfo {
  name: string;
  version?: string;
  provider: string;
  implementation: FynAppMiddleware;
}
```

## Implementation Workflow

### 1. Middleware Provider Implementation

```typescript
// Example: React Context Provider Middleware
// File: src/middleware/react-context.tsx

import { FynAppMiddleware, FynApp, MiddlewareContext } from "@fynmesh/kernel";
import React from "react";

export interface ThemeConfig {
  defaultTheme: "light" | "dark";
  themes: Record<string, any>;
}

class ReactContextMiddleware implements FynAppMiddleware {
  name = "react-context";
  version = "1.0.0";

  private contexts = new WeakMap<FynApp, React.Context<any>>();

  async setup(kernel: FynMeshKernel) {
    console.log("React Context Middleware initialized");
  }

  async apply(fynApp: FynApp, context: MiddlewareContext) {
    const config = context.config as ThemeConfig;

    // Create context for this FynApp
    const AppContext = React.createContext({
      theme: config.defaultTheme || "light",
      setTheme: (theme: string) => console.log("Theme changed:", theme),
    });

    this.contexts.set(fynApp, AppContext);

    // Wrap the FynApp's main component
    if (fynApp.mainModule && fynApp.mainModule.App) {
      const OriginalApp = fynApp.mainModule.App;

      fynApp.mainModule.App = (props: any) =>
        React.createElement(
          AppContext.Provider,
          { value: { theme: config.defaultTheme || "light" } },
          React.createElement(OriginalApp, props),
        );
    }

    // Expose context API
    fynApp.middleware = fynApp.middleware || {};
    fynApp.middleware["react-context"] = {
      getContext: () => this.contexts.get(fynApp),
      useTheme: () => React.useContext(AppContext),
    };
  }
}

// Export middleware for federation loading
export const __middleware__ReactContext = new ReactContextMiddleware();
```

### 2. FynApp Usage

```typescript
// FynApp declares middleware requirements
// File: src/config.ts

export default {
  middlewareRequirements: [
    {
      name: 'react-context',
      version: '^1.0.0',
      required: true,
      provider: 'fynapp-react-lib'
    },
    {
      name: 'analytics',
      required: false
    }
  ],

  middlewareConfig: {
    'react-context': {
      defaultTheme: 'dark',
      themes: {
        dark: { primary: '#000' },
        light: { primary: '#fff' }
      }
    }
  }
};

// FynApp uses middleware APIs
// File: src/App.tsx

import React from 'react';

export default function App({ appName, middleware }: any) {
  // Access middleware API
  const contextMiddleware = middleware?.get('react-context');
  const useTheme = contextMiddleware?.useTheme;

  const theme = useTheme ? useTheme() : { theme: 'light' };

  return (
    <div style={{ backgroundColor: theme.theme === 'dark' ? '#000' : '#fff' }}>
      <h1>{appName} with theme: {theme.theme}</h1>
    </div>
  );
}
```

### 3. Kernel Implementation Updates

```typescript
// Enhanced kernel middleware management
// File: src/kernel-core.ts

export abstract class FynMeshKernelCore implements FynMeshKernel {
  // ... existing code

  public readonly middleware = {
    register: (middleware: FynAppMiddleware, provider = "unknown") => {
      this.runTime.middlewares[middleware.name] = {
        fynApp: { name: provider, version: "1.0.0" } as FynApp,
        config: {},
        moduleName: `__middleware__${middleware.name}`,
        exportName: middleware.name,
        implementation: middleware,
      };
    },

    get: <T = any>(name: string): T | undefined => {
      const middleware = this.runTime.middlewares[name];
      return middleware?.implementation as T;
    },

    has: (name: string): boolean => {
      return name in this.runTime.middlewares;
    },

    list: (): MiddlewareInfo[] => {
      return Object.entries(this.runTime.middlewares).map(([name, meta]) => ({
        name,
        version: meta.implementation.version,
        provider: meta.fynApp.name,
        implementation: meta.implementation,
      }));
    },

    createContext: (fynApp: FynApp): MiddlewareContext => {
      return {
        config: fynApp.middlewareConfig || {},
        kernel: this,
        middleware: {
          get: this.middleware.get,
          has: this.middleware.has,
          list: () => this.middleware.list().map((info) => info.name),
        },
      };
    },
  };

  /**
   * Enhanced middleware application with configuration
   */
  async applyMiddlewares(fynApp: FynApp): Promise<void> {
    const context = this.middleware.createContext(fynApp);

    // Apply middleware based on FynApp requirements
    const requirements = fynApp.middlewareRequirements || [];

    for (const requirement of requirements) {
      const middleware = this.runTime.middlewares[requirement.name];

      if (!middleware) {
        if (requirement.required) {
          throw new Error(`Required middleware '${requirement.name}' not found`);
        }
        console.warn(`Optional middleware '${requirement.name}' not available`);
        continue;
      }

      if (middleware.implementation.apply) {
        const middlewareConfig = fynApp.middlewareConfig?.[requirement.name] || {};
        const middlewareContext = {
          ...context,
          config: middlewareConfig,
        };

        await middleware.implementation.apply(fynApp, middlewareContext);
      }
    }
  }
}
```

## Federation Configuration

### Rollup Configuration for Middleware Provider

```javascript
// rollup.config.js for middleware provider FynApp
export default {
  input: ["src/middleware/react-context.tsx", "src/middleware/analytics.ts", "fynapp-entry.js"],

  plugins: [
    federation({
      name: "fynapp-react-lib",
      exposes: {
        "./middleware/react-context": "./src/middleware/react-context.tsx",
        "./middleware/analytics": "./src/middleware/analytics.ts",
      },
      shared: {
        "esm-react": { singleton: true },
      },
    }),
  ],
};
```

### Enhanced Middleware Loading

```typescript
// Enhanced loadEntryMiddlewares in kernel-core.ts
async loadEntryMiddlewares(fynAppEntry: FederationEntry): Promise<void> {
  const container = fynAppEntry.container;
  if (!container || !container.$E) return;

  // Look for middleware exports
  for (const moduleName in container.$E) {
    if (moduleName.startsWith('./middleware/') || moduleName.startsWith('__middleware')) {
      try {
        const factory = await fynAppEntry.get(moduleName);
        const moduleExports = factory();

        // Look for middleware exports in the module
        for (const [exportName, middleware] of Object.entries(moduleExports)) {
          if (exportName.startsWith('__middleware__') &&
              middleware &&
              typeof middleware === 'object' &&
              'name' in middleware) {

            const middlewareImpl = middleware as FynAppMiddleware;

            if (middlewareImpl.setup) {
              await middlewareImpl.setup(this);
            }

            this.middleware.register(middlewareImpl, this.extractAppName(fynAppEntry));
            console.debug('Loaded middleware:', middlewareImpl.name);
          }
        }
      } catch (error) {
        console.error('Failed to load middleware module', moduleName, error);
      }
    }
  }
}
```

## Implementation Summary

The concrete middleware architecture provides three key APIs that work together:

### 1. **How FynApps Declare Middleware Requirements**

FynApps use a `config.ts` file to declare what middleware they need:

```typescript
// demo/fynapp-1/src/config.ts
export default {
  middlewareRequirements: [
    {
      name: "react-context",
      version: "^1.0.0",
      required: true,
      provider: "fynapp-react-lib",
    },
  ],
  middlewareConfig: {
    "react-context": {
      defaultTheme: "dark",
      themes: {
        /* theme config */
      },
    },
  },
};
```

### 2. **How Kernel Loads and Registers Middleware**

The kernel automatically discovers and loads middleware during FynApp bootstrap:

```typescript
// In kernel-core.ts
async loadEntryMiddlewares(fynAppEntry: FederationEntry) {
    // 1. Look for ./middleware/* or __middleware* exports
    // 2. Load the module and extract middleware implementations
    // 3. Call middleware.setup() for initialization
    // 4. Register with kernel.middleware.register()
}
```

### 3. **How Kernel Applies Middleware to FynApps**

When a FynApp loads, the kernel applies middleware based on requirements:

```typescript
async applyMiddlewares(fynApp: FynApp) {
    // 1. Create middleware context with config
    // 2. Check FynApp's middlewareRequirements
    // 3. For each required middleware:
    //    - Validate it's available
    //    - Call middleware.apply(fynApp, context)
    //    - Pass FynApp-specific configuration
}
```

### 4. **How FynApps Use Middleware APIs**

FynApps access middleware through the runtime API:

```typescript
// In FynApp component
function App({ middleware }) {
    const contextMiddleware = middleware?.get('react-context');
    const useAppContext = contextMiddleware?.useAppContext;
    const context = useAppContext();

    return (
        <div>
            <button onClick={context.toggleTheme}>
                Switch Theme
            </button>
        </div>
    );
}
```

## Working Example Flow

1. **Middleware Provider** (`fynapp-react-lib`) exports `__middleware__ReactContext`
2. **Kernel** discovers and registers the middleware during provider bootstrap
3. **Consumer FynApp** (`fynapp-1`) declares requirement in `config.ts`
4. **Kernel** applies middleware during consumer bootstrap:
   - Creates context with FynApp's config
   - Calls `middleware.apply(fynApp, context)`
   - Middleware wraps App component with React Context Provider
5. **FynApp** accesses middleware APIs through `fynApp.middleware['react-context']`

## Key Benefits

- ✅ **Type Safe**: Full TypeScript interfaces and contracts
- ✅ **Practical**: Works with existing federation system
- ✅ **Incremental**: Can be added to existing FynApps gradually
- ✅ **Isolated**: Each FynApp gets its own middleware instance
- ✅ **Configurable**: Per-FynApp middleware configuration
- ✅ **Discoverable**: Automatic middleware discovery and registration

This implementation provides a solid foundation for FynMesh middleware while remaining practical and achievable with the current kernel architecture.

## Next Steps

### Phase 1: Basic Implementation

1. ✅ Update type definitions
2. ✅ Enhance kernel middleware registry
3. ✅ Implement middleware context creation
4. ✅ Add configuration passing

### Phase 2: Enhanced Features

1. Add version checking and compatibility
2. Implement middleware dependency resolution
3. Add error boundaries and graceful degradation
4. Create middleware testing utilities

### Phase 3: Advanced Capabilities

1. Hot reloading for development
2. Middleware performance monitoring
3. Advanced composition patterns
4. Cross-FynApp communication helpers

This implementation provides a solid foundation for FynMesh middleware while remaining practical and achievable with the current kernel architecture.
