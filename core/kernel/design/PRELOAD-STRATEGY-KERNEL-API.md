# Kernel Preload Strategy API - Production Design

**Status**: Phase 2 (Depth Control) - ✅ **IMPLEMENTED AND VERIFIED**

## Problem Statement

The kernel needs a **production-ready, configurable preloading system** that:
1. Works out-of-the-box with sensible defaults
2. Allows applications to customize preload behavior
3. Adapts to network conditions automatically
4. Provides fine-grained control when needed
5. Is **not** a one-off demo hack

---

## Design Principles

### 1. **Sensible Defaults** (Zero Configuration)
The kernel should work optimally without any configuration:
```typescript
// Just works - smart defaults
await kernel.loadFynAppsByName([{ name: 'fynapp-1' }]);
```

### 2. **Progressive Configuration** (Opt-in Complexity)
Applications can progressively add more control:
```typescript
// Level 1: Simple depth control
await kernel.loadFynAppsByName(requests, { preloadDepth: 1 });

// Level 2: Full strategy configuration
await kernel.loadFynAppsByName(requests, {
  preloadStrategy: {
    depth: 1,
    priority: 'adaptive',
    respectDataSaver: true
  }
});
```

### 3. **Declarative Configuration** (Manifest-Based)
FynApps can declare preload hints in their manifests:
```json
{
  "name": "fynapp-dashboard",
  "preload-hints": {
    "priority": "critical",
    "dependencies": "immediate"
  }
}
```

### 4. **Adaptive by Default** (Network-Aware)
Kernel automatically adjusts to network conditions without app intervention.

---

## Proposed Kernel API

### Core Interface

```typescript
// kernel/src/types.ts

/**
 * Preload priority levels
 */
export enum PreloadPriority {
  /** Critical: modulepreload with fetchpriority="high" */
  CRITICAL = 'critical',

  /** Important: modulepreload with fetchpriority="auto" */
  IMPORTANT = 'important',

  /** Deferred: prefetch (idle time only) */
  DEFERRED = 'deferred',

  /** None: no preloading */
  NONE = 'none'
}

/**
 * Preload strategy configuration
 */
export interface PreloadStrategy {
  /**
   * Maximum dependency depth to preload
   * - 0: Only requested FynApps
   * - 1: Requested + immediate dependencies (recommended default)
   * - 2+: Include transitive dependencies
   * - Infinity: All dependencies (current behavior)
   * @default 1
   */
  depth?: number;

  /**
   * Priority assignment strategy
   * - 'static': Use fixed priority per depth
   * - 'adaptive': Adjust based on network conditions
   * - 'manifest': Use priorities from FynApp manifests
   * @default 'adaptive'
   */
  priority?: 'static' | 'adaptive' | 'manifest';

  /**
   * Priority mapping by depth (when priority='static')
   * @default { 0: 'critical', 1: 'important', 2: 'deferred' }
   */
  priorityByDepth?: Record<number, PreloadPriority>;

  /**
   * Respect user's data saver preference
   * When true, reduces preloading aggressiveness on metered connections
   * @default true
   */
  respectDataSaver?: boolean;

  /**
   * Disable preloading entirely
   * Useful for debugging or testing without preload
   * @default false
   */
  disabled?: boolean;

  /**
   * Custom preload callback for advanced use cases
   * Overrides default preload injection
   */
  customCallback?: (url: string, priority: PreloadPriority, depth: number) => void;
}

/**
 * Options for loadFynAppsByName
 */
export interface LoadFynAppsOptions {
  /**
   * Concurrency limit for parallel FynApp loading
   * @default 4
   */
  concurrency?: number;

  /**
   * Preload strategy configuration
   * Can be:
   * - number: shorthand for { depth: n }
   * - PreloadStrategy: full configuration
   * - undefined: use sensible defaults
   */
  preload?: number | PreloadStrategy;
}
```

---

## Implementation Architecture

### 1. **Preload Manager Module**

New module: `kernel/src/modules/preload-manager.ts`

