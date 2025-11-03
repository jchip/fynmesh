# Route-Based Preloading Optimization - Design Document

**Status:** Partially Implemented
**Date:** 2025-11-02
**Last Updated:** 2025-11-02
**Prerequisites:** Routing system implementation (for route-specific optimization)

## Implementation Status

### ✅ Completed: Runtime Preloading
The kernel now implements a sophisticated three-phase preloading system:
- **Pre-entry preloading:** Entry files preloaded before dependency graph traversal
- **During-graph preloading:** Dependencies preloaded in parallel with graph building
- **Runtime loading:** Actual module execution via Federation
- **Optimizations:** Embedded manifest extraction, deduplication, configurable concurrency

See `ManifestResolver.preloadEntryFile()` and `BrowserKernel.injectPreloadLink()` for implementation.

### ⏳ Proposed: Route-Based Optimization
The features below describe route-based enhancements that build on the existing runtime preloading system. These require routing system implementation first.

## Overview

Design for optimizing FynApp preloading based on route patterns. The kernel will track, analyze, and optimize which FynApps are loaded for specific routes to improve perceived performance.

## Problem Statement

Current runtime preloading loads all FynApp entry files upfront (entire dependency graph). With routing, we want:
1. Load only FynApps needed for the current route
2. Preload FynApps for likely-next routes
3. Generate static preload directives based on usage patterns

## Proposed Approaches

### Approach 1: Analytics-Based Collection & Reporting

**Concept:** Kernel tracks which FynApps are loaded per route, exports data for analysis.

**Implementation:**
```typescript
class FynMeshKernel {
  private routeManifest: Map<string, Set<string>> = new Map();

  // Track which FynApps are used on which route
  recordRouteUsage(route: string, fynAppNames: string[]) {
    if (!this.routeManifest.has(route)) {
      this.routeManifest.set(route, new Set());
    }
    fynAppNames.forEach(name =>
      this.routeManifest.get(route)!.add(name)
    );
  }

  // Export collected data
  exportRouteManifest(): RouteManifest {
    const manifest = {};
    for (const [route, fynApps] of this.routeManifest) {
      manifest[route] = Array.from(fynApps);
    }
    return manifest;
  }

  // Developer can download manifest for analysis
  downloadRouteManifest() {
    const json = JSON.stringify(this.exportRouteManifest(), null, 2);
    // Trigger download or send to analytics
  }
}
```

**Manifest Format:**
```json
{
  "/dashboard": ["fynapp-charts", "fynapp-data-grid", "fynapp-filters"],
  "/profile": ["fynapp-user-card", "fynapp-settings"],
  "/admin/*": ["fynapp-admin-panel", "fynapp-users-table"]
}
```

**Strengths:**
- ✅ Simple to implement
- ✅ Leverages real usage patterns
- ✅ Can generate static preload directives
- ✅ No runtime overhead once directives in place
- ✅ Works well with CDN/edge caching

**Challenges:**
- ⚠️ Requires instrumentation/analytics period
- ⚠️ Static directives may become stale
- ⚠️ Need to handle route parameters (e.g., `/user/:id`)
- ⚠️ Manual process to update preload directives

---

### Approach 2: Predictive Preloading Based on Navigation Patterns

**Concept:** Kernel learns navigation patterns and preemptively loads likely-next routes.

**Implementation:**
```typescript
class NavigationPredictor {
  private navigationGraph: Map<string, Map<string, number>> = new Map();

  // Track route transitions
  recordTransition(from: string, to: string) {
    if (!this.navigationGraph.has(from)) {
      this.navigationGraph.set(from, new Map());
    }
    const transitions = this.navigationGraph.get(from)!;
    transitions.set(to, (transitions.get(to) || 0) + 1);
  }

  // Get likely next routes
  predictNextRoutes(currentRoute: string, threshold = 0.3): string[] {
    const transitions = this.navigationGraph.get(currentRoute);
    if (!transitions) return [];

    const total = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
    return Array.from(transitions.entries())
      .filter(([_, count]) => count / total >= threshold)
      .map(([route, _]) => route);
  }

  // Preload predicted routes during idle time
  async preloadPredictedRoutes(currentRoute: string, kernel: FynMeshKernel) {
    const nextRoutes = this.predictNextRoutes(currentRoute);

    requestIdleCallback(() => {
      nextRoutes.forEach(route => {
        const fynApps = this.getRouteManifest(route);
        kernel.preloadFynApps(fynApps);
      });
    });
  }
}
```

