# FynApp Dependencies Detection and Resolution

## Overview

FynApps can depend on other FynApps through two primary mechanisms:
1. **Shared Module Dependencies** - consuming shared modules provided by other FynApps
2. **Exposed Module Dependencies** - dynamically importing exposed modules from other FynApps

This document outlines how we detect, store, and resolve these dependencies to ensure proper loading order and runtime satisfaction.

## Dependency Types

### 1. Shared Module Dependencies

FynApps declare shared module consumption through rollup configuration:

```javascript
// Consumer FynApp - depends on provider for react
federation({
  name: 'consumer-app',
  shared: {
    'react': { import: false, singleton: true },      // consume-only
    'lodash': { import: false, requiredVersion: '^4.0.0' }
  }
})

// Provider FynApp - provides react to others
federation({
  name: 'provider-app',
  shared: {
    'react': { singleton: true },                     // provide + consume (default)
    'lodash': { requiredVersion: '^4.0.0' }
  }
})
```

**Key Points:**
- `import: false` = consume-only, creates dependency on provider FynApp
- `import: true` (default) = provide + consume, can satisfy other apps' dependencies
- Provider FynApp must be listed in consumer's package.json dependencies

### 2. Exposed Module Dependencies

FynApps can dynamically import exposed modules from other FynApps:

```javascript
// Dynamic import with FynMesh metadata
const components = await import('fynapp-x1/main', {
  with: {
    type: "mf-expose",
    requireVersion: "^2.0.0"
  }
});

const Button = await import('ui-library/Button', {
  with: { type: "mf-expose" }
});
```

**Key Points:**
- Creates runtime dependency on the exposing FynApp
- Version requirements can be specified via `requireVersion`
- Must ensure providing app is loaded before import execution

## Detection and Storage

### Build-Time Detection (Rollup Plugin)

The rollup plugin analyzes code and configuration to detect dependencies:

1. **Shared Module Analysis**
   - Identify `import: false` modules (consume-only)
   - Map to providing FynApps via package.json dependencies

2. **Dynamic Import Analysis**
   - Use Rollup's `resolveDynamicImport` hook to intercept dynamic imports
   - Filter for imports with `with: { type: "mf-expose" }` metadata
   - Extract target FynApp names and version requirements from import specifiers

3. **Dependency Mapping**
   - Cross-reference with package.json dependencies
   - Generate comprehensive dependency information

### federation.json Structure

```json
{
  "name": "consumer-app",
  "dependencies": [
    {
      "fynapp": "@myorg/react-provider-fynapp",
      "reason": "shared-module-consumption",
      "provides": ["react", "react-dom"]
    },
    {
      "fynapp": "fynapp-x1",
      "reason": "exposed-module-import",
      "requireVersion": "^2.0.0",
      "exposes": ["main"],
      "imports": [
        "import('fynapp-x1/main', { with: { type: 'mf-expose', requireVersion: '^2.0.0' } })"
      ]
    }
  ],
  "shared": {
    "react": { "import": false, "singleton": true }
  }
}
```

### Runtime Data Structures

```typescript
interface FynAppDependency {
  fynapp: string;           // Package name of dependency
  reason: 'shared-module-consumption' | 'exposed-module-import';
  requireVersion?: string;  // Version requirement

  // Shared module dependencies
  provides?: string[];      // Shared modules it provides

  // Exposed module dependencies
  exposes?: string[];       // Exposed modules being imported
  imports?: string[];       // Actual import statements found
}

interface FynAppInfo {
  name: string;
  url?: string;
  dependencies?: FynAppDependency[];
  entry?: FederationEntry;
}
```

## Dependency Resolution

### Load Order Resolution

```typescript
class DependencyResolver {
  /**
   * Resolve load order using topological sort
   */
  resolveLoadOrder(apps: FynAppInfo[]): FynAppInfo[] {
    // 1. Build dependency graph
    // 2. Detect circular dependencies
    // 3. Topological sort
    // 4. Return ordered list (providers before consumers)
  }

  /**
   * Validate all dependencies are satisfied
   */
  validateDependencies(app: FynAppInfo, loadedApps: Set<string>): boolean {
    return app.dependencies?.every(dep =>
      loadedApps.has(dep.fynapp)
    ) ?? true;
  }

  /**
   * Check if shared modules are satisfied by already loaded apps
   * (handles third-party provider scenarios)
   */
  checkSharedModuleSatisfaction(
    app: FynAppInfo,
    shareScope: ShareScope
  ): { satisfied: boolean; providers: string[] } {
    // Check if required shared modules are available from other loaded apps
  }
}
```

