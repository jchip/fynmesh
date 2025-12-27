# Shared State Architecture - Design Analysis

**Problem:** How should middleware share state across multiple FynApps that can join/leave at any time?

---

## Core Problem Statement

### Requirements

1. **Provider/Consumer Pattern**
   - One FynApp provides shared state (e.g., counter)
   - Multiple FynApps consume that state
   - Consumers can modify state, changes visible to all

2. **Late Join Support**
   - Consumer can load before provider (degrade, upgrade later)
   - Consumer can load after provider (discover existing state)
   - Provider can be replaced without losing state

3. **Lifecycle Independence**
   - Provider FynApp can unload from region, state persists
   - Consumer FynApp can unload, doesn't affect others
   - State survives individual FynApp lifecycles

4. **Multi-Version Support**
   - Multiple versions of same middleware can coexist
   - Multiple providers of same middleware (different scopes)

5. **Discovery**
   - Consumers need to find providers
   - Late joiners need to discover already-ready providers

---

## Current Architecture Issues

### The ShareKey Problem

```typescript
// Provider creates:
shareKey = "fynapp-react-middleware::basic-counter-fynapp-1@1.0.0"
stores: middlewareContext.set(shareKey, counterData)

// Consumer needs:
shareKey from cc.runtime.share?.shareKey  // ❌ undefined for late joiners

// Consumer looks up:
data = middlewareContext.get(shareKey)  // ❌ shareKey is undefined
```

**Root Cause:** Temporal coupling - consumers must be waiting when provider signals.

---

## Architectural Pattern Analysis

### Pattern 1: Event Bus (Current Approach)

```typescript
// Provider
signal("MIDDLEWARE_READY", { share: { shareKey } })

// Consumer (early joiner)
onEvent("MIDDLEWARE_READY", (share) => {
  const data = lookup(share.shareKey)
})
```

**Pros:**
- Decoupled communication
- Works for early joiners

**Cons:**
- ❌ Late joiners miss events
- ❌ No state persistence
- ❌ Temporal coupling

**Assessment:** Not suitable for late join scenarios

---

### Pattern 2: Service Locator

```typescript
// Central registry
class MiddlewareRegistry {
  private services: Map<string, any>

  register(name: string, service: any) {
    this.services.set(name, service)
  }

  lookup(name: string): any {
    return this.services.get(name)
  }
}

// Provider
registry.register("basic-counter", counterService)

// Consumer (anytime)
const counter = registry.lookup("basic-counter")
```

**Pros:**
- ✅ Late join works
- ✅ Simple discovery
- ✅ No temporal coupling

**Cons:**
- ❌ Global mutable state
- ❌ No versioning support
- ❌ Single instance per name

**Assessment:** Better, but lacks multi-version support

---

### Pattern 3: Dependency Injection Container

```typescript
// DI Container
class Container {
  private providers: Map<string, Provider>
  private instances: Map<string, any>

  registerProvider(key: string, provider: Provider) {
    this.providers.set(key, provider)
  }

  resolve(key: string): any {
    if (!this.instances.has(key)) {
      const provider = this.providers.get(key)
      this.instances.set(key, provider.create())
    }
    return this.instances.get(key)
  }
}

// Provider FynApp
container.registerProvider("basic-counter", {
  create: () => ({ count: 0, increment() {...} })
})

// Consumer FynApp
const counter = container.resolve("basic-counter")
```

**Pros:**
- ✅ Late join works
- ✅ Lazy initialization
- ✅ Singleton enforcement

**Cons:**
- ❌ Still global state
- ❌ No scoping (what if multiple counters?)

**Assessment:** Good for singletons, needs scoping

---

### Pattern 4: Context/Scope Hierarchy

```typescript
// Like React Context or Angular Injector hierarchy
class ScopeRegistry {
  private parent?: ScopeRegistry
  private services: Map<string, any>

  constructor(parent?: ScopeRegistry) {
    this.parent = parent
    this.services = new Map()
  }

  provide(name: string, service: any) {
    this.services.set(name, service)
  }

  lookup(name: string): any {
    // Walk up the hierarchy
    if (this.services.has(name)) {
      return this.services.get(name)
    }
    return this.parent?.lookup(name)
  }
}

// Shell creates root scope
const rootScope = new ScopeRegistry()

// Provider registers at appropriate level
rootScope.provide("basic-counter", counterService)

// Consumer looks up from its scope
const counter = consumerScope.lookup("basic-counter")
```

**Pros:**
- ✅ Late join works
- ✅ Scoped state (region-specific, global, etc.)
- ✅ Hierarchical lookup

**Cons:**
- ⚠️ Need to define scope boundaries
- ⚠️ More complex

**Assessment:** Powerful, matches shell/region architecture

---

### Pattern 5: Pub/Sub with State Store