**Navigation Graph Example:**
```typescript
{
  "/dashboard": {
    "/reports": 0.7,      // 70% probability
    "/settings": 0.2,
    "/logout": 0.1
  }
}
```

**Strengths:**
- ✅ Improves perceived performance dramatically
- ✅ Self-optimizing based on actual user behavior
- ✅ No build-time dependency
- ✅ Adapts to changing usage patterns

**Challenges:**
- ⚠️ More complex implementation
- ⚠️ Requires persistent storage (localStorage/IndexedDB)
- ⚠️ Cold start problem (no data initially)
- ⚠️ May preload unnecessary FynApps

---

### Approach 3: Server-Driven Route Manifest

**Concept:** Server maintains canonical route→FynApp mapping and serves it to kernel.

**Route Manifest API:**
```typescript
// GET /api/route-manifest.json
{
  "version": "1.2.0",
  "routes": {
    "/dashboard": {
      "fynApps": ["fynapp-charts@1.2.0", "fynapp-grid@2.0.0"],
      "priority": "high",
      "preconnect": ["https://api.example.com"]
    },
    "/profile": {
      "fynApps": ["fynapp-user-card@1.0.0"],
      "priority": "medium"
    }
  }
}
```

**Kernel Integration:**
```typescript
class RouteManifestLoader {
  private manifest: RouteManifest | null = null;

  async loadManifest() {
    const response = await fetch('/api/route-manifest.json');
    this.manifest = await response.json();
  }

  // Preload on route change
  async handleRouteChange(to: string, kernel: FynMeshKernel) {
    if (!this.manifest) await this.loadManifest();

    const routeConfig = this.manifest.routes[to];
    if (routeConfig) {
      await kernel.preloadFynApps(routeConfig.fynApps);
    }
  }
}
```

**Strengths:**
- ✅ Centralized control
- ✅ Can be updated without redeploying client
- ✅ Supports A/B testing of preload strategies
- ✅ Version control and rollback support

**Challenges:**
- ⚠️ Additional network request
- ⚠️ Server infrastructure required
- ⚠️ Need to keep manifest in sync with app

---

### Approach 4: Declarative Route Config with Auto-Preload

**Concept:** Define routes with FynApp dependencies declaratively in code.

**Route Configuration:**
```typescript
const routes = [
  {
    path: '/dashboard',
    fynApps: ['fynapp-charts', 'fynapp-data-grid'],
    preload: 'onIdle' // 'immediate' | 'onHover' | 'onIdle'
  },
  {
    path: '/profile',
    fynApps: ['fynapp-user-card'],
    preload: 'immediate'
  },
  {
    path: '/admin/*',
    fynApps: ['fynapp-admin-panel'],
    preload: 'onHover',
    children: [
      {
        path: 'users',
        fynApps: ['fynapp-users-table']
      }
    ]
  }
];

// Kernel automatically handles preloading
kernel.registerRoutes(routes);
```

**Preload Strategies:**
- `immediate`: Preload as soon as route is registered
- `onIdle`: Preload during browser idle time
- `onHover`: Preload when user hovers over navigation link
- `onVisible`: Preload when route link is visible in viewport

**Strengths:**
- ✅ Explicit and maintainable
- ✅ Type-safe with TypeScript
- ✅ Supports different strategies per route
- ✅ Integrates well with route guards
- ✅ Can generate static preload tags at build time

**Challenges:**
- ⚠️ Manual maintenance required
- ⚠️ May diverge from actual usage
- ⚠️ Requires updating when adding FynApps

---

### Approach 5: Static Manifest Analysis (Build-Time)

**Concept:** Analyze FynApp manifests at build time to generate optimal preload directives without runtime instrumentation.

**Key Insight:** We already have `ManifestResolver.buildGraph()` that resolves the complete dependency tree. We can run this analysis at build time to generate static `<link rel="modulepreload">` tags.

**Implementation:**

