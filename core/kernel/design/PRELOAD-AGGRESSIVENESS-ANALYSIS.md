# Preload Aggressiveness Analysis

## Issue: Potential Over-Preloading

**Concern:** Current preloading strategy may be too aggressive, causing initial load delays by preloading too many resources upfront.

---

## Current Behavior

### What's Being Preloaded

**Demo configuration:** 8 eager FynApps requested
```javascript
requested = [
  { name: "fynapp-1" },
  { name: "fynapp-1-b" },
  { name: "fynapp-3-marko" },
  { name: "fynapp-4-vue" },
  { name: "fynapp-5-preact" },
  { name: "fynapp-6-react" },
  { name: "fynapp-7-solid" },
  { name: "fynapp-8-svelte" }
];
```

**Actual preloaded:** 15 entry files
- 8 requested FynApps
- 7 transitive dependencies (middleware, shared providers, component libraries)

### Preloading Strategy (Current)

```typescript
// Phase 1: Pre-entry preloading (kernel-core.ts:142-152)
for (const req of requests) {
  const entryUrl = `${distBase}fynapp-entry.js`;
  preloadCallback(entryUrl);  // ← Preload ALL requested FynApps
}

// Phase 2: During-graph preloading (manifest-resolver.ts:227-274)
// For EVERY dependency discovered:
- requires: this.preloadEntryFile(req.name, reqDistBase);
- import-exposed: this.preloadEntryFile(packageName, importDistBase);
- shared-providers: this.preloadEntryFile(packageName, sharedDistBase);
```

**Result:** Preloads **ENTIRE dependency graph transitively**

---

## Analysis: Is This Too Aggressive?

### ✅ Good Aspects

1. **Eliminates Sequential Fetches**
   - Without preload: fetch manifest → wait → fetch entry → wait (per FynApp)
   - With preload: fetch manifests + entries in parallel → faster

2. **Utilizes Browser Parallelism**
   - Modern browsers handle 6-10 parallel connections per domain
   - HTTP/2 multiplexing allows many concurrent requests
   - 15 preloads ≈ 2-3 waves of parallel fetches (acceptable)

3. **Actual File Sizes Are Small**
   - Entry files are typically 10-50KB each
   - 15 files × 30KB average = 450KB total
   - Not excessive for modern connections

4. **Deduplication Works**
   - No duplicate preloads (verified via Set)
   - Each dependency preloaded exactly once

### ⚠️ Potential Issues

1. **Bandwidth Contention**
   - 15 parallel preloads compete with:
     - HTML document
     - CSS files
     - Critical JS bundles
     - Images and fonts
   - May delay **critical resources** on slow connections

2. **Low-Priority vs High-Priority Resources**
   - All preloads have same priority
   - No distinction between:
     - Critical (needed for initial render)
     - Important (needed soon)
     - Nice-to-have (prefetch for later)

3. **Transitive Dependencies Auto-Included**
   - If `fynapp-1` depends on `fynapp-middleware`
   - And `fynapp-middleware` depends on `fynapp-shared-lib`
   - Both get preloaded even if not immediately needed
   - No control over depth

4. **No Route-Based Filtering**
   - Demo loads all 8 FynApps eagerly
   - In a real app, might only need 2-3 for initial route
   - 15 preloads for 2-3 active FynApps = wasteful

---

## Real-World Impact Assessment

### Demo Scenario (8 eager FynApps)
- **15 preloads** for 8 FynApps + dependencies
- **Verdict:** ⚠️ Borderline aggressive
  - Acceptable for demo/monolithic apps
  - May cause issues on slow connections
  - Critical path could be delayed

### Typical SPA (2-3 FynApps per route)
- **Estimated:** 5-7 preloads for 2-3 FynApps + dependencies
- **Verdict:** ✅ Reasonable
  - Won't block critical resources
  - Good balance of preloading vs initial load

### Large App (10+ eager FynApps)
- **Estimated:** 20-30+ preloads
- **Verdict:** ❌ Too aggressive
  - Will definitely delay initial render
  - Should use route-based lazy loading

---

## Recommended Optimizations

### 1. **Priority-Based Preloading** (High Priority)

Add priority levels to control preload aggressiveness:

```typescript
enum PreloadPriority {
  CRITICAL = "high",    // Immediate dependencies (depth 0)
  IMPORTANT = "low",    // First-level dependencies (depth 1)
  PREFETCH = "prefetch" // Transitive dependencies (depth 2+)
}

interface PreloadOptions {
  maxDepth?: number;      // Default: 1 (only immediate deps)
  priority?: PreloadPriority;
}

// Usage:
kernel.loadFynAppsByName(requests, {
  concurrency: 4,
  preload: {
    maxDepth: 1,  // Only preload immediate dependencies
    priority: PreloadPriority.CRITICAL
  }
});
```

**HTML Output:**
```html
<!-- Critical: Requested FynApps -->
<link rel="modulepreload" href="/fynapp-1/dist/fynapp-entry.js" as="script">

<!-- Important: Immediate dependencies -->
<link rel="modulepreload" href="/fynapp-middleware/dist/fynapp-entry.js" as="script">

<!-- Prefetch: Transitive dependencies (lower priority) -->
<link rel="prefetch" href="/fynapp-shared-lib/dist/fynapp-entry.js" as="script">
```

