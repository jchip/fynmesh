# FynApp 6 - React with useMiddleware API

## Overview

FynApp 6 is a React-based micro-frontend that demonstrates the use of the `useMiddleware()` API in FynMesh. It showcases how to consume shared state from middleware providers in a federated architecture.

## Key Features

- **useMiddleware API**: Uses the modern `useMiddleware()` API for middleware integration
- **Shared State Consumer**: Consumes a shared counter from the `basic-counter` middleware
- **Shell Integration**: Supports rendering within the FynMesh shell UI with proper layout management
- **Self-Managed Rendering**: Returns a `self-managed` result to indicate it handles its own React rendering

## Architecture

### Middleware Dependencies

FynApp 6 depends on the `basic-counter` middleware from `fynapp-react-middleware`:

```typescript
export const main = useMiddleware(
  {
    middleware: import('fynapp-react-middleware/main/basic-counter'),
    config: "consume-only", // Consumer only - uses shared counter from provider
  },
  new MiddlewareUser()
);
```

### Provider-Consumer Pattern

This app follows a **provider-consumer pattern** for shared state:

1. **FynApp 1** acts as the **provider** of the shared counter state
2. **FynApp 6** is a **consumer** that uses the shared counter
3. **fynapp-react-middleware** provides the middleware bridge with:
   - `react-context` - Manages React context for state sharing
   - `basic-counter` - Manages the actual counter state

### Dependency Requirements

**Important**: FynApp 1 must be loaded before FynApp 6 for the shared counter to work properly.

- Without FynApp 1: The app will still render but the counter functionality will be unavailable
- With FynApp 1: Full functionality with shared counter state across apps

## How It Works

1. **Initialization Phase** (`initialize` method):
   - Declares itself as a "consumer" of the shared counter
   - Returns `status: "ready"` to indicate it's ready to proceed

2. **Execution Phase** (`execute` method):
   - Retrieves the counter API from middleware context
   - Creates or finds a container div for rendering
   - Renders the React app with the counter API as a prop
   - Returns a `self-managed` result to inform the shell it handles its own rendering

3. **Graceful Degradation**:
   - If the counter provider is not available, the app still renders
   - Only the counter functionality is disabled, not the entire app

## Shell Integration

When running in the FynMesh shell:
- The app looks for a shell-managed container (`shell-fynapp-${runtime.fynApp.name}`)
- Falls back to creating its own container if not in shell mode
- Returns `self-managed` result so the shell knows not to manage the rendering

## Execution Override Support

As of the latest kernel updates, FynApp 6 properly works with execution override middleware (like `shell-layout`) even though it uses the `useMiddleware()` API. This allows the shell to properly manage the app's layout and placement within regions.

## Development

### Running Standalone
```bash
# The app can run standalone, but counter won't work without provider
fyn start
```

### Running with Full Functionality
```bash
# Load FynApp 1 first (provider), then FynApp 6 (consumer)
# This is typically done through the shell UI
```

## Technical Notes

- Uses React 19.1.0 (or compatible version from `fynapp-react-lib`)
- Implements the `FynModule` interface with `initialize` and `execute` methods
- Supports both shell-managed and standalone rendering modes
- Gracefully handles missing middleware providers