```typescript
// CLI tool: fyn analyze-preload
class StaticPreloadAnalyzer {
  async analyzeApp(entryFynApps: string[]): Promise<PreloadDirectives> {
    // Reuse existing ManifestResolver
    const resolver = new ManifestResolver();
    resolver.setRegistryResolver(this.buildTimeResolver);

    // Build complete dependency graph
    const graph = await resolver.buildGraph(
      entryFynApps.map(name => ({ name }))
    );
    const batches = resolver.topoBatches(graph);
    const allMeta = resolver.getAllNodeMeta();

    // Extract all entry file URLs
    const preloadUrls: string[] = [];
    for (const batch of batches) {
      for (const key of batch) {
        const meta = allMeta.get(key)!;
        preloadUrls.push(`${meta.distBase}fynapp-entry.js`);
      }
    }

    return {
      modulepreload: preloadUrls,
      // Can also analyze for other resource hints
      preconnect: this.extractApiOrigins(allMeta),
      dns-prefetch: this.extractCdnOrigins(allMeta)
    };
  }

  // Generate HTML tags
  generateHtmlTags(directives: PreloadDirectives): string {
    const tags: string[] = [];

    for (const url of directives.modulepreload) {
      tags.push(`<link rel="modulepreload" href="${url}" as="script">`);
    }

    for (const origin of directives.preconnect || []) {
      tags.push(`<link rel="preconnect" href="${origin}">`);
    }

    return tags.join('\n');
  }
}
```

**Build Integration:**

```typescript
// In demo-server build process
import { StaticPreloadAnalyzer } from 'fynmesh-kernel/analyzer';

const analyzer = new StaticPreloadAnalyzer();

// Analyze for entire app
const directives = await analyzer.analyzeApp([
  'fynapp-design-tokens',
  'fynapp-react-middleware',
  'fynapp-x1-v2'
]);

// Inject into index.html
const preloadTags = analyzer.generateHtmlTags(directives);
injectIntoHtml('dist/index.html', preloadTags);
```

**Route-Specific Analysis:**

```typescript
// Analyze per route if route config provided
const routeConfig = {
  '/': ['fynapp-x1-v2', 'fynapp-design-tokens'],
  '/dashboard': ['fynapp-charts', 'fynapp-data-grid'],
  '/admin': ['fynapp-admin-panel']
};

const routeDirectives = await analyzer.analyzeRoutes(routeConfig);

// Generate route-specific HTML files or conditional tags
for (const [route, directives] of Object.entries(routeDirectives)) {
  const tags = analyzer.generateHtmlTags(directives);
  // SSR: inject into route-specific HTML
  // or store for runtime conditional injection
}
```

**Strengths:**
- ✅ **Zero runtime overhead** - All analysis done at build time
- ✅ **Deterministic** - Same manifests = same directives
- ✅ **Reuses existing code** - ManifestResolver already does the work
- ✅ **Works with SSR/SSG** - Generate perfect HTML on first load
- ✅ **No instrumentation needed** - No analytics or runtime tracking
- ✅ **Complete dependency graph** - Captures all transitive deps
- ✅ **CDN-friendly** - Static tags can be edge-cached
- ✅ **Progressive enhancement** - Browsers without modulepreload just work

**Challenges:**
- ⚠️ Requires build-time manifest access (need registry resolver for build)
- ⚠️ For route-specific optimization, need explicit route→FynApp mapping
- ⚠️ Rebuilds needed when dependencies change
- ⚠️ May preload unused FynApps if route mapping is too coarse

**What Can Be Extracted:**

From manifests we already parse:
- **Entry files:** `fynapp-entry.js` for each FynApp
- **Dependencies:** All transitive deps via `requires`, `import-exposed`, `shared-providers`
- **Versions:** Exact versions for cache busting
- **Origins:** Can extract API/CDN origins for `preconnect`

**Output Formats:**

1. **HTML tags** - Direct injection into `<head>`
2. **JSON manifest** - For runtime conditional loading
3. **HTTP/2 Push manifest** - For server push
4. **Webpack hints** - For bundler integration

**Example Output:**

```html
<!-- Generated by: fyn analyze-preload -->
<link rel="modulepreload" href="/fynapp-design-tokens/dist/fynapp-entry.js" as="script">
<link rel="modulepreload" href="/fynapp-react-middleware/dist/fynapp-entry.js" as="script">
<link rel="modulepreload" href="/fynapp-x1-v2/dist/fynapp-entry.js" as="script">
<link rel="preconnect" href="https://api.example.com">
```

---

## Recommended Implementation Strategy

### Phase 0: Static Manifest Analysis (Immediate)
**Goal:** Build-time generation of preload directives from manifests

**Implementation:**
1. Create `StaticPreloadAnalyzer` class that reuses `ManifestResolver`
2. Build CLI tool: `fyn analyze-preload <app-names>`
3. Generate HTML `<link rel="modulepreload">` tags
4. Integrate into demo-server build process
5. Support route-specific analysis with config file

**Advantages:**
- Can be implemented immediately (no routing system needed)
- Zero runtime overhead
- Reuses 100% of existing manifest resolution code
- Works perfectly for current demo (entire app preload)
- Easily extends to route-based when routing is ready

**Timeline:** Can implement now

---