```typescript
/**
 * Manages preload strategy and execution
 */
export class PreloadManager {
  private strategy: Required<PreloadStrategy>;
  private networkQuality: 'slow' | 'medium' | 'fast';
  private dataSaverEnabled: boolean;

  constructor(strategy?: PreloadStrategy) {
    // Initialize with defaults
    this.strategy = this.resolveStrategy(strategy);
    this.networkQuality = this.detectNetworkQuality();
    this.dataSaverEnabled = this.detectDataSaver();
  }

  /**
   * Determine if a URL should be preloaded based on depth
   */
  shouldPreload(depth: number): boolean {
    if (this.strategy.disabled) return false;
    return depth <= this.strategy.depth;
  }

  /**
   * Get priority for a given depth and context
   */
  getPriority(depth: number, manifestHints?: ManifestPreloadHints): PreloadPriority {
    // Adaptive strategy: adjust based on network
    if (this.strategy.priority === 'adaptive') {
      return this.getAdaptivePriority(depth);
    }

    // Manifest strategy: use hints from FynApp manifest
    if (this.strategy.priority === 'manifest' && manifestHints) {
      return this.resolvePriorityFromManifest(manifestHints, depth);
    }

    // Static strategy: use depth mapping
    return this.strategy.priorityByDepth[depth] || PreloadPriority.DEFERRED;
  }

  /**
   * Adaptive priority based on network conditions
   */
  private getAdaptivePriority(depth: number): PreloadPriority {
    // Respect data saver
    if (this.dataSaverEnabled && this.strategy.respectDataSaver) {
      return depth === 0 ? PreloadPriority.IMPORTANT : PreloadPriority.NONE;
    }

    // Slow connection: conservative
    if (this.networkQuality === 'slow') {
      if (depth === 0) return PreloadPriority.CRITICAL;
      if (depth === 1) return PreloadPriority.DEFERRED;
      return PreloadPriority.NONE;
    }

    // Medium connection: balanced
    if (this.networkQuality === 'medium') {
      if (depth === 0) return PreloadPriority.CRITICAL;
      if (depth === 1) return PreloadPriority.IMPORTANT;
      return PreloadPriority.DEFERRED;
    }

    // Fast connection: aggressive
    if (depth === 0) return PreloadPriority.CRITICAL;
    if (depth === 1) return PreloadPriority.IMPORTANT;
    if (depth === 2) return PreloadPriority.DEFERRED;
    return PreloadPriority.NONE;
  }

  /**
   * Detect network quality using Network Information API
   */
  private detectNetworkQuality(): 'slow' | 'medium' | 'fast' {
    const connection = (navigator as any).connection;
    if (!connection) return 'fast'; // Assume fast if unknown

    const effectiveType = connection.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      return 'slow';
    } else if (effectiveType === '3g') {
      return 'medium';
    } else {
      return 'fast'; // 4g, 5g
    }
  }

  /**
   * Detect if user enabled data saver
   */
  private detectDataSaver(): boolean {
    const connection = (navigator as any).connection;
    return connection?.saveData === true;
  }

  /**
   * Resolve strategy with defaults
   */
  private resolveStrategy(strategy?: PreloadStrategy): Required<PreloadStrategy> {
    return {
      depth: strategy?.depth ?? 1,
      priority: strategy?.priority ?? 'adaptive',
      priorityByDepth: strategy?.priorityByDepth ?? {
        0: PreloadPriority.CRITICAL,
        1: PreloadPriority.IMPORTANT,
        2: PreloadPriority.DEFERRED
      },
      respectDataSaver: strategy?.respectDataSaver ?? true,
      disabled: strategy?.disabled ?? false,
      customCallback: strategy?.customCallback
    };
  }
}
```

---

### 2. **Browser Kernel Integration**

Update `browser-kernel.ts`:

```typescript
export class BrowserKernel extends FynMeshKernelCore {
  private preloadManager?: PreloadManager;

  /**
   * Inject preload/prefetch link based on priority
   */
  private injectPreloadLink(url: string, priority: PreloadPriority): void {
    const link = document.createElement('link');

    switch (priority) {
      case PreloadPriority.CRITICAL:
        link.rel = 'modulepreload';
        link.as = 'script';
        if ('fetchPriority' in HTMLLinkElement.prototype) {
          (link as any).fetchPriority = 'high';
        }
        break;

      case PreloadPriority.IMPORTANT:
        link.rel = 'modulepreload';
        link.as = 'script';
        // fetchPriority='auto' is default
        break;

      case PreloadPriority.DEFERRED:
        link.rel = 'prefetch';
        link.as = 'script';
        break;

      case PreloadPriority.NONE:
        return; // Don't inject any link
    }

    link.href = url;
    console.debug(`🔗 Injecting ${link.rel} link: ${url} (priority: ${priority})`);
    document.head.appendChild(link);
  }

  /**
   * Configure preload strategy (called during loadFynAppsByName)
   */
  private configurePreloadStrategy(options?: LoadFynAppsOptions): void {
    // Convert shorthand to full strategy
    let strategy: PreloadStrategy | undefined;

    if (typeof options?.preload === 'number') {
      strategy = { depth: options.preload };
    } else if (options?.preload) {
      strategy = options.preload;
    }

    this.preloadManager = new PreloadManager(strategy);

    // Set up preload callback with manager
    this.setPreloadCallback((url: string, depth: number, manifestHints?: any) => {
      if (this.preloadManager!.shouldPreload(depth)) {
        const priority = this.preloadManager!.getPriority(depth, manifestHints);

        // Allow custom callback override
        if (this.preloadManager!['strategy'].customCallback) {
          this.preloadManager!['strategy'].customCallback(url, priority, depth);
        } else {
          this.injectPreloadLink(url, priority);
        }
      }
    });
  }
}
```

