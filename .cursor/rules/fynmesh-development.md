# FynMesh Development Rules for Cursor

## Middleware System

### Middleware Provider FynApps Contract

- Kernel checks any FynApp expose module name starts with `./middleware` for middlewares. Examples: `./middleware-react-context`, `./middleware/analytics`, `./middleware-auth`
- From these exposed modules, Kernel detects any exports with `__middleware__` prefix: `export const __middleware__MyMiddleware = new MyMiddleware()` and automatically register them as middleware

### Middleware Implementation Pattern

- **Convention**: Place middleware source code in directory `src/middleware/` and expose with name `./middleware/foo`
- **Export naming**: Export middleware using name `__middleware__<MiddlewareName>`

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
- Kernel only automatically loads the `./main` exposed module by default.
- Future: config can instruct kernel to load other exposed modules by default.
- Future: Dev tools will auto-detect `useMiddleware` calls and collect requirements

### Middleware Implementation

- Implement `FynAppMiddleware` interface with `name`, `setup()`, `apply()` methods
- Middleware receive `MiddlewareContext` with `config` and `kernel` only
- Registry key format: `"provider-fynapp::middleware-name"`

### Middleware Lifecycle

1. FynApp loads → Kernel scans expose modules with name starts with `./middleware` for `__middleware__*` exports
2. After config loads → Kernel applies ALL registered middleware automatically
3. Kernel scans expose module exports for `__middlewareInfo` fields → invokes middleware on usage objects
4. Middleware are ambient - once loaded, available to all subsequent FynApps

## General FynMesh Conventions

### FynApp Structure

- Config in `src/config.ts` with `export default { ... }`
- Main module in `src/main.ts` with `export function main(kernel, fynApp) { ... }`
- FynApp can expose modules for Federation in rollup config under `exposes` field

### Naming

- FynApp names: kebab-case (e.g., `fynapp-react-lib`)
- Middleware names: kebab-case (e.g., `react-context`)
- Export names: PascalCase with prefix (e.g., `__middleware__ReactContext`)

### Error Handling

- Use descriptive error messages with context
- Include available options in error messages for debugging
- Add TODO comments for future error handling improvements

### Development

- Log middleware registration and application for debugging
- Use clear, descriptive console messages with emojis for key events
- Break complex implementations into focused, single-purpose functions