### Phase 1: Collection & Reporting (After Routing)
**Goal:** Gather real-world data about route→FynApp relationships

**Implementation:**
1. Add `recordRouteUsage()` API to kernel
2. Hook into routing system to track FynApp loads per route
3. Provide `exportRouteManifest()` for developers
4. Use collected data to refine static analysis configs

**Timeline:** After routing system is implemented

---

### Phase 2: Declarative Route Config
**Goal:** Explicit control over route-based preloading

**Implementation:**
1. Add `registerRoutes()` API to kernel
2. Support multiple preload strategies (immediate/onIdle/onHover)
3. Feed route config into `StaticPreloadAnalyzer` at build time
4. Runtime fallback for dynamic route changes

**Timeline:** Once patterns are established from Phase 1 data

---

### Phase 3: Predictive Preloading
**Goal:** Automatic optimization based on user behavior

**Implementation:**
1. Track navigation transitions
2. Build probabilistic navigation graph
3. Preload likely-next routes during idle time
4. Fall back to declarative config if no data

**Timeline:** After Phase 2 is stable

---

### Phase 4: Server-Driven Optimization
**Goal:** Real-time control and A/B testing

**Implementation:**
1. Create route manifest API endpoint
2. Kernel fetches and caches manifest
3. Support versioning and updates
4. A/B testing infrastructure

**Timeline:** When advanced optimization is needed

---

## API Design

### Kernel Methods

```typescript
interface FynMeshKernel {
  // Phase 1: Collection
  recordRouteUsage(route: string, fynAppNames: string[]): void;
  exportRouteManifest(): RouteManifest;
  downloadRouteManifest(): void;

  // Phase 2: Declarative
  registerRoutes(routes: RouteConfig[]): void;
  preloadRoute(route: string): Promise<void>;

  // Phase 3: Predictive
  recordNavigation(from: string, to: string): void;
  getPredictedRoutes(currentRoute: string): string[];

  // Phase 4: Server-Driven
  loadRouteManifest(url: string): Promise<void>;
  updateRouteManifest(manifest: RouteManifest): void;
}
```

### Data Types

```typescript
interface RouteManifest {
  version?: string;
  routes: Record<string, RouteEntry>;
}

interface RouteEntry {
  fynApps: string[];
  priority?: 'high' | 'medium' | 'low';
  preload?: PreloadStrategy;
  preconnect?: string[];
}

type PreloadStrategy = 'immediate' | 'onIdle' | 'onHover' | 'onVisible';

interface RouteConfig {
  path: string;
  fynApps: string[];
  preload?: PreloadStrategy;
  children?: RouteConfig[];
}
```

---

## Integration Points

### With Routing System
1. Hook into route change events
2. Track FynApp loads per route
3. Trigger preloading based on strategy

### With Build Tools
1. Generate static preload tags from manifest
2. Inject route-specific tags into HTML
3. Support SSR/SSG workflows

### With Analytics
1. Export route manifest data
2. Track preload effectiveness
3. A/B testing support

---

## Performance Considerations

### Trade-offs
- **Eager preloading:** Faster perceived performance, higher bandwidth usage
- **Lazy preloading:** Lower bandwidth, slower navigation
- **Predictive:** Best balance, requires learning period

### Optimization Strategies
1. Use `requestIdleCallback` for background preloading
2. Respect user's data saver preferences
3. Implement priority-based preloading
4. Cache route manifests in localStorage
5. Use HTTP/2 push for critical routes

---

## Next Steps

1. ✅ **Complete:** Runtime preloading (dynamic injection during graph build)
2. ⏳ **Next:** Implement Phase 0 - Static manifest analysis and CLI tool
3. ⏳ **Future:** Design and implement routing system
4. ⏳ **Future:** Implement Phase 1 route collection API
5. ⏳ **Future:** Gather real-world usage data and refine configs

---

## Open Questions

1. How to handle dynamic routes with parameters (e.g., `/user/:id`)?
2. Should we support route-level code splitting in addition to FynApp-level?
3. How to handle nested routes and their FynApp dependencies?
4. What's the best way to version route manifests?
5. Should we support preloading middleware separately from FynApps?
6. How to integrate with lazy-loaded chunks within FynApps?

---

## References

- [Resource Hints Spec](https://www.w3.org/TR/resource-hints/)
- [Quicklink Library](https://github.com/GoogleChromeLabs/quicklink)
- [Guess.js Predictive Prefetching](https://github.com/guess-js/guess)
- [Next.js Prefetching](https://nextjs.org/docs/api-reference/next/link#prefetch)
