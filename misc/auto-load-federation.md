# Automatic Shared Module Provider Detection

## Overview

This document describes the implementation of automatic shared module provider detection in FynMesh, which enables the kernel to automatically load provider FynApps (like React libraries) when consumer FynApps require shared modules.

## The Problem

### Why Component Libraries Auto-Loaded But Shared Module Providers Didn't

**Component Libraries (✅ Working)**
```
Consumer FynApp → imports exposed module → tracked in import-exposed → kernel auto-loads
```

Example: `fynapp-x1` gets tracked because:
- Consumer imports exposed modules directly
- Rollup plugin detects the import
- Adds entry to `import-exposed` in manifest
- Kernel reads manifest and loads the dependency

**Shared Module Providers (❌ Not Working)**
```
Consumer FynApp → consumes shared module → tracked in consume-shared → NO provider mapping → kernel can't auto-load
```

Example: `fynapp-react-lib` doesn't get tracked because:
- Consumer uses shared modules via SystemJS/Module Federation (not direct imports)
- Rollup plugin can't detect which FynApp provides the shared module
- Only module name appears in `consume-shared`, no provider mapping
- Kernel doesn't know which FynApp to load

### Root Cause

| FynApp Type | Tracked in Manifest? | Why |
|------------|---------------------|-----|
| Component Libraries (fynapp-x1) | ✅ Yes | Exposes modules that are imported → appears in `import-exposed` |
| Middleware Providers (fynapp-react-middleware) | ✅ Yes | Exposes middleware modules → appears in `import-exposed` |
| Shared Module Providers (fynapp-react-lib) | ❌ No | Only provides shared modules → NOT in `import-exposed` |

The manifest had no mechanism to map:
- Shared module name (e.g., `esm-react`)
- → Provider FynApp name (e.g., `fynapp-react-lib`)

## The Solution

### Architecture

Implement automatic detection at build-time to create mappings between shared modules and their provider FynApps:

1. **Provider Side**: Provider FynApps declare what they provide in their manifest
2. **Consumer Side**: Build-time detection scans dependencies and creates provider mappings
3. **Kernel Side**: Kernel reads mappings and auto-loads provider FynApps

### Implementation

#### 1. Provider Manifest Format

Provider FynApps declare what they provide using `provide-shared`:

```json
{
  "name": "fynapp-react-lib",
  "version": "19.1.0",
  "provide-shared": {
    "esm-react": {
      "singleton": true,
      "requiredVersion": "^19.0.0"
    },
    "esm-react-dom": {
      "singleton": true,
      "requiredVersion": "^19.0.0"
    }
  }
}
```

#### 2. Consumer Manifest Format

Consumer FynApps now include `shared-providers` section mapping shared modules to providers:

```json
{
  "name": "fynapp-1",
  "version": "1.0.0",
  "consume-shared": {
    "esm-react": {"requireVersion": "^19.0.0"},
    "esm-react-dom": {"requireVersion": "^19.0.0"}
  },
  "shared-providers": {
    "fynapp-react-lib": {
      "requireVersion": "^19.0.0",
      "provides": ["esm-react", "esm-react-dom"]
    }
  },
  "import-exposed": {
    "fynapp-x1": {...},
    "fynapp-react-middleware": {...}
  }
}
```

#### 3. Build-Time Detection

**Location**: `dev-tools/create-fynapp/src/index.ts:254-337`

**Algorithm**:
```typescript
function detectSharedProviders(packageJson, consumeShared) {
  const providers = {};
  const deps = {...packageJson.dependencies, ...packageJson.devDependencies};

  // For each dependency
  for (const [depName, depVersion] of Object.entries(deps)) {
    // Check if it has a FynApp manifest
    const manifestPath = resolve(`node_modules/${depName}/dist/fynapp.manifest.json`);
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(readFileSync(manifestPath));

    // Check if it provides any shared modules we consume
    if (manifest['provide-shared']) {
      const providedModules = [];
      for (const sharedModule of Object.keys(consumeShared)) {
        if (manifest['provide-shared'][sharedModule]) {
          providedModules.push(sharedModule);
        }
      }

      if (providedModules.length > 0) {
        providers[depName] = {
          requireVersion: depVersion,
          provides: providedModules
        };
      }
    }
  }

  return providers;
}
```

**Integration**: Called in `generateFynAppManifest()` at line 460

## Results

### Verification

**React 19 Consumers**:
- `fynapp-1`: Maps `fynapp-react-lib@^19.0.0` → provides `esm-react`, `esm-react-dom`
- `fynapp-x1-v2`: Maps `fynapp-react-lib@^19.0.0` → provides `esm-react`, `esm-react-dom`

**React 18 Consumers**:
- `fynapp-x1-v1`: Maps `fynapp-react-lib@^18.0.0` → provides `esm-react`, `esm-react-dom`

**Runtime Behavior**:
- ✅ Kernel automatically loads `fynapp-react-18` for React 18 consumers
- ✅ Kernel automatically loads `fynapp-react-19` for React 19 consumers
- ✅ No explicit pre-loading required
- ✅ Multiple React versions coexist correctly

## Key Insights

1. **Build-Time Information is Sufficient**: All necessary information is available at build time through `package.json` dependencies and FynApp manifests

2. **Provider Declaration**: Providers must declare what they provide in their manifests using `provide-shared`

3. **Automatic Dependency Graph**: The kernel can now build a complete dependency graph including shared module providers

4. **Version Flexibility**: The system supports multiple versions of the same provider (React 18 and 19) loaded simultaneously

## Future Considerations

- Could extend to other shared module types beyond React
- Provider resolution follows semantic versioning from `package.json`
- Manifest format is extensible for additional metadata
