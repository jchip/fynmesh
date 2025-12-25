# Principal Engineer Review: Kernel Risks & Recommendations

**Issue:** FYM-77 (clone of FYM-66)
**Date:** 2025-12-25
**Reviewer:** AI Agent

## Executive Summary

The kernel architecture is well-designed with clear modular separation. The composition pattern (5 extracted modules) provides good testability and maintainability. However, there are several areas requiring attention for production readiness.

**Key Strengths:**
- Clean modular architecture with single-responsibility modules
- Result<T,E> type for recoverable errors in ModuleLoader
- "Party goes on" policy prevents cascade failures
- Bootstrap serialization with timeouts handles dependency coordination well
- Comprehensive event system for observability hooks

**Areas of Concern:**
1. Encapsulation violations via string-indexed access
2. Inconsistent error handling across public API
3. Platform abstraction leaks (browser globals in shared code)
4. Console logging with emoji prefixes (not production-ready)
5. Dual-keyed app registry creates ambiguity

---

## Detailed Findings

### 1. API Boundaries & Encapsulation

**Severity:** Medium
**Tracked by:** FYM-60

**Finding:** Private fields accessed via string indexing, bypassing TypeScript access control.

**Locations:**
- `browser-kernel.ts:149,164` - `kernel["preloadStrategy"]`, `kernel["injectPreloadLink"]`
- `kernel-core.ts:147,150,151` - `this.manifestResolver["preloadCallback"]`, `["registryResolver"]`, `["calculateDistBase"]`

**Risk:** Brittle coupling between modules. If private implementation changes, string-indexed access silently breaks at runtime instead of failing at compile time.

**Recommendation:** Expose required functionality through public methods/getters:
```typescript
// Instead of kernel["preloadStrategy"]
kernel.getPreloadStrategy(): PreloadStrategy

// Instead of kernel["injectPreloadLink"](url)
kernel.tryPreload(url, depth): void
```

---

### 2. Error Handling Inconsistency

**Severity:** High
**Tracked by:** FYM-59, FYM-72

**Finding:** Mixed error handling patterns across the API surface:
- `ModuleLoader` uses `Result<T, ModuleLoadError>` (correct)
- `BrowserKernel.loadFynApp()` returns `null` on failure (`browser-kernel.ts:121`)
- `bootstrapFynApp()` catches, logs, emits event but doesn't throw or return Result
- Some tests expect throws, implementation returns null

**Risk:** Callers cannot reliably handle errors. Silent `null` returns mask failures.

**Recommendation:** Establish consistent policy:
1. **Internal operations:** Use `Result<T, E>` pattern
2. **Public API:** Either throw or return Result, never return null
3. **Lifecycle events:** Emit for observability, but also return Result

---

### 3. Bootstrap Coordination

**Severity:** Low (well-designed)
**Status:** No action required

**Finding:** Bootstrap serialization handles failure modes gracefully:
- 30-second default timeout prevents indefinite stalls
- `handleFynAppBootstrapFailed` advances deferred queue
- "Party goes on" policy correctly implemented

**One concern:** If a provider FynApp fails to bootstrap, consumers waiting for it will timeout (30s) rather than being notified immediately.

**Minor improvement:** Consider immediate notification to consumers when their provider fails, rather than waiting for timeout.

---

### 4. Platform Abstraction

**Severity:** Medium-High
**Tracked by:** FYM-70, FYM-62

**Finding:** Browser globals used in code that should be platform-agnostic:

| Location | Global | Issue |
|----------|--------|-------|
| `manifest-resolver.ts:94` | `fetch()` | Not available in all Node.js versions |
| `manifest-resolver.ts:105` | `location.href` | Browser-only |
| `manifest-resolver.ts:154` | `globalThis.Federation` | Untyped, couples to Federation.js |
| `browser-kernel.ts:94` | `globalThis.Federation` | Untyped |

**Risk:** NodeKernel cannot use ManifestResolver without polyfills. Testing requires browser environment.

**Recommendation:** Inject dependencies:
```typescript
interface ManifestResolverConfig {
  fetch: typeof fetch;
  baseUrl: string; // instead of location.href
}

interface FederationProvider {
  import(url: string): Promise<FynAppEntry>;
}
```

---

### 5. Observability & Logging

**Severity:** Medium
**Tracked by:** FYM-49, FYM-53, FYM-54, FYM-55

**Finding:** All logging uses `console.*` with emoji prefixes:
```typescript
console.debug("🚀 Loading FynApp from", urlPath);
console.debug("✅ FynApp bootstrapped", fynApp.name);
console.error(`❌ Bootstrap failed for ${fynApp.name}:`);
```

**Risk:**
- Cannot filter logs by level in production
- Cannot aggregate structured logs
- Emoji prefixes don't help log parsing/correlation

