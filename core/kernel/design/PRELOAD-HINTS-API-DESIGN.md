# Preload Hints API & Automation Design

**Status:** FINAL - Ready for Implementation
**Date:** 2025-11-26
**Consolidated from:** API design, review, automation design

---

## 1. Problem Statement

The current kernel loads FynApps "eagerly" (`loadFynApp` fetches *and* executes). This blocks the main thread and doesn't leverage browser idle time or parallel fetching effectively.

We need a **two-phase loading system**:
1.  **Phase 1 (Preload):** Emit browser hints (`<link rel="modulepreload">`) to fetch resources in the background without executing them.
2.  **Phase 2 (Load):** Execute the FynApps when needed (hitting the browser cache).

Additionally, manual management of preload lists is brittle. We need an **automated strategy** to ensure preloading stays in sync with application routes.

---

## 2. Kernel API Design

### A. `preloadHintUrls(urls, priority?)` - Zero-Fetch Direct Hints

Low-level API for direct URL injection. Best for build-time generated lists.

```typescript
preloadHintUrls(
  urls: string[],
  priority?: PreloadPriority  // default: IMPORTANT
): void;
```

**Characteristics:**
- **Synchronous**: No network I/O.
- **Deduplicated**: Checks against `hintedUrls` set.
- **Direct**: Injects `<link>` tags immediately.

### B. `preloadHints(names, options?)` - Name-Based with Resolution

High-level API that resolves dependencies before hinting.

```typescript
interface PreloadHintsOptions {
  strategy?: PreloadStrategy;
  includeDependencies?: boolean; // default: true
}

async preloadHints(
  names: string[],
  options?: PreloadHintsOptions
): Promise<PreloadHintsResult>;
```

**Characteristics:**
- **Async**: Fetches `fynapp.manifest.json` to resolve dependencies (Network I/O).
- **Hint-Only**: Resolves the graph but **does not execute** modules.
- **Cached**: Caches fetched manifests so subsequent `loadFynApp()` calls are faster.

---

## 3. Automation Strategy: "Single Source of Truth"

To prevent drift, we use the **Route Configuration** as the single source of truth for both routing and preloading.

### The Route Config (`route-config.ts`)

```typescript
export const appRoutes = [
  { path: '/', fynApps: ['fynapp-home'] },
  { path: '/dashboard', fynApps: ['fynapp-charts', 'fynapp-data-grid'] }
];
```

### Build-Time Generation

A CLI tool (`fyn generate-preload`) parses this config and uses `ManifestResolver` to generate a **Preload Manifest**.

**Output (`dist/preload-manifest.json`):**
```json
{
  "/dashboard": {
    "hints": [
      "/fynapp-charts/dist/fynapp-entry.js",
      "/fynapp-data-grid/dist/fynapp-entry.js",
      "/fynapp-react-middleware/dist/fynapp-entry.js"
    ]
  }
}
```

### Runtime Integration

1.  **Build Time / Server**: Inject hints for the *initial route* into HTML.
2.  **Client Navigation**: Kernel consumes `preload-manifest.json` to preload next routes.

```typescript
// Router integration
router.beforeEach((to) => {
  const hints = preloadManifest[to.path]?.hints;
  if (hints) {
    fynMeshKernel.preloadHintUrls(hints, 'high');
  }
});
```

**FAQ: Is Server-Side Orchestration Required?**
**No.** The manifest is generated at **Build Time**. Static hosting (SPA/SSG) works perfectly by fetching the static JSON file. SSR is an optional optimization.

---

## 4. Implementation Plan

### Phase 1: Kernel Core Enhancements
1.  **Types**: Add `PreloadHintsOptions`, `PreloadHintsResult`.
2.  **BrowserKernel**:
    - Add `hintedUrls` Set for deduplication.
    - Implement `preloadHintUrls(urls, priority)`.
    - Implement `preloadHints(names, options)`.
3.  **ManifestResolver**:
    - Add `hintOnly` mode to `buildGraph()` (resolves but doesn't trigger load callbacks).
    - Ensure manifest cache is robust for the "preload then load" flow.

### Phase 2: Automation Tooling
1.  **CLI Tool**: Create `fyn generate-preload` command.
    - Input: `route-config.ts` (or JSON equivalent).
    - Logic: Use `ManifestResolver` to build dependency graphs for each route.
    - Output: `preload-manifest.json` and/or HTML snippets.

### Phase 3: Demo Integration
1.  Update `shell.html` to use `preloadHints()` for manual testing.
2.  Implement `route-config.ts` in the demo shell.
3.  Integrate CLI tool into the build process.

---

## 5. Review Feedback & Decisions

-   **Manifest Fetching**: `preloadHints(names)` *does* fetch manifests. This is documented and accepted as necessary for dependency resolution.
-   **Caching**: `ManifestResolver` cache is critical. It must ensure that `loadFynApp` reuses the manifests fetched during preloading.
-   **Priority Mapping**:
    -   `CRITICAL` -> `<link rel="modulepreload" fetchpriority="high">`
    -   `IMPORTANT` -> `<link rel="modulepreload">`
    -   `DEFERRED` -> `<link rel="prefetch">`