### 2. **Batch-Based Preloading** (Medium Priority)

Only preload dependencies in the current topological batch:

```typescript
// Instead of preloading during visit(), preload by batch:
for (const batch of batches) {
  if (batchIndex === 0) {
    // Preload first batch (immediate dependencies)
    batch.forEach(key => preloadEntryFile(key));
  } else {
    // Prefetch subsequent batches (lower priority)
    batch.forEach(key => prefetchEntryFile(key));
  }
}
```

### 3. **Lazy Dependency Resolution** (Low Priority)

Don't preload transitive dependencies until parent loads:

```typescript
// Current: Preload ALL dependencies during graph build
this.preloadEntryFile(req.name, reqDistBase);
await visit(req.name, req.range, key);

// Proposed: Only preload when parent actually loads
await visit(req.name, req.range, key);
// Don't preload transitive deps during graph build
```

### 4. **Route-Based Preloading** (Already Proposed)

See `route-based-preloading.md` Phase 0:
- Static analysis generates route-specific preloads
- Only preload FynApps needed for current route
- Prefetch likely-next routes on idle

---

## Immediate Actionable Steps

### Option A: **Add `maxDepth` Parameter** (Recommended)

**Change:** Add depth tracking to preload logic

```typescript
interface LoadOptions {
  concurrency?: number;
  preloadDepth?: number;  // Default: 1 (only immediate deps)
}

// In manifest-resolver.ts:
private preloadEntryFile(name: string, distBase: string, depth: number): void {
  if (this.options.preloadDepth !== undefined && depth > this.options.preloadDepth) {
    return;  // Skip preloading beyond max depth
  }
  // ... existing preload logic
}
```

**Usage:**
```typescript
// Aggressive (current behavior):
kernel.loadFynAppsByName(requests, { preloadDepth: Infinity });

// Balanced (recommended default):
kernel.loadFynAppsByName(requests, { preloadDepth: 1 });

// Conservative:
kernel.loadFynAppsByName(requests, { preloadDepth: 0 });
```

**Impact:**
- `preloadDepth: 0` → Preload only requested FynApps (8 files)
- `preloadDepth: 1` → Preload + immediate dependencies (~10-12 files)
- `preloadDepth: 2` → Preload + transitive deps (~15+ files)

### Option B: **Use `rel="prefetch"` for Transitive Deps**

**Change:** Distinguish between `modulepreload` (high priority) and `prefetch` (low priority)

```typescript
private preloadEntryFile(name: string, distBase: string, isPrimary: boolean): void {
  const link = document.createElement("link");
  link.rel = isPrimary ? "modulepreload" : "prefetch";
  link.href = entryUrl;
  link.as = "script";
  document.head.appendChild(link);
}
```

**Impact:**
- Requested FynApps: `<link rel="modulepreload">` (high priority)
- Dependencies: `<link rel="prefetch">` (low priority, won't block critical resources)

---

## Testing Strategy

### Measure Impact

1. **Network Throttling Test**
   - Chrome DevTools → Network → Slow 3G
   - Measure Time to First Contentful Paint (FCP)
   - Compare:
     - Current (preload all)
     - `maxDepth: 0` (preload none)
     - `maxDepth: 1` (preload immediate)

2. **Critical Resource Timing**
   - Check if CSS/fonts are delayed
   - Verify modulepreload doesn't block DOMContentLoaded

3. **Real-World Scenario**
   - Test on actual slow connection
   - Monitor browser network waterfall
   - Identify if preloads cause visible delay

### Expected Results

| Scenario | Preloads | FCP Impact | Critical Resource Delay |
|----------|----------|------------|------------------------|
| No preload | 0 | Baseline | None |
| Depth 0 | 8 | +50-100ms | None |
| Depth 1 | 10-12 | +100-200ms | Minimal |
| Depth ∞ (current) | 15+ | +200-400ms | Moderate |

---

## Recommendations

### Short Term (Immediate)

1. ✅ **Add `preloadDepth` option** with default `1`
   - Limits preloading to requested FynApps + immediate dependencies
   - Prevents transitive dependency explosion
   - **Estimated impact:** Reduce 15 preloads → 10-12 preloads

2. ✅ **Use `rel="prefetch"` for depth > 1**
   - Lower priority for transitive dependencies
   - Won't block critical resources
   - **Estimated impact:** Faster FCP on slow connections

### Medium Term

3. ⏳ **Implement route-based preloading** (Phase 0)
   - Static analysis generates minimal preload set
   - Only preload FynApps for current route
   - **Estimated impact:** Reduce 15 preloads → 3-5 preloads per route

### Long Term

4. ⏳ **Dynamic priority adjustment**
   - Measure actual network conditions
   - Adjust preload aggressiveness based on connection speed
   - Disable preloading on very slow connections

---

## Conclusion

**Current behavior:** ⚠️ Borderline too aggressive

- **Demo scenario:** 15 preloads is acceptable but not optimal
- **Real apps:** Should use `preloadDepth: 1` or route-based preloading
- **Large apps:** Must implement route-based lazy loading

**Recommended default:** `preloadDepth: 1`
- Preload requested FynApps + immediate dependencies
- Prevents transitive explosion
- Good balance of performance vs resource usage

**Priority:** Medium (not breaking, but should be addressed before production use)
