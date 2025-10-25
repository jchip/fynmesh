# FynApps Dependency Model and Manifest Pipeline

## Goals

- Use standard Node/npm conventions (package.json dependencies/peerDependencies/optionalDependencies)
- Infer middleware roles from code (useMiddleware) with no new package.json keys
- Emit build-time manifests; kernel consumes a registry at runtime to resolve and load deps in order

## Dev-Time Conventions

### FynApp detection (package.json standard-only)

- Primary rule: A package is a FynApp if its package.json includes `@fynmesh/kernel` or `create-fynapp` in `dependencies` or `devDependencies`. No custom keys required. Ignore peer/optional deps for detection.
- Secondary heuristics (only if primary missing):
  - `exports` maps to `./dist/fynapp-entry.js` or `files` includes `dist/fynapp-entry.js`
  - Dist contains `fynapp-entry.js` or exposes `__middleware__*` symbols
- Builder rule: detect by (primary rule) OR (secondary heuristics); warn if ambiguous

### Dependencies declaration

- Use `dependencies`/`optionalDependencies` for FynApp→FynApp edges
- Use `peerDependencies` for expected provider packages (middlewares) to enforce compatibility
- Infer middleware provider/consumer roles from code via build-time analysis

- FynApp → FynApp deps: declare in `dependencies` (hard) or `optionalDependencies` (soft)
- Expected providers: declare in `peerDependencies` (e.g., `fynapp-react-middleware`) to enforce compatibility
- Version constraints: use normal semver ranges
- Code roles: infer provider/consumer from `useMiddleware` config (e.g., "consume-only" → consumer)

## Per-App Build Output (no global builder)

### Manifest filename and format compatibility

- Preferred: `dist/fynapp.manifest.json` (stable path)
- Also supported (back-compat): `federation.json` at app base or `dist/federation.json`
- Builders should emit the preferred name; kernel will try in order: explicit URL from resolver → `dist/fynapp.manifest.json` → `federation.json`

- Each FynApp builds itself and emits a manifest in its own dist; no monorepo scanning.
- Detect FynApp if `@fynmesh/kernel` or `create-fynapp` present in `dependencies|devDependencies`.
- A Rollup plugin extracts `useMiddleware` calls and detects `__middleware__*` provider exports, then writes `dist/fynapp.manifest.json`.
- Manifest (minimal, stable path):
```json
{
  "app": { "name": "fynapp-1-b", "version": "1.0.0" },
  "requires": [{ "name": "fynapp-1", "range": "^1.0.0" }],
  "middlewares": {
    "uses": [
      { "provider": "fynapp-react-middleware", "name": "basic-counter", "range": "^1.0.0", "role": "consumer" },
      { "provider": "fynapp-design-tokens", "name": "design-tokens", "range": "^1.0.0", "role": "consumer" }
    ],
    "provides": []
  }
}
```

- The manifest is just another file in the package tarball; no package.json custom keys.

## Publishing and Discovery

- Publish FynApp artifacts to npm (or npm-like) as usual; ensure `dist/fynapp.manifest.json` is included.

### FynApp Registry (basic features)

- Purpose: lightweight metadata service alongside npm packages; holds only manifests and version lists.
- Core APIs:
  - GET `/apps/:name/versions` → `["1.0.0", "1.1.0", ...]` (sorted asc/desc)
  - GET `/apps/:name/:version/manifest` → manifest JSON
  - Optional: GET `/apps/:name/resolve?range=^1.0.0` → `{ version, manifestUrl }`
- Publish flow:
  - After `npm publish`, CI uploads `dist/fynapp.manifest.json` to the registry as `/apps/:name/:version/manifest` and updates `/apps/:name/versions`.
  - Auth is registry-defined (token); artifacts remain on npm; registry stores no tarballs.
- Kernel resolver order:

1) Query registry for versions (or call resolve endpoint)

2) Choose max satisfying version via semver

3) Fetch manifest for that version

4) Fallback to CDN-by-convention if registry is unavailable

- Caching:
  - Encourage `Cache-Control: public, max-age=60` on versions; manifests longer (e.g., 5m) with `ETag`.

### Alternatives for development/demo

- Dev/demo: a script copies each app’s `dist/fynapp.manifest.json` into a single JSON for the demo server.
- CDN-by-convention remains a valid fallback: `https://unpkg.com/<pkg>@<ver>/dist/fynapp.manifest.json`.

