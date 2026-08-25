# Preload Hints API & Automation Design

**Status:** PROPOSED — none of this is implemented
**Date:** 2025-11-26 (status corrected 2026-08-24)
**Consolidated from:** API design, review, automation design

---

## 0. What exists today

Neither `preloadHintUrls` nor `preloadHints` exists, and neither does
`fyn generate-preload` or `preload-manifest.json`. The document below was
previously headed "FINAL - Ready for Implementation", which read as a record of
shipped behaviour rather than a proposal. It is a proposal.

What the kernel actually has is `BrowserFynMeshKernel.tryPreload(url, depth)`
(`core/kernel/src/browser-kernel.ts`), gated by a depth-based `PreloadStrategy`
and fed nothing but entry-file urls from `manifest-resolver.ts`. Route-driven
hinting, name resolution and dependency graphs are all absent.

Two things have been settled since this was written, and anything built from
§2 has to honour them:

- **A hint must name the file that will really be fetched.** After the build
  combines chunks, the runtime requests the *carrier*, never the member, so
  `tryPreload` translates every url through `Federation.bundleUrlFor` before
  injecting a tag and dedupes on the result (FYM-206). A bulk API taking a list
  of urls inherits that requirement wholesale.
- **`modulepreload` is the wrong hint kind here**, so §5's priority mapping is
  stale. FynApp entries are `System.register` output and SystemJS loads them by
  injecting a classic `<script>`; a modulepreload is fetched as a module in CORS
  mode and never matches the no-cors load that follows, so the file is fetched
  twice. The kernel and the demo shell both emit `rel="preload" as="script"`.

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
