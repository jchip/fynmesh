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
- Runtime telemetry & observability (KernelTelemetry — ring buffer, scopes, transports)
- Inter-FynApp messaging via FynBus (pub/sub + request/response + channels)

## Key Pain Points

1. **Partial lifecycle hooks** - `shutdown()` shipped; still no suspend/resume, hot reload, or per-app error boundary
2. ~~**FynApps can't communicate**~~ - ✅ Resolved by FynBus (see Section 2)

---

## Core Framework Features

### 1. FynApp Lifecycle (Priority 1 - Pain Point)

**Current state**: FynApps have initialize() and execute(), and now shutdown()

**Implemented**:

- ✅ `shutdown()` lifecycle hook on FynUnit
- ✅ `shutdownFynApp(name)` kernel method with `FYNAPP_SHUTDOWN` event
- ✅ `suspend()` / `resume()` hooks + `suspendFynApp`/`resumeFynApp` with `FYNAPP_SUSPENDED`/`FYNAPP_RESUMED` (FYM-9)
- ✅ Mount tracking — kernel-side lifecycle state (`getFynAppState`/`listFynAppStates`) (FYM-10)
- ✅ Per-FynApp error boundary — failed bootstraps recorded as observable `failed` state, siblings unaffected (FYM-11)

**Declined**:

- Hot module replacement (FYM-12; intentionally out of scope)

**Current FynUnit lifecycle**:

```typescript
interface FynUnit {
  initialize?(
    runtime: FynUnitRuntime
  ): Promise<{ status: string; mode?: string }>;
  execute(runtime: FynUnitRuntime): Promise<any>;
  shutdown?(runtime: FynUnitRuntime): Promise<void> | void; // ✅ IMPLEMENTED
  suspend?(runtime: FynUnitRuntime): Promise<void> | void;  // ✅ IMPLEMENTED (FYM-9)
  resume?(runtime: FynUnitRuntime): Promise<void> | void;   // ✅ IMPLEMENTED (FYM-9)
}
```

**Kernel enhancements**:

- ✅ `shutdownFynApp(name)` - calls shutdown() and removes from registry
- ✅ `FYNAPP_SHUTDOWN` event emitted on shutdown
- ✅ Mount tracking via `FynAppLifecycle` (bootstrapping → mounted → suspended, plus failed) (FYM-10)
- ✅ Per-app error boundary records failed state without aborting other apps (FYM-11)

---

### 2. Inter-FynApp Communication (FynBus) ✅ Shipped

**Delivered** (epic FYM-2, FYM-13–18) as `core/kernel/src/fyn-bus.ts`, wired at
`kernel-core.ts` (`new FynBusRoot(...)`). Full design in [`FYNBUS_DESIGN.md`](./FYNBUS_DESIGN.md).

**Shipped API** (per-app facade `runtime.bus`):

```typescript
interface FynBus {
  // Pub/sub — sender identity is platform-stamped, not self-reported
  emit<T>(topic: string, payload?: T): void;
  on<T>(topic: string, handler: (payload: T, meta) => void): () => void;
  once<T>(topic: string, handler: (payload: T, meta) => void): () => void;

  // Request/response — late-handler wait + timeout
  request<TRes, TReq>(topic: string, payload?: TReq, opts?): Promise<TRes>;
  handle<TReq, TRes>(topic: string, handler): () => void; // single responder

  // Scoped
  channel(name: string): FynBus;
}
```

**Resolved design questions**:

- Kernel-level, built on the existing `FynEventTarget` — zero new deps.
- Per-call generic type params provide local compile-time safety; shared topic contracts remain parked (FYM-17).
- Channel scoping/namespacing via `channel()`.
- Subscriptions auto-cleaned on FynApp shutdown; ephemeral (no replay for late joiners — state belongs in `MiddlewareStateRegistry`).

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

**Current state**: Depth-based entry preloading with priorities shipped
(`PreloadStrategy`/`PreloadPriority` in `browser-kernel.ts`, `setPreloadCallback` in
`kernel-core.ts`); manifest preload hints (`shared-providers`, `import-exposed`, `requires`) shipped.

**Remaining**:

- Intelligent preloading based on user behavior
- Bundle caching strategies
- Lazy region loading (load FynApp only when region visible — IntersectionObserver)
- Federation chunk sharing optimization
- Performance metrics collection / performance events for monitoring
- Shared chunk analysis tooling

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
├── FynBus (Inter-FynApp Communication) ✅ shipped
│   ├── Event pub/sub
│   ├── Request/response
│   └── Channel scoping
│
├── Telemetry (KernelTelemetry) ✅ shipped
│   ├── Ring buffer + scopes
│   └── Pluggable transports
│
└── NEW: DevTools Integration
    ├── HMR support
    ├── Debug events
    └── Performance metrics
```

---

## Milestone Structure

### Milestone 1: Lifecycle Hooks ✅ Complete (HMR declined)

- ✅ Add `shutdown()` to FynUnit interface
- ✅ Add `shutdownFynApp(name)` to kernel
- ✅ Emit `FYNAPP_SHUTDOWN` event
- ✅ Implement mount tracking in kernel (FYM-10)
- ✅ Add error boundary per FynApp (FYM-11)
- ✅ Add `suspend()`/`resume()` (FYM-9)
- Demo: FynApp that properly cleans up subscriptions
- HMR support (FYM-12; won't do)

### Milestone 2: FynBus Communication ✅ Complete

- ✅ Design event bus API
- ✅ Implement kernel-level FynBus
- ✅ Add pub/sub messaging
- ✅ Add request/response pattern
- ✅ Demo: Two FynApps communicating via events

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

  Epic structure (initial planning snapshot — live status lives in the `fyntacks`
  tracker under project **FynMesh**, not here). Epics FYM-1 (partial) and FYM-2
  (complete) have shipped work; the rest remain as planned below.
  | ID | Epic | Tasks |
  |-------|----------------------|----------------------|
  | FYM-1 | FynApp Lifecycle | 4 (FYM-9 to FYM-12) |
  | FYM-2 | FynBus Communication | 6 (FYM-13 to FYM-18) |
  | FYM-3 | create-fynapp CLI | 8 (FYM-19 to FYM-26) |
  | FYM-4 | DevTools | 7 (FYM-27 to FYM-33) |
  | FYM-5 | Performance | 4 (FYM-34 to FYM-37) |
  | FYM-6 | Platform Middleware | 4 (FYM-38 to FYM-41) |
  | FYM-7 | Observability | 4 (FYM-42 to FYM-45) |
  | FYM-8 | Security | 3 (FYM-46 to FYM-48) |
