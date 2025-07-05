# FynMesh Development Rules for Cursor

## General Rules

- When running commands and doing `cd`, always use full path. Always use `~` to refer to user's home directory.
- Use `fyn` instead npm.
  - add dependencies: `fyn add`
  - add devDependencies: `fyn add --dev`
  - add a package from the local colo-repo: use path to the package such as `fyn add ../../core/kernel`
  - install: `fyn` or `fyn install` or force install `fyn install --force-install`
- use `xrun` to run npm scripts
  - run npm script: `xrun <script>`
  - run multiple scripts serially: `xrun -s <script1> <script2> ...`
  - run multiple scripts concurrently: `xrun <script1> <script2> ...`
  - append extra args to script: `xrun <script1> -- arg1 --opt1`

## Colo-repo Structure

```
~/dev/fynmesh/
├── core/
│   └── kernel/                    # FynMesh kernel implementation
│       └── design/                # Architecture and design documents
├── demo/                          # Example FynApps and demonstrations
│   ├── fynapp-1/                  # Basic demo FynApp
│   ├── fynapp-react-middleware/   # React middleware provider
│   ├── fynapp-react-18/           # React 18 example
│   ├── fynapp-react-19/           # React 19 example
│   ├── regular-react-app/         # Non-federated React app
│   ├── demo-server/               # Development server
│   └── MIDDLEWARE-DEMO.md         # Middleware usage examples
├── rollup-federation/             # Federation tooling and samples
│   ├── federation-js/             # Core federation library
│   ├── rollup-plugin-federation/  # Rollup plugin for federation
│   └── sample-react-federation*/  # Federation examples
├── demo-rollup-externals/         # External dependency examples
├── dev-tools/                     # Development utilities
│   ├── create-fynapp/             # FynApp project generator and development assistant
│   └── rollup-wrap-plugin/        # Rollup wrapper plugin
├── .cursor/
│   └── rules/                     # Development rules and guidelines
├── package.json                   # Root package.json (mono-repo)
├── fynpo.json                     # Fynpo mono-repo configuration
└── fyn-lock.yaml                  # Dependency lock file
```

### Key Paths for Development

- **Kernel**: `~/dev/fynmesh/core/kernel/` - Core FynMesh implementation
- **Architecture Docs**: `~/dev/fynmesh/core/kernel/design/` - FynMesh architecture and design documents
- **Demo FynApps**: `~/dev/fynmesh/demo/` - Example applications and middleware
- **Federation Tools**: `~/dev/fynmesh/rollup-federation/` - Module federation utilities
- **Dev Tools**: `~/dev/fynmesh/dev-tools/` - Development utilities (create-fynapp, rollup-wrap-plugin)
- **Rules**: `~/dev/fynmesh/.cursor/rules/fynmesh-development.md` - Development guidelines
- **Middleware Examples**: `~/dev/fynmesh/demo/MIDDLEWARE-DEMO.md` - Middleware usage patterns

### Common Package References

When adding local dependencies, use these relative paths:

- From demo FynApp to kernel: `../../core/kernel`
- Between demo FynApps: `../other-fynapp/`
- To federation tools: `../../rollup-federation/federation-js`

## Middleware System

### Middleware Provider FynApps Contract

- Kernel checks any FynApp expose module name starts with `./middleware` for middlewares. Examples: `./middleware-react-context`, `./middleware/analytics`, `./middleware-auth`
- **File Structure Convention**: Exposed module names must mirror actual file structure
  - `./middleware-react-context` → `./src/middleware-react-context.ts`
  - `./middleware/analytics` → `./src/middleware/analytics.ts`
- From these exposed modules, Kernel detects any exports with `__middleware__` prefix: `export const __middleware__MyMiddleware = new MyMiddleware()` and automatically register them as middleware

### Middleware Implementation Pattern

- **File Structure**: Place middleware source code files in `src/` or `src/middleware` directory
- **Module Exposure**: Expose middleware modules with names starting with `./middleware`, mirroring actual file structure
- **Export Naming**: Export middleware using name `__middleware__<MiddlewareName>`

### Middleware Usage Pattern

- Use `useMiddleware` API to consume middleware in FynApp code:
  ```typescript
  export const main = useMiddleware(
    { provider: "provider-fynapp", name: "middleware-name" },
    config,
    userCode
  );
  ```
