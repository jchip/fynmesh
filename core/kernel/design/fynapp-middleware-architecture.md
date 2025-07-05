# FynApp Middleware Architecture - Top-Level Management

## Overview

This document defines the FynMesh middleware system where middleware is managed at the kernel level with collision avoidance through fynapp-name-prefixed keys. Middleware is tracked by the version of the hosting FynApp, and consumers specify the provider FynApp to avoid naming conflicts.

The system includes auto-detection of middleware exports, a standardized `useMiddleware` API, and ambient middleware availability across all FynApps.

## Architecture Principles

### 1. **Kernel-Level Management**

- All middleware is managed at the kernel level in a single registry
- Registry uses format: `"fynapp-name::middleware-name"` as keys
- Prevents middleware name collisions between different FynApp providers

### 2. **Version-Based Tracking**

- Middleware versions are tracked by the hosting FynApp's version
- Multiple FynApp versions can provide different versions of the same middleware
- Version resolution uses latest available version by default

### 3. **Provider Specification**

- Consumers specify the `provider` field in `useMiddleware` calls
- Enables precise middleware resolution and avoids ambiguity
- Fallback behavior searches across all providers when no provider specified

### 4. **Auto-Detection and Registration**

- Kernel automatically detects middleware from exposed modules with names starting with `./middleware`
- Middleware exports must be prefixed with `__middleware__` (e.g., `__middleware__ReactContext`)
- Automatic registration eliminates manual middleware registration steps

### 5. **Standardized Consumption API**

- `useMiddleware` API provides a standardized way to consume middleware
- Returns objects with `__middlewareInfo` field for kernel detection
- Enables declarative middleware usage patterns

### 6. **Ambient Availability**

- Once loaded, middleware are available to all subsequent FynApps
- Eliminates need for repeated middleware loading across FynApps
- Promotes middleware reuse and consistency

## Middleware Provider Pattern

### Convention and Structure

- **File Structure**: Place middleware source code files at the root or in subdirectories of `src/`
- **Module Exposure**: Expose middleware modules with names starting with `./middleware`, mirroring the actual file structure
  - `./middleware-react-context` → `./src/middleware-react-context.ts`
  - `./middleware/analytics` → `./src/middleware/analytics.ts`
- **Export Naming**: Export middleware using the pattern `__middleware__<MiddlewareName>`

### Example Provider Structure

```typescript
// src/middleware-react-context.ts
import { FynAppMiddleware } from "@fynmesh/kernel";

class ReactContextMiddleware implements FynAppMiddleware {
  name = "react-context";
  version = "1.0.0";

  async setup(kernel: any) {
    // Setup logic
  }

  async apply(fynApp: FynApp, context: MiddlewareContext) {
    // Apply logic
  }
}

export const __middleware__ReactContext = new ReactContextMiddleware();
```

```typescript
// Rollup config exposes
export default {
  // ... other config
  exposes: {
    "./middleware-react-context": "./src/middleware-react-context.ts",
    "./middleware/analytics": "./src/middleware/analytics.ts",
  },
};
```

## Middleware Consumer Pattern

### useMiddleware API

The `useMiddleware` API provides a standardized way to consume middleware:

```typescript
// src/main.ts
import { useMiddleware } from "@fynmesh/kernel";

export const main = useMiddleware(
  { provider: "fynapp-react-lib", name: "react-context" },
  {
    // Middleware configuration
    contexts: [
      {
        contextName: "theme",
        initialState: { mode: "light" },
      },
    ],
  },
  async (kernel, fynApp) => {
    // Your FynApp logic here
    console.log("FynApp initialized with middleware");
  },
);
```

### useMiddleware Parameters

- **Middleware Specification**: Object with `provider` and `name` fields
- **Configuration**: Middleware-specific configuration object
- **User Code**: The actual FynApp logic function

## Middleware Lifecycle

### 1. **Auto-Detection Phase**

- FynApp loads → Kernel scans exposed modules with names starting with `./middleware`
- Kernel detects exports with `__middleware__` prefix
- Automatic registration of discovered middleware

### 2. **Configuration Phase**

- After config loads → Kernel applies ALL registered middleware automatically
- No manual middleware application required

### 3. **Usage Detection Phase**

- Kernel scans exposed module exports for `__middlewareInfo` fields
- When found, kernel looks up middleware and invokes it on the usage object
- Automatic middleware application to consumer FynApps

### 4. **Ambient Availability**

- Middleware remain available to all subsequent FynApps
- No need for repeated loading or registration
- Promotes consistent middleware usage patterns

## API Contracts

### 1. Middleware Registration (Automatic)

```typescript
// Auto-registration via export naming convention
export const __middleware__ReactContext = new ReactContextMiddleware();

// Manual registration (alternative approach)
kernel.middleware.register(
  middlewareImplementation,
  providerFynAppName, // FynApp that provides the middleware
  fynAppVersion, // Version of the providing FynApp
);
```

### 2. Middleware Lookup

