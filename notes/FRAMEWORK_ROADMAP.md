# FynMesh Core MFE Framework Roadmap

## Vision
Evolve FynMesh from demo-ready to production-ready micro-frontend framework by addressing core framework gaps.

## Current State
FynMesh has solid foundations:
- Kernel with module loading via SystemJS federation
- Middleware system with setup/apply/execute phases
- Manifest resolution and bootstrap coordination
- Multi-framework support (React, Vue, Marko, Preact, Solid, Svelte)
- Multi-version module support
- Error reporting with KernelError hierarchy

## Key Pain Points
1. **Missing lifecycle hooks** - No cleanup/unmount, no hot reload, limited error recovery
2. **FynApps can't communicate** - No event bus, messaging, or contracts between FynApps

---

## Core Framework Features

### 1. FynApp Lifecycle (Priority 1 - Pain Point)
**Current state**: FynApps have initialize() and execute(), but no cleanup

**Needed**:
- `cleanup()` / `unmount()` lifecycle hook
- `suspend()` / `resume()` for background FynApps
- Hot module replacement (HMR) support
- Error boundary per FynApp (isolate failures)
- Lifecycle events for observability

**Proposed FynUnit lifecycle**:
```typescript
interface FynUnit {
  initialize?(runtime: FynUnitRuntime): Promise<void>;
  execute(runtime: FynUnitRuntime): Promise<ExecutionResult>;
  cleanup?(runtime: FynUnitRuntime): Promise<void>;  // NEW
  suspend?(runtime: FynUnitRuntime): Promise<void>;  // NEW
  resume?(runtime: FynUnitRuntime): Promise<void>;   // NEW
  onError?(error: Error, runtime: FynUnitRuntime): ErrorRecovery; // NEW
}
```

**Kernel enhancements**:
- Track mounted FynApps
- Call cleanup on unmount/replace
- Error boundaries with recovery options (retry, fallback, ignore)

---

### 2. Inter-FynApp Communication (Priority 2 - Pain Point)
**Current state**: FynApps can only communicate via middleware context (indirect)

**Needed**:
- Event bus for pub/sub messaging
- Typed event contracts
- Request/response pattern (RPC-like)
- Broadcast vs targeted messaging

**Proposed API**:
```typescript
// Available via kernel or middleware
interface FynBus {
  // Pub/sub
  emit(event: string, payload?: any): void;
  on(event: string, handler: (payload) => void): unsubscribe;
  once(event: string, handler: (payload) => void): unsubscribe;

  // Request/response
  request<T>(channel: string, payload?: any): Promise<T>;
  handle<T>(channel: string, handler: (payload) => T | Promise<T>): unsubscribe;

  // Scoped
  channel(name: string): ScopedBus;
}
```

**Design considerations**:
- Kernel-level vs middleware-level
- Type safety for events (TypeScript generics, schemas)
- Event namespacing/scoping
- Dead letter handling (unhandled events)

---

### 3. Developer Experience & Tooling (Priority 3)

#### 3a. create-fynapp Improvements
**Current state**: Basic scaffolding with React/Vue templates, simple string replacement

**Needed**:
- Complete all framework templates (Preact, Solid, Marko, Svelte)
- Proper template engine (handlebars/EJS) instead of string replacement
- Built-in dev server with HMR support
- Test framework scaffolding (Vitest)
- Middleware template generation
- Template variants (starter vs full-featured)
- Config schema validation

**CLI enhancements**:
```bash
create-fynapp --name my-app --framework react --template starter
cfa dev                    # Built-in dev server with HMR
cfa add middleware         # Add middleware to existing app
cfa test                   # Run tests
cfa lint                   # Lint/format
```

#### 3b. DevTools & Debugging
**Current state**: Console logging only

**Needed**:
- Dev overlay showing FynApp boundaries and names
- Console integration (prefix logs with FynApp name)
- Federation debugger (visualize loaded modules, versions)
- Error overlay with stack traces
- Performance profiler

**Proposed**:
- `fynmesh-devtools` in-page overlay (dev mode only)

#### 3c. FynMesh Chrome Extension
**Purpose**: Visual debugging and inspection for FynMesh apps

**Features**:
- **FynApp Panel**: List all loaded FynApps with status (loading, ready, error)
- **Federation Inspector**: Show loaded modules, versions, sharing relationships
- **Dependency Graph**: Visualize module dependencies and shared chunks
- **Middleware Viewer**: Show middleware stack per FynApp
- **Event Monitor**: Real-time FynBus event stream
- **Performance Tab**: Load times, render times per FynApp
- **Console Filter**: Filter console by FynApp source

**Implementation**:
- Chrome DevTools panel (like React DevTools)
- Communicates with kernel via injected script
- Works in both dev and production modes

---

### 4. Performance & Optimization (Priority 4)
**Current state**: Preloading exists, route-based preload started

**Needed**:
- Intelligent preloading based on user behavior
- Bundle caching strategies
- Lazy region loading (load FynApp only when region visible)
- Federation chunk sharing optimization
- Performance metrics collection

**Proposed enhancements**:
- `preload` hints in manifest
- Intersection observer for lazy regions
- Shared chunk analysis tooling
- Performance events for monitoring

---

## Framework Architecture Evolution

```
FynMesh Kernel (Core)
│
├── Module Loader (SystemJS federation)
├── Manifest Resolver
├── Bootstrap Coordinator
├── Middleware Manager
├── Middleware Executor
│
├── NEW: Lifecycle Manager
│   ├── Mount tracking
│   ├── Cleanup coordination
│   └── Error boundaries
│
├── NEW: FynBus (Inter-FynApp Communication)
│   ├── Event pub/sub
│   ├── Request/response
│   └── Channel scoping
│
└── NEW: DevTools Integration
    ├── HMR support
    ├── Debug events
    └── Performance metrics
```

---

## Milestone Structure

### Milestone 1: Lifecycle Hooks
- Add cleanup() to FynUnit interface
- Implement mount tracking in kernel
- Call cleanup on FynApp unmount/replace
- Add error boundary per FynApp
- Demo: FynApp that properly cleans up subscriptions

### Milestone 2: FynBus Communication
- Design event bus API
- Implement kernel-level FynBus
- Add pub/sub messaging
- Add request/response pattern
- Demo: Two FynApps communicating via events

### Milestone 3: create-fynapp & Dev Experience
- Complete framework templates (Preact, Solid, Marko, Svelte)
- Replace string templating with proper template engine
- Add `cfa dev` command with built-in dev server
- Add middleware generation (`cfa add middleware`)
- Dev overlay showing FynApp boundaries
- Console integration (FynApp name tagging)

### Milestone 4: Performance
- Lazy region loading
- Preload hints system
- Performance event emission
- Bundle analysis tooling

---

## Design Questions to Resolve

### Lifecycle
- Should cleanup be sync or async?
- How to handle cleanup timeout (force unmount after X ms)?
- What happens if cleanup throws?

### FynBus
- Kernel-level or separate package?
- How to type events across FynApp boundaries?
- Should events persist for late subscribers?

### Dev Experience
- Build into kernel or separate devtools package?
- Browser extension vs in-page overlay?

---

## Implementation Reference Files

- `core/kernel/src/kernel-core.ts` - Core kernel implementation
- `core/kernel/src/middleware-executor.ts` - Middleware execution
- `core/kernel/src/module-loader.ts` - Module loading
- `core/kernel/design/` - Architecture docs
- `demo/fynapp-shell-mw/` - Complex middleware example