- `useMiddleware` returns object with `__middlewareInfo` field for kernel detection
- When kernel loads an exposed module from a FynApp, it scans all exports for `__middlewareInfo` marker
- When found, kernel looks up middleware and invokes it on the usage object
- `provider` field should match the provider FynApp name
- `name` field should match the middleware name within that FynApp
- **Configuration**: ALL middleware configuration comes from `useMiddleware` calls - no `middlewareConfig` in FynApp config
- Kernel only automatically loads the `./main` exposed module by default.
- Future: config can instruct kernel to load other exposed modules by default.
- Future: Dev tools will auto-detect `useMiddleware` calls and collect requirements

### Middleware Implementation

- Implement `FynAppMiddleware` interface with `name`, `setup()`, `apply()` methods
- Middleware receive `MiddlewareContext` with `config` (from `useMiddleware` calls) and `kernel` only
- Registry key format: `"provider-fynapp::middleware-name"`
- **Version Tracking**: Middleware versions are tracked by hosting FynApp version
- **Setup Method**: Called once during middleware registration for one-time initialization
- **Apply Method**: Called for each usage with specific configuration from `useMiddleware`

### Middleware Lifecycle

1. **Auto-Detection Phase**: FynApp loads → Kernel scans expose modules with name starts with `./middleware` for `__middleware__*` exports
2. **Registration Phase**: Middleware implementations automatically registered with provider::name keys
3. **Setup Phase**: Middleware `setup()` methods called for one-time initialization
4. **Application Phase**: Kernel scans expose module exports for `__middlewareInfo` fields → invokes middleware on usage objects
5. **Ambient Availability**: Middleware are ambient - once loaded, available to all subsequent FynApps

### Middleware Lookup and Resolution

- **Provider Specification**: Consumers can specify provider for exact lookup: `getMiddleware("name", "provider")`
- **Fallback Search**: When no provider specified, kernel searches across all providers
- **Version Resolution**: Latest version selected by default, specific versions can be requested
- **Multiple Providers**: When multiple providers offer same middleware, warning issued and first match used
- **Error Handling**: Descriptive error messages with available middleware listed

## General FynMesh Conventions

### FynApp Structure

- Config in `src/config.ts` with `export default { ... }`
- Main module in `src/main.ts` with `export function main(kernel, fynApp) { ... }`
- FynApp can expose modules for Federation in rollup config under `exposes` field
- **No middlewareConfig**: FynApp config should NOT contain `middlewareConfig` - all middleware configuration comes from `useMiddleware` calls

### Naming

- FynApp names: kebab-case (e.g., `fynapp-react-lib`)
- Middleware names: kebab-case (e.g., `react-context`)
- Export names: PascalCase with prefix (e.g., `__middleware__ReactContext`)

### Error Handling

- Use descriptive error messages with context
- Include available options in error messages for debugging
- For middleware lookup failures, list available middleware names
- Use emojis for visual distinction: ✅ success, ❌ error, ⚠️ warning, 🔍 searching
- Continue processing even if individual middleware fails (graceful degradation)

### Development

- Log middleware registration and application for debugging
- Use clear, descriptive console messages with emojis for key events
- Break complex implementations into focused, single-purpose functions
- **Registry Inspection**: Use `listMiddleware()` for debugging available middleware
- **Fallback Search Logging**: Log when fallback search is performed for transparency

### Type Safety

- Use proper TypeScript types for middleware interfaces
- Implement `MiddlewareLookupOptions` for advanced lookup scenarios
- Ensure `MiddlewareContext` properly typed with config from `useMiddleware`
- Registry uses `MiddlewareRegistry` type for proper structure

### Performance Considerations

- Middleware are registered once and reused (ambient)
- Version resolution uses sorted keys for consistent latest version selection
- Fallback search only performed when necessary
- Graceful failure handling prevents cascade failures

## Architecture Principles

- **Kernel-Level Management**: All middleware managed in single registry at kernel level
- **Collision Avoidance**: Registry uses `"provider::middleware-name"` format to prevent name collisions
- **Provider Specification**: Consumers specify provider for precise middleware resolution
- **Auto-Detection**: Middleware automatically detected from exposed modules
- **Ambient Availability**: Once loaded, middleware available to all subsequent FynApps
- **Configuration Locality**: All middleware configuration happens at usage site via `useMiddleware`
