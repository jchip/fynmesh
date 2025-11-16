# FynApp Manifest Embedding Architecture

## Executive Summary

This document describes the architecture for embedding FynApp manifest data directly into federation entry bundles (`fynapp-entry.js`) to eliminate separate HTTP requests while maintaining backwards compatibility with standalone manifest files (`fynapp.manifest.json`).

**Key Achievement:** Foundation for zero-latency manifest resolution, potentially eliminating 700ms-1.4s of HTTP roundtrip latency for loading 14+ FynApps.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Goals & Requirements](#goals--requirements)
3. [Architecture Overview](#architecture-overview)
4. [Design Principles](#design-principles)
5. [Component Design](#component-design)
6. [Implementation Details](#implementation-details)
7. [Data Structures](#data-structures)
8. [Results & Validation](#results--validation)
9. [Future Work](#future-work)

---

## Problem Statement

### Current Architecture (Before)

The FynMesh kernel requires manifest data to build dependency graphs before loading FynApp bundles. The previous flow:

```
1. Fetch fynapp.manifest.json (HTTP request)
2. Parse manifest → Build dependency graph
3. Topologically sort dependencies
4. Load fynapp-entry.js for each FynApp (HTTP request)
5. Initialize FynApps
```

### Performance Impact

For a typical application loading 14 FynApps:

- **14 manifest fetches** = 14 × 50-100ms RTT = **700ms - 1.4s latency**
- Additional HTTP overhead (headers, TLS handshakes, connection management)
- Sequential dependency resolution delays initial render

### Architectural Constraints

1. **Generic Plugin Requirement:** `rollup-plugin-federation` must remain framework-agnostic
2. **Backwards Compatibility:** Existing manifest file format must be preserved for tooling
3. **Data-Driven:** Manifest should be declarative, not imperative code
4. **Separation of Concerns:** FynApp-specific logic should not leak into generic federation code

---

## Goals & Requirements

### Primary Goals

1. **Eliminate Manifest HTTP Requests:** Embed manifest data in entry bundles
2. **Zero Regression:** Maintain all existing functionality
3. **Generic Architecture:** Keep federation plugin framework-agnostic
4. **Backwards Compatible:** Continue generating standalone manifest files

### Non-Goals

- Modify kernel's dependency resolution algorithm
- Change manifest data structure or schema
- Optimize bundle size (manifest data is small)

### Requirements

| Requirement                          | Priority | Status      |
| ------------------------------------ | -------- | ----------- |
| Manifest embedded in entry file      | P0       | ✅ Complete |
| Generic enrichment hook in plugin    | P0       | ✅ Complete |
| FynApp-specific enrichment logic     | P0       | ✅ Complete |
| fynapp.manifest.json still generated | P1       | ✅ Complete |
| Zero errors in demo applications     | P0       | ✅ Complete |
| Documentation updated                | P1       | ✅ Complete |

---

## Architecture Overview

### New Architecture (After)

```
1. Load fynapp-entry.js (HTTP request)
   ├─ Extract __FYNAPP_MANIFEST__ from exports
   └─ Build dependency graph (no additional HTTP)
2. Topologically sort dependencies
3. Initialize already-loaded FynApps (call .init())
```

**Key Change:** Manifest data travels with the entry bundle, eliminating separate fetches.

### System Context

```
┌─────────────────────────────────────────────────────────┐
│                    Build Time                           │
│                                                         │
│  ┌─────────────────┐         ┌──────────────────┐     │
│  │ rollup-plugin-  │         │  create-fynapp   │     │
│  │  federation     │◄────────┤  (enrichment)    │     │
│  │  (generic)      │ hook    │  (FynApp logic)  │     │
│  └────────┬────────┘         └──────────────────┘     │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────────────────────────────┐          │
│  │     Generated fynapp-entry.js           │          │
│  │  ┌────────────────────────────────┐     │          │
│  │  │ export { __FYNAPP_MANIFEST__ } │     │          │
│  │  │ function init(_shareScope) {   │     │          │
│  │  │   _container._S(...);          │     │          │
│  │  │   _container._E(...);          │     │          │
│  │  │ }                              │     │          │
│  │  └────────────────────────────────┘     │          │
│  └─────────────────────────────────────────┘          │
│                                                         │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Runtime                              │
│                                                         │
│  ┌──────────────────┐                                  │
│  │  Kernel          │                                  │
│  │  ├─ Federation   │                                  │
│  │  │  .import()    ├──► Extract __FYNAPP_MANIFEST__  │
│  │  ├─ Build graph  │                                  │
│  │  └─ Call .init() │                                  │
│  └──────────────────┘                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Generic Plugin Pattern

**rollup-plugin-federation** provides infrastructure, not implementation:

- Exposes `enrichManifest` callback hook
- Builds base manifest from configuration
- Knows nothing about FynMesh/FynApp specifics

### 2. Data-Driven Architecture

Manifest is a declarative data structure:

```javascript
const __FYNAPP_MANIFEST__ = {
  name: "...",
  version: "...",
  exposes: { ... },
  "consume-shared": { ... },
  "shared-providers": { ... }
};
```

Not imperative initialization code mixed with data.

### 3. Separation of Concerns

| Component                    | Responsibility                        |
| ---------------------------- | ------------------------------------- |
| **rollup-plugin-federation** | Generic federation mechanics          |
| **create-fynapp**            | FynApp-specific manifest enrichment   |
| **kernel**                   | Runtime manifest extraction & loading |

### 4. Backwards Compatibility

- Standalone `fynapp.manifest.json` still generated
- Contains additional metadata (chunk mappings, detailed import-exposed)
- Useful for tooling, debugging, and fallback

---

## Component Design

### 1. rollup-plugin-federation

**Location:** `rollup-federation/rollup-plugin-federation/`

#### Type Definitions

**File:** `src/types.mts`

```typescript
export type FederationPluginOptions = {
  // ... existing options ...

  /**
   * Callback to enrich the base manifest with additional data.
   * Called during the load() hook with base manifest data.
   *
   * @param baseManifest - Base manifest with exposes, shared, dynamicImports
   * @param runtime - Federation runtime with collected data
   * @param context - Rollup plugin context
   * @returns Enriched manifest object
   */
  enrichManifest?: (
    baseManifest: any,
    runtime: FederationRuntime,
    context: PluginContext
  ) => any | Promise<any>;
};
```

#### load() Hook Implementation

**File:** `src/index.mts` (lines 244-262)

```typescript
async load(this: PluginContext, id: string): Promise<LoadResult> {
  if (id === runtime.entryId) {
    await runtime.lastModuleWait.defer.promise;

    // Build base manifest from federation config
    const baseManifest = {
      name: options.name,
      version: options.version || '1.0.0',
      exposes: options.exposes || {},
      shared: options.shared || {},
      dynamicImports: runtime.dynamicImports
    };

    // Call enrichManifest hook if provided
    if (options.enrichManifest) {
      runtime.fynappManifest = await options.enrichManifest(
        baseManifest,
        runtime,
        this
      );
    } else {
      runtime.fynappManifest = baseManifest;
    }

    return generateContainerEntryCode(runtime);
  }

  return null;
}
```

#### Container Code Generation

**File:** `src/code-generation/container-code.mts` (lines 133-136)

```typescript
export function generateContainerEntryCode(runtime: FederationRuntime): string {
  // Generate manifest export - this is the source of truth
  const manifestExport = runtime.fynappManifest
    ? `const __FYNAPP_MANIFEST__ = ${JSON.stringify(
        runtime.fynappManifest,
        null,
        2
      )};\nexport { __FYNAPP_MANIFEST__ };\n// Store manifest on container for direct access\n${CONTAINER_VAR}.__FYNAPP_MANIFEST__ = __FYNAPP_MANIFEST__;\n\n`
    : "";

  // Generate shares and exposes initialization code
  const sharesDataCode = genAddShareCode(shared, runtime.collectedShares);
  const exposesDataCode = genExposesCode(exposes);

  // Combine into entry code
  const entryCode = `${options.entry?.header}
${manifestExport}export function init(_shareScope) {
  var _ss = ${CONTAINER_VAR}._mfInit(_shareScope);
  if (!_ss) return ${CONTAINER_VAR}.$SS;

  // container._S => addShare
${sharesDataCode}
  // container._E => addExpose
${exposesDataCode}

  return _ss;
}
// ... rest of entry code
`;

  return entryCode;
}
```

**Key Changes (2025-10-29):**
- Added line to store manifest on container object: `${CONTAINER_VAR}.__FYNAPP_MANIFEST__ = __FYNAPP_MANIFEST__;`
- This enables direct property access instead of module import resolution

### 2. create-fynapp

**Location:** `dev-tools/create-fynapp/`

#### Enrichment Implementation

**File:** `src/index.ts`

```typescript
export function createEnrichManifest() {
  return async (
    baseManifest: any,
    runtime: FederationRuntime,
    context: any
  ) => {
    const cwd = process.cwd();

    // 1. Process consume-shared (modules with import: false)
    const consumeShared: Record<string, { semver?: string }> = {};
    if (baseManifest.shared) {
      for (const [moduleName, config] of Object.entries(baseManifest.shared)) {
        if (config.import === false) {
          consumeShared[moduleName] = {
            semver: config.requiredVersion,
          };
        }
      }
    }

    // 2. Process provide-shared (modules with import !== false)
    const provideShared: Record<string, any> = {};
    if (baseManifest.shared) {
      for (const [moduleName, config] of Object.entries(baseManifest.shared)) {
        if (config.import !== false) {
          provideShared[moduleName] = config;
        }
      }
    }

    // 3. Process import-exposed from dynamicImports
    const importExposed: Record<string, any> = {};
    for (const dynImp of baseManifest.dynamicImports) {
      const { specifier, attributes, importer } = dynImp;

      // Only process mf-expose and fynapp-middleware imports
      if (
        !attributes ||
        (attributes.type !== "mf-expose" &&
          attributes.type !== "fynapp-middleware")
      ) {
        continue;
      }

      // Parse specifier and build import-exposed structure
      // ... (implementation details)
    }

    // 4. Detect shared providers
    const sharedProviders = detectSharedProviders(consumeShared, cwd);

    // 5. Build enriched manifest
    const enrichedManifest = {
      name: baseManifest.name,
      version: baseManifest.version,
      exposes: baseManifest.exposes,
      "provide-shared":
        Object.keys(provideShared).length > 0 ? provideShared : undefined,
      "consume-shared":
        Object.keys(consumeShared).length > 0 ? consumeShared : undefined,
      "import-exposed":
        Object.keys(importExposed).length > 0 ? importExposed : undefined,
      "shared-providers":
        Object.keys(sharedProviders).length > 0 ? sharedProviders : undefined,
    };

    return enrichedManifest;
  };
}
```

#### Plugin Setup

```typescript
export function setupFederationPlugins(
  config: Partial<FederationPluginOptions> & { name: string }
) {
  return [
    newRollupPlugin(federation)({
      shareScope: fynmeshShareScope,
      filename: fynappEntryFilename,
      ...config,
      enrichManifest: createEnrichManifest(), // ← Enrichment hook
      emitFederationMeta: createEmitFederationMeta(),
    }),
  ];
}
```

### 3. Kernel (Runtime)

**Location:** `core/kernel/`

#### Manifest Extraction Implementation

**File:** `src/kernel-core.ts` (line 641)

The kernel extracts the embedded manifest directly from the container object:

```typescript
// In bootstrapFynApp method after loading the fynapp entry:
const fynAppEntry = await Federation.import(fynAppUrl);
const container = await fynAppEntry.init(getShareScope());

// Access manifest directly from container object (not via module import)
const manifest = (container as any).__FYNAPP_MANIFEST__ || null;

if (manifest) {
  console.debug(`✅ Loaded manifest from embedded entry for ${name} ${version}`);
} else {
  // Fallback: Try to fetch fynapp.manifest.json
  const manifestUrl = fynAppUrl.replace(/fynapp-entry\.js$/, "fynapp.manifest.json");
  manifest = await this.fetchJson(manifestUrl);
}
```

**Key Implementation Details:**
- **Direct Property Access**: Accesses `container.__FYNAPP_MANIFEST__` directly instead of using ES module `import()`
- **SystemJS Compatibility**: Works correctly with SystemJS-formatted federation entries
- **Fallback Strategy**: Falls back to fetching `fynapp.manifest.json` if embedded manifest is not available
- **Cache Integration**: Manifest data is cached for performance

**Why Direct Access vs Module Import:**
- ES module `import()` doesn't handle SystemJS-formatted entries reliably
- Direct property access works with both ES modules and SystemJS
- Avoids double-loading of the entry file
- Eliminates "Unable to resolve bare specifier '__FYNAPP_MANIFEST__'" errors

---

## Data Structures

### Base Manifest Structure

Generated by `rollup-plugin-federation`:

```typescript
interface BaseManifest {
  name: string;
  version: string;
  exposes: Record<string, string>; // { "./main": "./src/main.ts" }
  shared: Record<string, SharedConfig>; // Federation shared config
  dynamicImports: DynamicImportInfo[]; // Collected during build
}
```

### Enriched Manifest Structure

Generated by `create-fynapp` enrichment:

```typescript
interface EnrichedManifest extends BaseManifest {
  "consume-shared"?: Record<
    string,
    {
      semver?: string;
    }
  >;

  "provide-shared"?: Record<string, SharedConfig>;

  "import-exposed"?: Record<
    string,
    Record<
      string,
      {
        semver?: string;
        sites?: string[];
        type?: "module" | "middleware";
        subType?: string;
      }
    >
  >;

  "shared-providers"?: Record<
    string,
    {
      semver?: string;
      provides: string[];
    }
  >;
}
```

### Example: fynapp-1 Manifest

Embedded in `demo/fynapp-1/dist/fynapp-entry.js`:

```javascript
const __FYNAPP_MANIFEST__ = exports("__FYNAPP_MANIFEST__", {
  name: "fynapp-1",
  version: "1.0.0",
  exposes: {
    "./main": "./src/main.ts",
    "./hello": "./src/hello.ts",
    "./getInfo": "./src/getInfo.ts",
    "./App": "./src/App.tsx",
    "./component": "./src/component.ts",
  },
  "consume-shared": {
    "esm-react": {
      semver: "^19.0.0",
    },
    "esm-react-dom": {
      semver: "^19.0.0",
    },
  },
  "shared-providers": {
    "fynapp-react-lib": {
      semver: "^19.0.0",
      provides: ["esm-react", "esm-react-dom"],
    },
  },
});
```

---

## Implementation Details

### Build Process

```
┌─────────────────────────────────────────┐
│ 1. Rollup Bundling Process             │
├─────────────────────────────────────────┤
│ resolveId() → Collect shared modules    │
│ load()      → Build & enrich manifest   │
│ buildEnd()  → Finalize collections      │
│ generateBundle() → Emit files           │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ 2. Generated Artifacts                  │
├─────────────────────────────────────────┤
│ ✓ fynapp-entry.js (with manifest)       │
│ ✓ fynapp.manifest.json (standalone)     │
│ ✓ Chunk files (main.js, App.js, etc.)   │
│ ✓ federation.json (metadata)            │
└─────────────────────────────────────────┘
```

### Hook Execution Order

```
Plugin Hook Timeline:
═══════════════════════════════════════════════════════

buildStart()
    ↓
resolveId() ─────► Collect shared module info
    ↓              (repeated for each module)
    │
    ↓
load()
    │
    ├─ Regular modules loaded normally
    │
    └─ Entry module (id === runtime.entryId)
           │
           ├─ Wait for all modules to be resolved
           │  (runtime.lastModuleWait.defer.promise)
           │
           ├─ Build base manifest
           │  { name, version, exposes, shared, dynamicImports }
           │
           ├─ Call enrichManifest() hook
           │  → create-fynapp enriches with FynApp data
           │
           ├─ Store in runtime.fynappManifest
           │
           └─ Return generateContainerEntryCode(runtime)
    ↓
buildEnd()
    ↓
generateBundle()
    │
    ├─ Rename entry chunk to configured filename
    │
    ├─ Emit fynapp.manifest.json (from runtime.fynappManifest)
    │
    └─ Call emitFederationMeta() hook
    ↓
Done
```

### Files Modified

#### rollup-plugin-federation

| File                                     | Lines   | Changes                                           |
| ---------------------------------------- | ------- | ------------------------------------------------- |
| `src/types.mts`                          | 91-99   | Added `enrichManifest` option type                |
| `src/index.mts`                          | 244-262 | Updated `load()` hook to build & enrich manifest  |
| `src/index.mts`                          | ~300    | Simplified `generateBundle()` (removed appending) |
| `src/code-generation/container-code.mts` | 133-136 | Updated manifest export format                    |

#### create-fynapp

| File           | Section       | Changes                                   |
| -------------- | ------------- | ----------------------------------------- |
| `src/index.ts` | Lines ~70-110 | Created `createEnrichManifest()` function |
| `src/index.ts` | Lines ~85     | Updated `setupFederationPlugins()`        |
| `src/index.ts` | Lines ~148    | Updated `setupReactFederationPlugins()`   |

#### kernel

**No changes required** - Existing code already supports embedded manifests (with noted caveats about SystemJS compatibility).

---

## Results & Validation

### Build Results

```bash
$ fyn bootstrap
> rollup-plugin-federation built successfully
> create-fynapp built successfully
> 14+ demo FynApps rebuilt
✓ All builds completed without errors
```

### Generated Files

All demo FynApps now have:

1. **fynapp-entry.js** with embedded `__FYNAPP_MANIFEST__`
2. **fynapp.manifest.json** with detailed metadata
3. **federation.json** with bundle information

### Runtime Validation

**Demo URL:** http://localhost:3000

**Console Results:**

```
✓ 0 errors
✓ 0 warnings
✓ 825 log messages (normal operation)
✓ All 14 FynApps loaded successfully
```

**Loading Sequence (from console):**

```
[DEBUG] 📦 Loading fynapp-react-lib@18.0.0
[DEBUG] 🚀 Loading FynApp from /fynapp-react-18/dist/fynapp-entry.js
[DEBUG] 🚀 Loading FynApp basics for fynapp-react-lib 18.3.0
[DEBUG] 📦 Loading fynapp-design-tokens@0.0.0
... (14 FynApps loaded)
```

### Verification Checklist

- [x] `__FYNAPP_MANIFEST__` exported in entry files
- [x] `fynapp.manifest.json` still generated
- [x] Manifest contains correct data structure
- [x] consume-shared populated correctly
- [x] shared-providers detected accurately
- [x] import-exposed parsed from dynamic imports
- [x] All demo apps run without errors
- [x] Browser console clean (0 errors, 0 warnings)

---

## Performance Analysis

### Latency Savings (Potential)

**Before (with separate manifest fetches):**

```
14 FynApps × (manifest fetch + entry fetch)
= 14 × 50-100ms (manifest) + 14 × 50-100ms (entry)
= 700ms - 1.4s (manifest only)
= 1.4s - 2.8s (total)
```

**After (with embedded manifests):**

```
14 FynApps × (entry fetch with manifest)
= 14 × 50-100ms
= 700ms - 1.4s (total)
```

**Savings:** 700ms - 1.4s eliminated from manifest fetches alone.

**Note:** Full optimization requires kernel updates (see Future Work).

### Bundle Size Impact

Minimal impact:

- Manifest data: ~500 bytes - 2KB per FynApp
- Already loading entry bundles (10-50KB)
- Additional overhead: < 5%

---

## Future Work

### 1. ~~Kernel Optimization~~ ✅ COMPLETED (2025-10-29)

~~**Current Issue:** Kernel uses ES module `import()` which may not properly handle SystemJS-formatted entries.~~

**✅ RESOLVED:** Kernel now accesses manifest directly from container object property (`container.__FYNAPP_MANIFEST__`) instead of using ES module `import()`. This eliminates SystemJS compatibility issues and provides reliable manifest access for all entry formats.

**Implementation:**
```typescript
// Completed implementation:
const container = await fynAppEntry.init(getShareScope());
const manifest = (container as any).__FYNAPP_MANIFEST__ || null;
```

### 2. Middleware Path Resolution and Optional Version ✅ COMPLETED (2025-10-29)

**Issues Resolved:**
1. **Middleware Path Duplication**: Fixed path construction to use `modulePath` directly from manifest instead of reconstructing from `exposeModule` + `middlewareName`
2. **Optional Version Support**: Updated middleware string format parser to make version optional (supports 3-part format: `provider module/path` without version)

**Implementation Changes:**
- `kernel-core.ts:643-660`: Simplified proactive middleware loading to use `modulePath` key directly
- `kernel-core.ts:930, 968`: Changed from `parts.length >= 4` to `parts.length >= 3` to support optional version
- `kernel-core.ts:948, 986`: Added fallback `version: semver || "*"` for missing versions

OK, so problem is that fynapp-react-middleware define middleware in its main.ts like this:

```
  export const __middleware__BasicCounter: FynAppMiddleware = {
    name: "basic-counter",
```

That registers a middleware with name basic-counter with the kernel. and before, kernel expect the middleware are manually load so they register themselves.

Now, we need to detect the middleware declaration and map them to the module that's exposed.

So we need to use the dynamic import trick again.

something like:

```js
  export const __middleware__BasicCounter: FynAppMiddleware = {
    // @ts-ignore
    name: import("@fynmesh/define-middleware", { with: { type: "mf-middleware", name: "basic-counter" } }),
```

So we use the "@fynmesh/define-middleware" as a dummy import specifier, and add a name attribute to the import.
We use this to remember which module define the middleware.

When using middleware, the import needs to specify the correct expose module.
For example, for fynapp-react-middleware, the basic-counter middleware is actually implemented in the main exposed module.
So the import needs to look like this:

Two options to set the name.

1. as part of the specifier, always the last segment of the path, like import('fynapp-react-middleware/main/basic-counter')
2. add a name field to the attribute, but we need to update rollup plugin, maybe create-fynapp, and kernel to handel this.
   For now, option 1 should be simpler, so let's go with that first.

Like this:

```js
      middleware: import('fynapp-react-middleware/main/basic-counter',
        { with: { type: "fynapp-middleware" } }),
```

And kernel needs to take this into account when checking for dependencies and building the graph, so it loads the fynapp that provides the middleware first, and ensure the requested exposed module is loaded.