### Demo registry aggregation (single-repo convenience)
- CLI/script `scripts/aggregate-manifests.mts` (dev-server):
  - Scans `demo/*/dist/fynapp.manifest.json`
  - Emits `/public/fynmesh/registry.json`:
  ```json
  {
    "apps": {
      "fynapp-1": { "versions": ["1.0.0"], "distBase": "/fynapp-1/dist" },
      "fynapp-1-b": { "versions": ["1.0.0"], "distBase": "/fynapp-1-b/dist" }
    }
  }
  ```
- Browser resolver for demo:
  - If registry present, use it; else default to `/<name>/dist/fynapp.manifest.json`.

## Kernel Integration

- Add a `RegistryResolver` hook to map `{name, versionRange}` → `{manifestUrl, distBase}`. Default resolver can implement CDN-by-convention; apps can provide a custom resolver.
- Kernel loads an app by: resolve → fetch manifest → topo sort on `requires` → load apps in order → rely on `signalMiddlewareReady` for provider/consumer readiness.

### Manifest resolution and loading plan (out-of-order tolerant)

- Components:
  - `RegistryResolver`: async resolve(name, range) → { version, manifestUrl, distBase }
  - `ManifestCache`: in-memory LRU keyed by `${name}@${version}` → manifest JSON
  - `LoadCoordinator`: tracks requests, waiting dependencies, and resumes when deps become available

- Manifest minimal fields used at runtime:
```json
{
  "app": { "name": "fynapp-1-b", "version": "1.0.0" },
  "requires": [{ "name": "fynapp-1", "range": "^1.0.0" }]
}
```

- Algorithm (per load requests: one or many):

1) For each requested `{name, range}`: `resolve()` → concrete `{name, version, manifestUrl}`

2) `fetchManifest()` via cache; on error → fail this branch with diagnostic

3) Build a dependency graph for the closure of `requires` (resolve each edge to concrete version)

4) Compute topo order with Kahn’s algorithm; for nodes already loaded, mark as satisfied

5) Schedule loads in batches (no indegree) → `loadFynApp(baseUrl)`

6) If an app is requested out-of-order (user calls load on a consumer first):

     - It is placed into `waitingByDependency[depKey]`

     - When a dependency finishes basics/bootstrap (or its manifest arrives), coordinator re-checks indegrees and resumes

- Waiting/Resume hooks:
  - On successful `loadFynAppBasics` of X: mark X “available” and decrement indegrees of its dependents; if zero, schedule
  - On `FYNAPP_BOOTSTRAPPED`: also wake dependents waiting for bootstrap-before-execute semantics

- Concurrency & retries:
  - Limit concurrent loads (e.g., 4) to reduce bandwidth contention
  - Retry manifest fetch with backoff; fail fast on 4xx
  - Cycle detection: if topo cannot consume all nodes → emit cycle error with cycle path

- Version resolution:
  - Use resolver-provided concrete version for each edge; if multiple children require conflicting versions → allow parallel distinct versions (federation-friendly), but warn

- Timeouts & diagnostics:
  - Optional timeout per waiting app; emit clear log with which dep is missing
  - Telemetry counters: waiting queue length, time-to-ready, failures

### Manifest schema: shared and exposed dependencies (optional)
- Expand `requires` edge with reasons:
```json
{
  "app": { "name": "consumer", "version": "1.0.0" },
  "requires": [
    { "name": "provider-a", "range": "^1.0.0", "reason": "shared:react" },
    { "name": "lib-x1", "range": "^2.0.0", "reason": "expose:./main" }
  ]
}
```

### Demo loader integration
- Always use `loadFynAppsByName` with concurrency (4–6) and rely on manifests for order.
- Providers first (design-tokens, react-middleware), consumers follow.

### Interplay with federation-js dynamic fallback
- Kernel’s manifest-driven plan preloads known deps; if a consumer imports a missing remote at runtime, federation-js may auto-discover/load it.
- When federation-js loads a remote, kernel should register the container and reconcile the graph (decrement indegrees, wake dependents) as if the provider was preplanned.
- This keeps imports resilient without requiring perfect upfront manifests.

### Resolution modes (future toggle)
- Strict: always load declared `requires` even if an equivalent runtime provider exists.
- Opportunistic: allow already-loaded compatible providers to satisfy and skip declared ones.
- Hybrid: prefer declared deps; fallback to runtime substitutes when compatible.
- Mode affects graph construction and “satisfaction” checks before execute.

### Kahn’s algorithm: graph build, ordering, and cycle handling

- Node identity: `nodeKey = `${name}@${version}``
- Structures:
  - `adj: Map<nodeKey, Set<nodeKey>>` (edges from dependency → dependent)
  - `indegree: Map<nodeKey, number>`
  - `nodes: Map<nodeKey, { manifest, status: 'unfetched'|'fetched'|'loadedBasics'|'bootstrapped' }>`
  - `waitingByDep: Map<nodeKey, Set<nodeKey>>` (dependents blocked by dep)