### Loading Strategy

```typescript
class FynMeshKernel {
  async loadFynAppWithDependencies(baseUrl: string): Promise<void> {
    // 1. Load federation.json from baseUrl
    // 2. Parse dependencies
    // 3. Recursively load dependencies first
    // 4. Load the target app
    // 5. Bootstrap in dependency order
  }

  async bootstrapFynApp(appsInfo: FynAppInfo[]): Promise<void> {
    // 1. Resolve load order via topological sort
    // 2. Bootstrap in dependency order
    // 3. Validate dependencies before each bootstrap
  }
}
```

## Complex Scenarios

### Simple Dependency Chain
```
App A (provides: react) ← App B (consumes: react) ← App C (consumes: react)
```
**Load Order:** A → B, C (B and C can load in parallel after A)

### Multiple Dependencies
```
App A (provides: react)
App B (provides: lodash)
App C (consumes: react, lodash)
```
**Load Order:** A, B → C

### Mixed Dependencies
```
App A (provides: react, exposes: Button)
App B (consumes: react, imports: Button from App A)
App C (consumes: react, imports: Button from App A)
```
**Load Order:** A → B, C

### Third-Party Provider (Complex)
```
App A (provides: react@^18.0.0)
App B (consumes: react, depends on App A in package.json)
App C (provides: react@^18.2.0, already loaded)
```

**Situation:** App B declares dependency on App A for react, but App C already provides compatible react.

**Considerations:**
- Declared dependencies vs. runtime resolution mismatch
- App A might not need loading if App C satisfies the requirement
- Version compatibility becomes critical
- Need to distinguish "declared" vs "runtime" dependencies

**Resolution Modes:**
1. **Strict Mode:** Always load declared dependencies regardless of alternatives
2. **Opportunistic Mode:** Skip loading if compatible provider already exists
3. **Hybrid Mode:** Load declared dependencies but allow runtime substitution

### Circular Dependencies (Error)
```
App A (consumes: moduleB, provides: moduleA)
App B (consumes: moduleA, provides: moduleB)
```
**Result:** Error with dependency chain in message

## Error Handling

### Missing Dependencies
- Dependency declared but FynApp not found at runtime
- Clear error message with resolution steps

### Circular Dependencies
- Detect during graph construction
- Provide full dependency chain in error message

### Version Conflicts
- Multiple apps provide same shared module with incompatible versions
- Use federation's existing resolution logic with clear conflict reporting

### Third-Party Provider Scenarios
- Declared dependency vs. actual runtime resolution mismatches
- Configurable resolution modes for different use cases

## Implementation Phases

### Phase 1: Build-Time Detection
- [ ] Enhance rollup plugin to detect `import: false` shared modules
- [ ] Add transform hook to detect dynamic imports with `mf-expose` metadata
- [ ] Read package.json to map FynApp dependencies
- [ ] Generate comprehensive dependency information in federation.json

### Phase 2: Runtime Resolution
- [ ] Add dependency parsing to kernel
- [ ] Implement dependency graph construction and topological sort
- [ ] Add dependency validation during bootstrap

### Phase 3: Loading Strategy
- [ ] Implement recursive dependency loading
- [ ] Update bootstrap process for dependency-ordered loading
- [ ] Add comprehensive error handling

### Phase 4: Advanced Scenarios (Future)
- [ ] Handle third-party provider scenarios
- [ ] Implement dependency resolution modes (strict/opportunistic/hybrid)
- [ ] Add runtime shared module satisfaction checking
- [ ] Optimize loading by skipping unnecessary dependencies

## Configuration Examples

### Complete Provider-Consumer Setup

**Provider FynApp:**
```javascript
// @myorg/react-provider-fynapp/rollup.config.js
federation({
  name: 'react-provider',
  shared: {
    'react': { singleton: true },
    'react-dom': { singleton: true }
  }
})
```

**Consumer FynApp:**
```javascript
// @myorg/my-app/rollup.config.js
federation({
  name: 'my-app',
  shared: {
    'react': { import: false, singleton: true },
    'react-dom': { import: false, singleton: true }
  }
})
```

```json
// @myorg/my-app/package.json
{
  "dependencies": {
    "@myorg/react-provider-fynapp": "^1.0.0"
  }
}
```

**Result:** my-app depends on react-provider, must load react-provider first.

**Generated federation.json:**
```json
{
  "name": "my-app",
  "dependencies": [
    {
      "fynapp": "@myorg/react-provider-fynapp",
      "reason": "shared-module-consumption",
      "provides": ["react", "react-dom"]
    }
  ]
}
```