```typescript
// Get middleware with provider specification (recommended)
const middleware = kernel.middleware.get("react-context", "fynapp-react-lib");

// Check middleware availability with provider
const hasMiddleware = kernel.middleware.has("react-context", "fynapp-react-lib");

// Fallback: search across all providers (not recommended for production)
const anyReactContext = kernel.middleware.get("react-context");
```

### 3. FynApp Configuration

```typescript
// FynApp config - middleware requirements are auto-detected from useMiddleware usage
export default {
  // middlewareRequirements: [] // Auto-generated by FynMesh dev tool
  // All middleware configuration is handled directly in useMiddleware calls
};
```

## Internal Registry Structure

The middleware registry uses the following structure:

```typescript
// Registry key format: "provider::middleware-name"
runTime.middlewares = {
  "fynapp-react-lib::react-context": {
    "2.1.0": {
      fynApp: { name: "fynapp-react-lib", version: "2.1.0" },
      implementation: ReactContextMiddleware,
      // ... other metadata
    },
    "2.0.0": {
      fynApp: { name: "fynapp-react-lib", version: "2.0.0" },
      implementation: ReactContextMiddleware_v2,
      // ... other metadata
    },
  },
  "fynapp-analytics-pro::analytics": {
    "1.2.0": {
      fynApp: { name: "fynapp-analytics-pro", version: "1.2.0" },
      implementation: AnalyticsMiddleware,
      // ... other metadata
    },
  },
  "fynapp-ui-kit::react-context": {
    "1.0.0": {
      fynApp: { name: "fynapp-ui-kit", version: "1.0.0" },
      implementation: DifferentReactContextMiddleware,
      // ... other metadata
    },
  },
};
```

## Benefits

### 1. **Collision Avoidance**

- Multiple FynApps can provide middleware with the same name
- No conflicts between `fynapp-react-lib::react-context` and `fynapp-ui-kit::react-context`
- Clear ownership and provider identification

### 2. **Version Management**

- Track middleware versions by hosting FynApp version
- Support multiple versions of the same middleware from same provider
- Enable gradual upgrades and compatibility testing

### 3. **Explicit Dependencies**

- Consumers explicitly specify which FynApp provides their middleware in `useMiddleware` calls
- Reduces ambiguity and improves reliability
- Better error messages when middleware not found

### 4. **Debugging Support**

- Registry keys clearly show provider and middleware name
- Easier to track middleware sources in logs
- Better visibility into middleware loading and registration

### 5. **Auto-Detection and Convenience**

- Automatic middleware discovery and registration
- Standardized `useMiddleware` API reduces boilerplate
- Convention-based approach improves developer experience

### 6. **Ambient Availability**

- Middleware remain available across all FynApps
- Eliminates redundant loading and registration
- Promotes consistent middleware usage patterns

## Implementation Guide

### For Middleware Providers

1. Place middleware implementations in `src/` directory (or subdirectories)
2. Expose middleware modules with names starting with `./middleware`, mirroring file structure
3. Export middleware using `__middleware__<Name>` convention
4. Manual registration is also supported for advanced use cases

### For Middleware Consumers

1. Use the `useMiddleware` API for standardized middleware consumption
2. Specify the `provider` field in `useMiddleware` calls for precise middleware resolution
3. FynMesh dev tool automatically detects and collects middleware requirements from code
4. Configure middleware according to provider documentation

### Implementation Examples

**Using useMiddleware API:**

```typescript
export const main = useMiddleware(
  { provider: "fynapp-react-lib", name: "react-context" },
  {
    // Middleware configuration
    contexts: [
      {
        contextName: "theme",
        initialState: { mode: "light" },
      },
    ],
  },
  async (kernel, fynApp) => {
    // Your FynApp logic
  },
);
```

**Using traditional main function approach:**

```typescript
// main.ts
export function main(kernel, fynApp) {
  // Traditional approach - middleware requirements auto-detected by dev tool
  // when useMiddleware is used elsewhere in the codebase
}
```

## Flexibility and Compatibility

The middleware system provides multiple integration approaches:

- Middleware without provider specification works via fallback search
- Fallback search across all providers when no provider specified
- Manual middleware registration as an alternative to auto-detection
- Middleware requirements automatically collected from `useMiddleware` usage
- Provider field is optional for simpler use cases

## Future Enhancements

### Dev Tools Integration

- **Auto-detection of `useMiddleware` calls** - FynMesh dev tool compiles and collects middleware requirements from code usage
- **Automatic requirement generation** - Middleware requirements automatically added to entry files
- Enhanced debugging and visualization tools
- Automatic middleware dependency resolution

### Advanced Loading Patterns

- Configuration-driven loading of additional exposed modules
- Conditional middleware loading based on environment
- Lazy loading of middleware for performance optimization

### Enhanced Error Handling

- Descriptive error messages with context and available options
- Better debugging information for middleware resolution failures
- Improved error recovery and fallback mechanisms