- Build graph (upon load requests):

1) For each `{name, range}` request: `resolver.resolve` → `{name, version, manifestUrl}` → `fetchManifest`

2) Insert `nodeKey` into `nodes`, `adj`, `indegree`

3) For each `requires` edge `{depName, depRange}`:

     - Resolve to `{depName, depVersion, depManifestUrl}` (lazy, parallel)

     - Add edge: `depKey -> nodeKey`; `indegree[nodeKey]++`

     - If `depKey` absent: enqueue fetch; add temp node in `nodes`

- Topo order (Kahn):
```ts
const q = [...nodesWithIndegree0NotAlreadyLoaded()]
const order: string[] = []
while (q.length) {
  const u = q.shift()!
  order.push(u)
  for (const v of adj.get(u) ?? []) {
    indegree.set(v, indegree.get(v)! - 1)
    if (indegree.get(v) === 0 && !isLoaded(v)) q.push(v)
  }
}
if (order.length < nodes.size) {
  // cycle or missing edges due to unresolved manifests
  const cyclic = [...nodes.keys()].filter(k => (indegree.get(k) ?? 0) > 0)
  handleCycle(cyclic)
}
```

- Cycle handling policy:
  - If any edge is from an `optional` dependency, drop those edges and retry topo
  - Otherwise: surface a clear error with the minimal cycle set and participating edges
  - Diagnostic: emit `CYCLE_DETECTED` with node keys and suggested breaks

- Out-of-order loads:
  - If consumer is requested before provider:
    - It enters graph with non-zero indegree; not scheduled until deps are available
    - When a dep finishes `loadFynAppBasics`, mark dep as available, decrement indegree for dependents, enqueue when zero

- Partial availability and retries:
  - If a manifest fetch fails with retryable error, keep the node; scheduler proceeds with other zero-indegree nodes
  - When manifest arrives later, rebuild affected subgraph indegrees and re-run the queue for impacted nodes only

- Multi-version deps:
  - Each resolved version is its own nodeKey; graph naturally supports parallel versions
  - Warn if too many versions of the same app are pulled (configurable threshold)

- Timeouts:
  - Optional per-node timeout from first request to `loadedBasics`; on timeout, emit `DEPENDENCY_TIMEOUT` and leave node blocked unless optional

## Runtime Delivery

- Demo server serves the aggregated registry at `/fynmesh/registry.json`
- Kernel loads the registry on startup (once), fetches per-app manifests lazily
- Kernel constructs a dep tree per app load:
  - Resolve `requires` edges; perform topo sort
  - Prioritize `hints.eager`
  - Ensure provider apps bootstrap before consumer apps
- The new `signalMiddlewareReady` + bootstrap dependency checks orchestrate execution

## Validation Rules

- Build fails on cyclical app deps or incompatible semver among in-repo apps
- Warn on missing optional deps or missing providers listed in peerDependencies
- Compare code-inferred roles vs declared ranges and warn on drift

## Environment/URLs (No new per-app config by default)

- Base URLs resolved by the demo server (maps app name → base path)
- If needed later: allow server-side registry enrichment per env (dev/prod) without changing fynapps

## Rollout Steps

1. Implement dep graph builder CLI (dev-tools) to emit per-app manifests and aggregate registry
2. Add build hook to run the builder during `fynpo` build
3. Update demo server to serve `/fynmesh/registry.json` and static per-app manifests
4. Update kernel to fetch registry, pull per-app manifests, then compute load order
5. Add validation with clear console diagnostics in builder
6. Document conventions for authors (where to declare deps, how provider/consumer inferred)

7. Demo-only: add aggregator script; wire demo server to serve `/fynmesh/registry.json`
8. Convert demo loader to use `loadFynAppsByName` exclusively (remove manual ordering)
9. Add e2e test: ensure `fynapp-1-b` waits on `fynapp-1` and remains stable under concurrency

### To-dos

- [ ] Create dep graph builder CLI to scan package.json and code, emit manifests
- [ ] Hook builder into monorepo build to write per-app and aggregated registry
- [ ] Expose /fynmesh/registry.json and per-app manifests in demo server
- [ ] Kernel loads registry/manifests and performs topo-sorted loading
- [ ] Implement cycle/version validation and drift warnings in builder
- [ ] Write doc on declaring deps and how roles are inferred

## Dependency Types and Detection Details

### Shared Module Dependencies

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