---

### 3. **Manifest Resolver Integration**

Update `manifest-resolver.ts` to track depth:

```typescript
export class ManifestResolver {
  private preloadCallback?: (url: string, depth: number, hints?: ManifestPreloadHints) => void;

  /**
   * Preload an entry file with depth tracking
   */
  private preloadEntryFile(
    name: string,
    distBase: string,
    depth: number,
    manifestHints?: ManifestPreloadHints
  ): void {
    const entryUrl = `${distBase}fynapp-entry.js`;

    if (this.preloadedEntries.has(entryUrl)) {
      return; // Already preloaded
    }

    this.preloadedEntries.add(entryUrl);

    if (this.preloadCallback) {
      console.debug(`⚡ Preloading entry file: ${entryUrl} (depth: ${depth})`);
      this.preloadCallback(entryUrl, depth, manifestHints);
    }
  }

  /**
   * Build dependency graph with depth tracking
   */
  async buildGraph(
    requests: Array<{ name: string; range?: string }>
  ): Promise<Map<string, NodeMeta>> {
    const graph = new Map<string, NodeMeta>();
    const visited = new Set<string>();

    const visit = async (
      name: string,
      range: string | undefined,
      parent: string | null,
      depth: number  // ← Track depth
    ): Promise<string> => {
      // ... existing logic ...

      // Preload with depth information
      const manifestHints = manifest['preload-hints'];
      this.preloadEntryFile(name, distBase, depth, manifestHints);

      // Visit dependencies with incremented depth
      for (const req of requires) {
        await visit(req.name, req.range, key, depth + 1);  // ← Increment depth
      }

      // ... etc
    };

    // Start with depth 0 for requested FynApps
    for (const req of requests) {
      await visit(req.name, req.range, null, 0);
    }

    return graph;
  }
}
```

---

### 4. **Manifest Schema Extension**

Add optional preload hints to `fynapp.manifest.json`:

```json
{
  "name": "fynapp-dashboard",
  "version": "1.0.0",

  "preload-hints": {
    "priority": "critical",
    "dependencies": "immediate"
  },

  "requires": [...],
  "import-exposed": {...}
}
```

**Fields:**
- `priority`: `"critical"` | `"important"` | `"deferred"` | `"none"`
- `dependencies`: `"immediate"` (depth 1) | `"transitive"` (depth 2) | `"all"` (infinity)

---

## Usage Examples

### Example 1: Zero Configuration (Recommended Default)

```typescript
// Just works - adaptive preloading with depth=1
await kernel.loadFynAppsByName([
  { name: 'fynapp-dashboard' },
  { name: 'fynapp-charts' }
]);
```

**Behavior:**
- Fast connection: Preloads requested + immediate deps with appropriate priorities
- Slow connection: Only critical preloads, defers dependencies
- Data saver: Minimal preloading

---

### Example 2: Simple Depth Control

```typescript
// Conservative: only requested FynApps
await kernel.loadFynAppsByName(requests, { preload: 0 });

// Balanced: requested + immediate deps (default)
await kernel.loadFynAppsByName(requests, { preload: 1 });

// Aggressive: include transitive deps
await kernel.loadFynAppsByName(requests, { preload: 2 });
```

---

### Example 3: Full Strategy Configuration

```typescript
await kernel.loadFynAppsByName(requests, {
  concurrency: 4,
  preload: {
    depth: 1,
    priority: 'static',
    priorityByDepth: {
      0: PreloadPriority.CRITICAL,
      1: PreloadPriority.DEFERRED  // Defer all dependencies
    },
    respectDataSaver: true
  }
});
```