```typescript
// Central store with pub/sub
class StateStore {
  private state: Map<string, any>
  private subscribers: Map<string, Set<Function>>

  publish(key: string, value: any) {
    this.state.set(key, value)
    this.subscribers.get(key)?.forEach(fn => fn(value))
  }

  subscribe(key: string, fn: Function): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set())
    }
    this.subscribers.get(key)!.add(fn)

    // Immediately call with current value if exists
    if (this.state.has(key)) {
      fn(this.state.get(key))
    }

    return () => this.subscribers.get(key)?.delete(fn)
  }

  get(key: string): any {
    return this.state.get(key)
  }
}

// Provider
store.publish("basic-counter", { count: 0, increment() {...} })

// Consumer (early OR late)
const unsubscribe = store.subscribe("basic-counter", (counter) => {
  // Got it! Works for late joiners because subscribe calls with current value
})
```

**Pros:**
- ✅ Late join works (immediate callback)
- ✅ Reactive updates
- ✅ Simple API

**Cons:**
- ❌ Still global state
- ⚠️ Need scoping

**Assessment:** Good pattern, combine with scoping

---

### Pattern 6: Observable/Signal Pattern

```typescript
// Modern reactive pattern
class Observable<T> {
  private value: T
  private observers: Set<(value: T) => void>

  constructor(initial: T) {
    this.value = initial
    this.observers = new Set()
  }

  get(): T {
    return this.value
  }

  set(value: T) {
    this.value = value
    this.observers.forEach(fn => fn(value))
  }

  subscribe(fn: (value: T) => void): () => void {
    fn(this.value)  // Immediate call with current value
    this.observers.add(fn)
    return () => this.observers.delete(fn)
  }
}

// Provider
const counter = new Observable({ count: 0 })
registry.register("basic-counter", counter)

// Consumer (anytime)
const counter = registry.lookup("basic-counter")
const unsubscribe = counter.subscribe((value) => {
  updateUI(value)
})
```

**Pros:**
- ✅ Late join works
- ✅ Reactive
- ✅ Type-safe
- ✅ Explicit state changes

**Cons:**
- ⚠️ Need registry for discovery

**Assessment:** Excellent for state, needs discovery layer

---

### Pattern 7: Module Federation Shared Scope (Current System)

```typescript
// What federation.js does for React, we could do for middleware state
__webpack_share_scopes__['default'] = {
  'react': {
    '18.0.0': { loaded: 1, get: () => React }
  }
}

// For middleware:
__fynmesh_middleware_scope__ = {
  'basic-counter': {
    'providers': {
      'fynapp-1@1.0.0': { get: () => counterInstance }
    }
  }
}
```

**Pros:**
- ✅ Versioned
- ✅ Multiple providers
- ✅ Federation pattern

**Cons:**
- ⚠️ Need version resolution
- ⚠️ Complex

**Assessment:** Matches federation architecture well

---

## Recommended Architecture: Hybrid Approach

### Design: Scoped Registry + Observable State

**Key Insight:** Combine the best patterns:
- **Scoped Registry** for multi-level state isolation (Pattern 4)
- **Observable** for reactive state (Pattern 6)
- **Service Locator** for simple discovery (Pattern 2)

```typescript
// 1. Core: Observable state container
class ObservableState<T> {
  private value: T
  private observers: Set<(value: T) => void> = new Set()

  constructor(initial: T) {
    this.value = initial
  }

  get(): T {
    return this.value
  }

  set(value: T) {
    this.value = value
    this.notify()
  }

  update(fn: (value: T) => T) {
    this.value = fn(this.value)
    this.notify()
  }

  subscribe(fn: (value: T) => void): () => void {
    fn(this.value)  // Immediate call
    this.observers.add(fn)
    return () => this.observers.delete(fn)
  }

  private notify() {
    this.observers.forEach(fn => fn(this.value))
  }
}

// 2. Registry with scoping
class MiddlewareStateRegistry {
  private parent?: MiddlewareStateRegistry
  private states: Map<string, ObservableState<any>> = new Map()

  constructor(parent?: MiddlewareStateRegistry) {
    this.parent = parent
  }

  // Provider API
  provide<T>(key: string, initial: T): ObservableState<T> {
    const state = new ObservableState(initial)
    this.states.set(key, state)
    return state
  }

  // Consumer API
  lookup<T>(key: string): ObservableState<T> | undefined {
    // Check local scope first
    if (this.states.has(key)) {
      return this.states.get(key)
    }
    // Walk up hierarchy
    return this.parent?.lookup(key)
  }

  // Create child scope
  createScope(): MiddlewareStateRegistry {
    return new MiddlewareStateRegistry(this)
  }
}

// 3. Integration with kernel
class FynMeshKernel {
  // Global registry (for app-wide state)
  globalMiddlewareRegistry = new MiddlewareStateRegistry()

  // Per-region registries (for region-scoped state)
  regionRegistries: Map<string, MiddlewareStateRegistry> = new Map()

  getMiddlewareRegistry(scope: "global" | { region: string }): MiddlewareStateRegistry {
    if (scope === "global") {
      return this.globalMiddlewareRegistry
    }

    const regionId = scope.region
    if (!this.regionRegistries.has(regionId)) {
      // Region registry inherits from global
      this.regionRegistries.set(
        regionId,
        this.globalMiddlewareRegistry.createScope()
      )
    }
    return this.regionRegistries.get(regionId)!
  }
}
```

