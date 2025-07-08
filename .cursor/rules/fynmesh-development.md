# FynMesh Development Rules for Cursor

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