**Recommendation:** Implement KernelLogger interface per FYM-53:
```typescript
interface KernelLogger {
  debug(event: string, context: Record<string, unknown>): void;
  info(event: string, context: Record<string, unknown>): void;
  warn(event: string, context: Record<string, unknown>): void;
  error(event: string, context: Record<string, unknown>, error?: Error): void;
}
```

---

### 6. Version Selection & App Registry

**Severity:** Medium
**Status:** New finding (needs issue)

**Finding:** Apps stored with dual keys creating ambiguity:
```typescript
// browser-kernel.ts:110-113
const fynAppKey = fynAppName && fynAppVersion ? `${fynAppName}@${fynAppVersion}` : fynAppName;
if (fynAppKey && this.runTime.appsLoaded[fynAppKey]) {
  return this.runTime.appsLoaded[fynAppKey];
}

// module-loader.ts:232-235
appsLoaded[appKey] = fynApp;        // name@version
appsLoaded[fynApp.name] = fynApp;   // name (overwrites previous version!)
```

**Risk:**
- Loading `fynapp-1@2.0.0` after `fynapp-1@1.0.0` silently replaces the name-keyed entry
- Lookup by name returns arbitrary version
- No semver range matching

**Recommendation:**
1. Primary key should be `name@version`
2. Name-only lookup should explicitly pick "latest" or throw
3. Consider semver-aware version selection

---

### 7. Middleware Context Ownership

**Severity:** Medium
**Tracked by:** FYM-71

**Finding:** Two separate middleware context stores:
- `fynApp.middlewareContext` - per-app, created in `loadFynAppBasics`
- `runtime.middlewareContext` - per-invocation, created in `createFynUnitRuntime`

No code reads/writes to `fynApp.middlewareContext`, making it dead code.

**Recommendation:** Decide semantics:
- If per-FynApp: wire runtime to use fynApp.middlewareContext
- If per-invocation: remove fynApp.middlewareContext
- If both needed: document clearly

---

### 8. Security: Input Validation

**Severity:** Medium
**Tracked by:** FYM-65

**Finding:** External manifest data accessed without validation:
```typescript
// manifest-resolver.ts:156
const entryUrl = res.manifestUrl.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
```

No validation that `manifestUrl` matches expected format.

**Recommendation:** Validate at parse boundaries:
- Manifest URL format
- Required fields (name, version)
- Semver format
- Dependency structure

---

### 9. Deprecated Aliases

**Severity:** Low
**Tracked by:** FYM-61

**Finding:** Deprecated aliases without removal timeline:
- `FynModuleRuntime = FynUnitRuntime` (types.ts:91)
- `FynModule = FynUnit` (types.ts:133)
- `createFynModuleRuntime()` (module-loader.ts:253)
- `invokeFynModule()` (module-loader.ts:364)
- `useMiddlewareOnFynModule()` (middleware-executor.ts:489)

**Recommendation:** Add `@deprecated` JSDoc with removal version:
```typescript
/**
 * @deprecated Use FynUnitRuntime instead. Will be removed in v2.0.0.
 */
export type FynModuleRuntime = FynUnitRuntime;
```

---

## Issue Tracking Summary

| Finding | Existing Issue | Status |
|---------|----------------|--------|
| String-indexed private access | FYM-60 | Open |
| Error handling policy | FYM-59, FYM-72 | Open |
| Platform abstraction | FYM-70, FYM-62 | Open |
| KernelLogger interface | FYM-53, FYM-54, FYM-55 | Open |
| Observability epic | FYM-49 | Open |
| Middleware context ownership | FYM-71 | Open |
| Manifest validation | FYM-65 | Open |
| Deprecation timeline | FYM-61 | Open |
| **Version selection/dual-key** | **NEW** | To file |

---

## Priority Recommendations

### Immediate (P1)
1. **FYM-60:** Fix string-indexed access - prevents refactoring
2. **FYM-72:** Align loadFynApp error contract with tests

### Short-term (P2)
3. **FYM-53/54:** Implement structured logging for production readiness
4. **FYM-70:** Make ManifestResolver platform-agnostic
5. **File new issue:** Version selection semantics

### Medium-term (P2-P3)
6. **FYM-59:** Document and enforce error handling policy
7. **FYM-65:** Add manifest validation
8. **FYM-71:** Clarify middlewareContext ownership

---

## Architecture Strengths (for reference)

The kernel has several excellent architectural decisions:

1. **Modular Composition:** 5 focused modules instead of monolithic kernel
2. **Result Types:** ModuleLoader shows the right pattern
3. **Event-driven Coordination:** Clean async signaling via CustomEvents
4. **Graceful Degradation:** "Party goes on" policy isolates failures
5. **Preload Strategy:** Configurable depth and priority
6. **Bootstrap Serialization:** Provider/consumer dependency tracking

These patterns should be extended to the areas needing improvement.