**Key detection points:**
- `import: false` = consume-only, creates dependency on provider FynApp
- `import: true` (default) = provide + consume, can satisfy other apps' dependencies
- Provider FynApp should be listed in consumer's package.json dependencies

### Exposed Module Dependencies

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

**Key detection points:**
- Creates runtime dependency on the exposing FynApp
- Version requirements can be specified via `requireVersion`
- Must ensure providing app is loaded before import execution
- Rollup's `resolveDynamicImport` hook intercepts these imports

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
   - Generate comprehensive dependency information in manifest

### Manifest Extended Schema with Dependencies

```json
{
  "app": { "name": "consumer-app", "version": "1.0.0" },
  "requires": [
    {
      "name": "@myorg/react-provider-fynapp",
      "range": "^1.0.0",
      "reason": "shared:react,react-dom"
    },
    {
      "name": "fynapp-x1",
      "range": "^2.0.0",
      "reason": "expose:./main"
    }
  ],
  "middlewares": {
    "uses": [
      { "provider": "fynapp-react-middleware", "name": "basic-counter", "range": "^1.0.0", "role": "consumer" }
    ],
    "provides": []
  },
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
  ]
}
```

## Dependency Resolution Examples

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
**Load Order:** A, B → C (A and B parallel, then C)

### Mixed Dependencies (Shared + Exposed)
```
App A (provides: react, exposes: Button)
App B (consumes: react, imports: Button from App A)
App C (consumes: react, imports: Button from App A)
```
**Load Order:** A → B, C (both dependencies must be satisfied first)

### Third-Party Provider Scenario (Complex)
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

**Resolution Modes (future):**
1. **Strict Mode:** Always load declared dependencies regardless of alternatives
2. **Opportunistic Mode:** Skip loading if compatible provider already exists
3. **Hybrid Mode:** Load declared dependencies but allow runtime substitution

### Circular Dependencies (Error Case)
```
App A (consumes: moduleB, provides: moduleA)
App B (consumes: moduleA, provides: moduleB)
```
**Result:** Topo sort fails; emit cycle error with full dependency chain

## Runtime Data Structures

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

## Error Handling

### Missing Dependencies
- Dependency declared but FynApp not found at runtime
- Clear error message with resolution steps
- Example: "FynApp 'consumer-app' requires 'react-provider@^1.0.0' but it was not found"

### Circular Dependencies
- Detect during graph construction
- Provide full dependency chain in error message
- Example: "Circular dependency detected: A → B → C → A"

### Version Conflicts
- Multiple apps provide same shared module with incompatible versions
- Use federation's existing resolution logic with clear conflict reporting
- Example: "Shared module 'react' version conflict: App A requires ^18.0.0, App B provides ^17.0.0"

### Third-Party Provider Scenarios
- Declared dependency vs. actual runtime resolution mismatches
- Configurable resolution modes for different use cases
- Warnings when declared providers are skipped in favor of runtime substitutes

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

**Generated Manifest:**
```json
{
  "app": { "name": "my-app", "version": "1.0.0" },
  "requires": [
    {
      "name": "@myorg/react-provider-fynapp",
      "range": "^1.0.0",
      "reason": "shared:react,react-dom"
    }
  ],
  "dependencies": [
    {
      "fynapp": "@myorg/react-provider-fynapp",
      "reason": "shared-module-consumption",
      "provides": ["react", "react-dom"]
    }
  ]
}
```

## Implementation Phases

### Phase 1: Build-Time Detection (Rollup Plugin)
- [x] Detect `__middleware__*` provider exports
- [ ] Enhance plugin to detect `import: false` shared modules
- [ ] Add transform hook to detect dynamic imports with `mf-expose` metadata
- [ ] Read package.json to map FynApp dependencies
- [ ] Generate comprehensive dependency information in manifest

### Phase 2: Runtime Resolution (Kernel)
- [x] Add manifest parsing to kernel
- [x] Implement dependency graph construction and topological sort (Kahn's algorithm)
- [x] Add dependency validation during bootstrap
- [ ] Enhance with full `dependencies` array parsing

### Phase 3: Loading Strategy
- [x] Implement recursive dependency loading via manifests
- [x] Update bootstrap process for dependency-ordered loading
- [x] Add comprehensive error handling for missing deps
- [ ] Improve cycle detection and reporting

### Phase 4: Advanced Scenarios (Future)
- [ ] Handle third-party provider scenarios
- [ ] Implement dependency resolution modes (strict/opportunistic/hybrid)
- [ ] Add runtime shared module satisfaction checking
- [ ] Optimize loading by skipping unnecessary dependencies when compatible providers exist
