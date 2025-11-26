# Kernel Design Documentation Overview

**Last Updated:** 2025-11-26

---

## Current State: Preload System

The kernel's preload system is being developed in phases:

| Phase                 | Description                         | Status                          |
| --------------------- | ----------------------------------- | ------------------------------- |
| Phase 1               | Basic preloading during graph build | ✅ Done                         |
| Phase 2               | Depth control (`preload: number`)   | ✅ Done                         |
| Phase 3               | Priority system (PreloadManager)    | ⏳ Pending                      |
| **Preload Hints API** | Decoupled hint emission             | 🔨 **Ready for Implementation** |
| Phase 0               | Static/build-time analysis          | ⏳ After Hints API              |

---

## Primary Documents (Current Focus)

### Preload Hints API

| Document                                                       | Description                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **[PRELOAD-HINTS-API-DESIGN.md](PRELOAD-HINTS-API-DESIGN.md)** | **START HERE** - Consolidated design for `preloadHints()` and `preloadHintUrls()` APIs. Ready for implementation. |

### Preload Strategy (Implemented)

| Document                                                                           | Description                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [PRELOAD-STRATEGY-KERNEL-API.md](PRELOAD-STRATEGY-KERNEL-API.md)                   | Production preload strategy API. Phase 2 (depth control) is implemented.           |
| [BROWSER-RESOURCE-PRIORITY-FACILITIES.md](BROWSER-RESOURCE-PRIORITY-FACILITIES.md) | Reference for browser preload facilities (modulepreload, prefetch, fetchpriority). |

---

## Supporting Documents

### Preload Analysis

| Document                                                                 | Status       | Description                                                                      |
| ------------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------- |
| [PRELOAD-AGGRESSIVENESS-ANALYSIS.md](PRELOAD-AGGRESSIVENESS-ANALYSIS.md) | ✅ Addressed | Analysis that led to depth control implementation. Recommendations incorporated. |
| [route-based-preloading.md](route-based-preloading.md)                   | ⏳ Future    | Route-based optimization approaches. Depends on routing system.                  |

### Core Architecture

| Document                                                                 | Status         | Description                            |
| ------------------------------------------------------------------------ | -------------- | -------------------------------------- |
| [architecture.md](architecture.md)                                       | ✅ Reference   | Overall kernel architecture.           |
| [fynapp-middleware-architecture.md](fynapp-middleware-architecture.md)   | ✅ Implemented | Middleware system design.              |
| [execution-override-architecture.md](execution-override-architecture.md) | ✅ Implemented | Middleware execution override pattern. |
| [fynapp-dep-plan.md](fynapp-dep-plan.md)                                 | ✅ Implemented | Dependency resolution and loading.     |

### Demo & Development

| Document                                                   | Status         | Description                      |
| ---------------------------------------------------------- | -------------- | -------------------------------- |
| [demo-server-architecture.md](demo-server-architecture.md) | ✅ Reference   | Demo server setup and templates. |
| [development-workflow.md](development-workflow.md)         | ✅ Reference   | Development and build workflow.  |
| [design-tokens-middleware.md](design-tokens-middleware.md) | ✅ Implemented | Design tokens middleware design. |

### Specialized Topics

| Document                                                       | Status         | Description                                  |
| -------------------------------------------------------------- | -------------- | -------------------------------------------- |
| [auto-load-federation.md](auto-load-federation.md)             | ✅ Implemented | Automatic federation loading.                |
| [manifest-in-entry.md](manifest-in-entry.md)                   | ✅ Implemented | Embedded manifest in entry files.            |
| [dynamic-fallback-mechanism.md](dynamic-fallback-mechanism.md) | ✅ Implemented | Dynamic import fallbacks.                    |
| [routing-architecture.md](routing-architecture.md)             | ⏳ Future      | Routing system design (not yet implemented). |

### Reviews

| Document                                                   | Status        | Description          |
| ---------------------------------------------------------- | ------------- | -------------------- |
| [DESIGN-REVIEW-2025-11-02.md](DESIGN-REVIEW-2025-11-02.md) | ✅ Historical | Design review notes. |

---

## Implementation Priority

1. **Now:** [PRELOAD-HINTS-API-DESIGN.md](PRELOAD-HINTS-API-DESIGN.md) - Implement `preloadHints()` and `preloadHintUrls()` APIs
2. **Next:** Phase 3 Priority System (optional, can use static priorities first)
3. **Future:** Route-based preloading (requires routing system)

---

## Quick Links

- **Kernel Source:** `core/kernel/src/`
- **Browser Kernel:** `core/kernel/src/browser-kernel.ts`
- **Manifest Resolver:** `core/kernel/src/modules/manifest-resolver.ts`
- **Types:** `core/kernel/src/types.ts`
- **Shell Demo:** `demo/demo-server/templates/pages/shell.html`