---

### Example 4: Disable Preloading (Testing/Debug)

```typescript
// Completely disable preloading
await kernel.loadFynAppsByName(requests, {
  preload: { disabled: true }
});
```

---

### Example 5: Custom Preload Logic

```typescript
await kernel.loadFynAppsByName(requests, {
  preload: {
    depth: 2,
    customCallback: (url, priority, depth) => {
      // Custom logic: log to analytics
      analytics.track('preload', { url, priority, depth });

      // Custom injection with your own strategy
      if (priority === PreloadPriority.CRITICAL) {
        document.head.appendChild(createPreloadLink(url, 'high'));
      }
    }
  }
});
```

---

## Build-Time Integration (Phase 0)

### Static Preload Analyzer

```typescript
// CLI tool: fyn analyze-preload

import { StaticPreloadAnalyzer } from 'fynmesh-kernel/analyzer';

const analyzer = new StaticPreloadAnalyzer();

// Generate preload tags with strategy
const tags = await analyzer.generatePreloadTags({
  entryFynApps: ['fynapp-dashboard'],
  strategy: {
    depth: 1,
    priority: 'static',
    priorityByDepth: {
      0: PreloadPriority.CRITICAL,
      1: PreloadPriority.IMPORTANT
    }
  }
});

// Output:
// <link rel="modulepreload" href="/fynapp-dashboard/dist/fynapp-entry.js" fetchpriority="high">
// <link rel="modulepreload" href="/fynapp-middleware/dist/fynapp-entry.js" fetchpriority="auto">
```

---

## Kernel Configuration Object (Global Defaults)

```typescript
// Set kernel-wide defaults
const kernel = createBrowserKernel({
  preload: {
    depth: 1,
    priority: 'adaptive',
    respectDataSaver: true
  }
});

// Override per load
await kernel.loadFynAppsByName(requests, {
  preload: { depth: 2 }  // Override just depth
});
```

---

## Logging and Debugging

### Debug Mode

```typescript
// Enable debug logging
const kernel = createBrowserKernel({ debug: true });

// Console output:
// [FynMesh] Network: fast (4g), Data Saver: off
// [FynMesh] Preload strategy: adaptive, depth: 1
// [FynMesh] 🔗 Injecting modulepreload: /fynapp-1/dist/fynapp-entry.js (priority: critical, depth: 0)
// [FynMesh] 🔗 Injecting modulepreload: /fynapp-middleware/dist/fynapp-entry.js (priority: important, depth: 1)
// [FynMesh] ⏭️  Skipping preload: /fynapp-utils/dist/fynapp-entry.js (depth: 2 > max: 1)
```

---

## Performance Monitoring API

```typescript
// Get preload metrics
const metrics = kernel.getPreloadMetrics();

console.log(metrics);
// {
//   totalPreloaded: 12,
//   byPriority: {
//     critical: 3,
//     important: 6,
//     deferred: 3
//   },
//   byDepth: {
//     0: 3,
//     1: 9
//   },
//   networkQuality: 'fast',
//   dataSaverEnabled: false
// }
```

---

## Migration Path

### Phase 1: Basic Implementation ✅ COMPLETE
- Simple preloading works
- Entry files preloaded during graph building
- No depth control
- No priority levels

### Phase 2: Depth Control ✅ COMPLETE (2025-11-03)
- ✅ Add `preload: number` shorthand
- ✅ Add depth tracking to ManifestResolver
- ✅ Default to depth=1
- ✅ Add filtering logic in BrowserKernel
- ✅ Update preload callback signature
- **Verification**: 13 preloads (depth≤1) vs 15 (unlimited depth)
- **Files Modified**: types.ts, manifest-resolver.ts, browser-kernel.ts, kernel-core.ts

### Phase 3: Priority System (PENDING)
- Implement PreloadManager
- Add adaptive strategy
- Support fetchpriority attribute
- Use `rel="prefetch"` for deferred priority

### Phase 4: Manifest Hints (PENDING)
- Add preload-hints to manifest schema
- Implement manifest-based priority resolution

### Phase 5: Build-Time Integration (PENDING)
- Static analyzer with strategy support
- Route-based preload generation

---

## Testing Strategy

### Unit Tests