### Usage Example

```typescript
// Provider (FynApp 1) - middleware setup
async setup(cc: FynAppMiddlewareCallContext) {
  const registry = cc.kernel.getMiddlewareRegistry("global")

  // Provide shared state
  const counter = registry.provide("basic-counter", {
    count: 10,
    increment() {
      this.count++
      return this.count
    },
    reset() {
      this.count = 0
    }
  })

  // Store reference in middleware context for internal use
  cc.runtime.middlewareContext.set("basic-counter", counter)

  return { status: "ready" }
}

// Consumer (FynApp 6) - middleware setup (EARLY OR LATE!)
async setup(cc: FynAppMiddlewareCallContext) {
  const registry = cc.kernel.getMiddlewareRegistry("global")

  // Lookup (works for late joiners!)
  const counterState = registry.lookup("basic-counter")

  if (!counterState) {
    return { status: "defer" }  // Not ready yet
  }

  // Subscribe to changes
  const unsubscribe = counterState.subscribe((value) => {
    console.log("Counter changed:", value)
    // Update UI reactively
  })

  // Store for component use
  cc.runtime.middlewareContext.set("basic-counter", counterState)

  // Cleanup on shutdown
  cc.fynUnit.shutdown = () => unsubscribe()

  return { status: "ready" }
}

// Consumer component code
function CounterDisplay({ runtime }) {
  const counter = runtime.middlewareContext.get("basic-counter")

  const [count, setCount] = useState(counter.get().count)

  useEffect(() => {
    return counter.subscribe((value) => {
      setCount(value.count)
    })
  }, [])

  return (
    <div>
      <div>Count: {count}</div>
      <button onClick={() => counter.update(c => ({
        ...c,
        count: c.count + 1
      }))}>
        Increment
      </button>
    </div>
  )
}
```

---

## Benefits of Recommended Architecture

### 1. Late Join Support ✅
```typescript
// Provider registers state
registry.provide("counter", { count: 10 })

// ... time passes ...

// Late consumer joins
const counter = registry.lookup("counter")  // ✅ Works!
counter.subscribe(value => updateUI(value))  // ✅ Immediate callback
```

### 2. Reactive Updates ✅
```typescript
// Provider updates
counter.update(c => ({ ...c, count: c.count + 1 }))

// All subscribed consumers notified immediately ✅
```

### 3. Scoped State ✅
```typescript
// Global counter (all regions)
kernel.getMiddlewareRegistry("global").provide("app-counter", ...)

// Region-specific counter
kernel.getMiddlewareRegistry({ region: "sidebar" }).provide("region-counter", ...)

// Lookup walks hierarchy: region -> global ✅
```

### 4. Lifecycle Independence ✅
```typescript
// State lives in registry, not in FynApp
// FynApp can unload, state persists ✅

// Provider FynApp unloads
fynApp1.shutdown()  // State remains in registry ✅

// Consumer still works
counter.get()  // ✅ Still accessible
```

### 5. Multi-Version Support ✅
```typescript
// Version in key
registry.provide("counter@1.0", counterV1)
registry.provide("counter@2.0", counterV2)

// Consumers specify version
registry.lookup("counter@1.0")  // ✅
registry.lookup("counter@2.0")  // ✅
```

---

## Migration Path

### Phase 1: Add Registry to Kernel
- Add `MiddlewareStateRegistry` class
- Add `getMiddlewareRegistry()` to kernel
- Keep existing `signalMiddlewareReady` for compatibility

### Phase 2: Update Basic Counter Middleware
- Provider uses `registry.provide()` instead of shareKey
- Consumer uses `registry.lookup()` instead of shareKey
- Test with shell demo

### Phase 3: Generalize Pattern
- Document pattern for other middleware
- Update design-tokens, react-context, etc.
- Create utility helpers

### Phase 4: Deprecate Old Pattern
- Mark shareKey pattern as deprecated
- Add migration guide
- Remove in next major version

---

## Alternative: Simpler Approach

If the full Observable pattern is too complex initially, start simpler:

```typescript
// Minimal registry without observables
class SimpleMiddlewareRegistry {
  private services: Map<string, any> = new Map()

  register(key: string, service: any) {
    this.services.set(key, service)
  }

  lookup(key: string): any {
    return this.services.get(key)
  }
}

// Provider
registry.register("basic-counter", counterObject)

// Consumer (late join works!)
const counter = registry.lookup("basic-counter")
```

Then add reactivity later as needed.

---

## Comparison with Other Systems

### React Context
- Scoped via component tree
- Late join via useContext hook
- ✅ Similar pattern - we'd use region hierarchy

### Angular DI
- Hierarchical injectors
- Service resolution walks tree
- ✅ Very similar to our scoped registry

### Vue Provide/Inject
- Component hierarchy
- Reactive by default
- ✅ Matches our Observable pattern

### Solid Signals
- Fine-grained reactivity
- Global or scoped stores
- ✅ Similar to ObservableState

**Conclusion:** Our pattern aligns with modern framework patterns.