```typescript
describe('PreloadManager', () => {
  it('should use critical priority for depth 0 on fast connection', () => {
    const manager = new PreloadManager({ priority: 'adaptive' });
    manager['networkQuality'] = 'fast';
    expect(manager.getPriority(0)).toBe(PreloadPriority.CRITICAL);
  });

  it('should respect data saver preference', () => {
    const manager = new PreloadManager({ respectDataSaver: true });
    manager['dataSaverEnabled'] = true;
    expect(manager.getPriority(1)).toBe(PreloadPriority.NONE);
  });
});
```

### Integration Tests

```typescript
describe('Kernel Preloading', () => {
  it('should inject modulepreload for depth 0', async () => {
    await kernel.loadFynAppsByName([{ name: 'fynapp-1' }], { preload: 1 });

    const links = document.querySelectorAll('link[rel="modulepreload"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should inject prefetch for depth 2+', async () => {
    await kernel.loadFynAppsByName([{ name: 'fynapp-1' }], { preload: 2 });

    const prefetch = document.querySelectorAll('link[rel="prefetch"]');
    expect(prefetch.length).toBeGreaterThan(0);
  });
});
```

---

## Documentation Requirements

1. **API Reference** - Document all interfaces and options
2. **Migration Guide** - How to upgrade from simple preloading
3. **Best Practices** - Recommended strategies for different app types
4. **Examples** - Real-world usage patterns
5. **Performance Guide** - How to measure and optimize

---

## Summary: What the Kernel Provides

### Core Capabilities

✅ **Zero-config sensible defaults**
- Adaptive preloading with depth=1
- Network-aware strategy
- Data saver respect

✅ **Progressive configuration**
- Simple: `preload: number` (depth shorthand)
- Full: `PreloadStrategy` object with all options

✅ **Production-ready features**
- Depth control (prevent transitive explosion)
- Priority levels (critical/important/deferred/none)
- Adaptive strategy (network conditions)
- Manifest-based hints
- Custom callback support

✅ **Debugging and monitoring**
- Debug logging
- Performance metrics
- Strategy introspection

✅ **Browser facility integration**
- `rel="modulepreload"` for high priority
- `rel="prefetch"` for deferred
- `fetchpriority` attribute (progressive enhancement)
- Network Information API (adaptive)

### NOT a One-Off Demo

This is a **production kernel feature** with:
- Well-defined API surface
- Clear upgrade path
- Comprehensive testing
- Full documentation
- Extensibility for future needs

---

## Implementation Status (2025-11-03)

### ✅ Phase 2 Complete - Depth Control

**What Works Now:**

```typescript
// Default behavior (depth=1)
await kernel.loadFynAppsByName([{ name: 'fynapp-1' }]);
// → Preloads: requested FynApps + immediate dependencies only

// Shorthand syntax
await kernel.loadFynAppsByName(requests, { preload: 0 });  // Only requested
await kernel.loadFynAppsByName(requests, { preload: 1 });  // + immediate deps (default)
await kernel.loadFynAppsByName(requests, { preload: 2 });  // + transitive deps

// Full strategy object
await kernel.loadFynAppsByName(requests, {
  preload: {
    depth: 1,
    disabled: false  // Can disable entirely
  }
});
```

**Implementation Details:**
- **types.ts**: Added `PreloadPriority` enum, `PreloadStrategy` interface, `LoadFynAppsOptions`
- **manifest-resolver.ts**: Tracks depth during graph traversal, passes depth to preload callback
- **browser-kernel.ts**: Filters preloads based on strategy.depth, manages strategy per load
- **kernel-core.ts**: Updated signatures to accept `LoadFynAppsOptions`, passes depth=0 for requested FynApps

**Verification Results:**
- Default depth=1 reduces preloads from 15 → 13 (13% reduction)
- Console logs show: `⚡ Preloading (depth: X)` and `⏭️ Depth 2 > max 1, skipping`
- All 13 modulepreload links correctly injected
- No functionality regression - FynApps load normally

**See**: `/Users/jc/dev/fynmesh/.temp/depth-control-verification.md` for full test report

### 🔜 Next: Phase 3 - Priority System

When ready to implement:
1. Add `PreloadManager` class to handle priority logic
2. Update `injectPreloadLink()` to support `fetchpriority` attribute
3. Add `rel="prefetch"` for deferred priority
4. Implement adaptive strategy based on Network Information API
5. Add metrics tracking

**Recommended Approach**: Start with static priority mapping (priorityByDepth), then add adaptive layer.
