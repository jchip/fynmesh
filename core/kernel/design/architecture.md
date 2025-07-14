# FynMesh Architecture

FynMesh is a large enterprise scale web application framework with Module Federation & Micro Frontends, enabling modular, scalable applications through independently deployable microfrontends (FynApps).

## Core Principles

- **Independent Development**: Teams develop and deploy FynApps autonomously
- **Shared Dependencies**: Efficient sharing of common libraries and utilities
- **Federation-First**: Built on proven Module Federation technology
- **ES Modules Only**: Modern module system for clean, standardized interfaces
- **Type Safety**: Full type safety and modern language features
- **Automatic Dependencies**: Build-time detection and runtime resolution
- **Middleware System**: Standardized way to share functionality across FynApps

## System Components

### The Kernel

The kernel orchestrates the entire FynMesh ecosystem with unified APIs across browser and Node.js environments.

**Core Responsibilities:**
- **Lifecycle Management**: FynApp loading, initialization, and bootstrap coordination
- **Federation Integration**: Interface with Module Federation containers and shared scopes
- **Dependency Resolution**: Ensure proper load order based on FynApp dependencies
- **Platform Abstraction**: Unified API across environments
- **Runtime Coordination**: Manage shared services and inter-FynApp communication
- **Middleware Management**: Automatic discovery, registration, and lifecycle management of middleware

**Platform Implementations:**
- **Browser Kernel**: DOM-based loading and client-side federation
- **Node Kernel**: Server-side rendering and federation support

### Middleware System

The middleware system provides a standardized way for FynApps to share functionality through a kernel-managed registry.

**Key Features:**
- **Automatic Discovery**: Middleware are automatically detected and registered
- **Lifecycle Management**: Setup, apply, and execution phases
- **Type Safety**: Full TypeScript support with strongly typed interfaces
- **Provider-Consumer Pattern**: Clean separation between middleware providers and consumers
- **Context Management**: Per-FynApp middleware data storage and sharing

**Core Components:**
- **`useMiddleware` API**: Declarative middleware usage
- **`FynModule` Interface**: Standardized interface for FynApp modules
- **Registry System**: Kernel-managed middleware registry with `provider::name` format
- **Middleware Context**: Per-FynApp data storage and sharing

*For detailed middleware architecture, see [fynapp-middleware-architecture.md](./fynapp-middleware-architecture.md)*

### FynApp Structure

FynApps are self-contained microfrontends with clear boundaries and standardized interfaces.

**Development Structure:**
```
fynapp/
├── package.json          # NPM package with FynApp dependencies
├── rollup.config.ts      # Federation and build configuration
├── src/
│   ├── main.ts          # Entry point and bootstrap logic
│   ├── config.ts        # FynApp configuration
│   ├── components/      # Application components
│   └── middleware/      # Middleware implementations (optional)
└── tsconfig.json        # TypeScript configuration
```

**Build Output:**
```
dist/
├── federation.json      # Federation metadata and dependencies
├── fynapp-entry.js     # FynMesh federation entry point
├── main.js             # Application bundle
├── middleware-*.js     # Middleware bundles (if any)
└── assets/             # Static resources
```

**Configuration:**
- Module exposure and sharing through federation plugin
- Dependency declarations in package.json
- Build optimization and compilation
- Standardized entry points with main function and optional configuration
- Middleware loading configuration (`loadMiddlewares: true`)

### Federation Integration

FynMesh leverages Module Federation through the `@fynmesh/federation-js` package.

**Key Components:**
- **Container**: Module Federation container interface
- **FederationEntry**: Typed interface for federation entry modules
- **Share Scope**: Shared dependency management
- **Dynamic Loading**: Runtime module resolution

**Capabilities:**
- Container setup and share scope integration
- Dynamic module loading and resolution
- Direct access to federation containers
- Automatic middleware detection from exposed modules

### Dependency System

FynApps can depend on other FynApps through shared modules and exposed components, with automatic detection and resolution.

**Dependency Types:**
- **Shared Module Dependencies**: Consuming shared libraries from provider FynApps
- **Exposed Module Dependencies**: Dynamic imports of components from other FynApps
- **Middleware Dependencies**: Consuming middleware functionality from provider FynApps

**Process:**
- **Build-Time**: Rollup plugin detects dependencies during build
- **Runtime**: Kernel resolves load order and validates dependencies
- **Storage**: Dependencies stored in federation.json for runtime use

*For detailed dependency detection, resolution algorithms, and implementation phases, see [fynapp-dependencies.md](./fynapp-dependencies.md)*

## Runtime Flow

**Kernel Initialization:**
Platform-specific kernel instantiation → Runtime data structure initialization → Share scope and federation setup → Middleware registry initialization → Ready for FynApp loading

**FynApp Loading:**
Load federation.json from FynApp URL → Parse dependency information → Resolve dependency load order → Load federation entry modules → Initialize federation containers → Auto-detect and register middleware

**FynApp Bootstrap:**
Validate all dependencies are loaded → Load middleware from exposed modules → Bootstrap FynApps in dependency order → Execute middleware lifecycle (setup/apply) → Execute FynApp initialization logic → Register with kernel runtime

**Runtime Operation:**
Inter-FynApp communication through kernel → Shared dependency resolution → Middleware functionality access → Dynamic module loading → Lifecycle management

## File Formats

### federation.json
Generated by the build process, contains federation metadata and dependencies:
```json
{
  "name": "my-fynapp",
  "version": "1.0.0",
  "dependencies": [
    {
      "fynapp": "provider-fynapp",
      "reason": "shared-module-consumption",
      "provides": ["react", "lodash"]
    }
  ],
  "exposes": {
    "./main": "./main.js",
    "./middleware/my-middleware": "./middleware-my-middleware.js"
  },
  "entry": "./fynapp-entry.js",
  "shared": {
    "react": { "singleton": true }
  }
}
```

### FynApp Entry Point
FynApps export standardized entry points:
- **Function-based**: `export function main(runtime: FynModuleRuntime)`
- **Module-based**: `export const main = useMiddleware(config, moduleObject)`
- **Middleware exports**: `export const __middleware__MiddlewareName = implementation`

### FynApp Configuration
```typescript
// src/config.ts
export const config = {
  loadMiddlewares: true, // Enable middleware loading
  // ... other configuration
};
```

## Middleware Examples

### Design Tokens Middleware

A comprehensive design tokens middleware that provides centralized theme management and CSS custom properties.

**Features:**
- Centralized design system management
- CSS custom properties injection
- Runtime theme switching
- Type-safe design tokens
- FynApp-specific configurations

**Usage:**
```typescript
export const main = useMiddleware(
  {
    info: {
      name: "design-tokens",
      provider: "fynapp-design-tokens",
      version: "^1.0.0",
    },
    config: {
      theme: "fynmesh-default",
      cssCustomProperties: true,
      cssVariablePrefix: "fynmesh",
    },
  },
  middlewareUser,
);
```

### React Context Middleware

Provides shared React context across multiple FynApps.

**Features:**
- Shared React context providers
- Cross-FynApp state sharing
- Event-driven state synchronization
- Type-safe context hooks

## Development Workflow

**FynApp Development:**
Create FynApp using template → Configure federation and build settings → Develop components and logic → Declare dependencies in package.json → Configure middleware usage → Build and test locally

**Middleware Development:**
Create middleware provider FynApp → Implement middleware interface → Export with `__middleware__` prefix → Configure module exposure → Test with consumer FynApps → Deploy middleware provider

**Dependency Management:**
Configure shared modules in federation settings → Declare FynApp dependencies in package.json → Declare middleware dependencies in `useMiddleware` → Automatic build-time detection via rollup plugin → Runtime resolution handled by kernel

**Deployment:**
Compile and generate federation bundles → Deploy build output to CDN/server → Configure FynApp URLs in host applications → Kernel manages loading, dependencies, and middleware automatically

## Platform Support

**Browser Environment:**
DOM integration, client-side federation, asset management, development tools, middleware system

**Node.js Environment:**
Server-side rendering, file system access, process integration, build tools, middleware system

## Demo and Development Server

FynMesh includes a comprehensive demo server that showcases the capabilities of the framework.

**Features:**
- **Template System**: Nunjucks-based template engine for dynamic HTML generation
- **Container Management**: Responsive container sizing for different FynApp types
- **Hot Reloading**: Development server with automatic recompilation
- **Middleware Demonstration**: Live examples of middleware usage

**Container Sizing:**
- **Standard FynApps**: 350px minimum height for framework demos
- **Complex Applications**: Dynamic sizing (e.g., 70vh for dashboard applications)
- **Responsive Design**: Adaptive containers based on content requirements

## Best Practices

**FynApp Design:**
- Keep FynApps focused and single-purpose
- Use clear, typed interfaces for exposed modules
- Implement proper error boundaries
- Follow consistent naming conventions
- Use middleware for cross-cutting concerns

**Middleware Design:**
- Single responsibility principle
- Stateless design with explicit state management
- Configuration validation
- Error boundaries and fallback strategies
- Performance considerations

**Dependency Management:**
- Minimize cross-FynApp dependencies
- Use shared modules for common libraries
- Version dependencies appropriately
- Document public interfaces
- Use middleware for shared functionality

**Performance:**
- Optimize bundle sizes and loading
- Use code splitting effectively
- Implement proper caching strategies
- Monitor federation overhead
- Lazy load middleware when possible

**Development:**
- Use TypeScript for type safety
- Implement comprehensive testing
- Follow semantic versioning
- Maintain backward compatibility
- Document middleware APIs

## Production Examples

### FynApp Design Tokens
A comprehensive design tokens middleware providing:
- 🎨 Centralized design system
- 🎯 CSS custom properties injection
- 🔄 Runtime theme switching
- 📱 Responsive design tokens
- 🎭 Multiple theme support

### React Context Middleware
Shared React context across FynApps:
- ⚛️ Provider/Consumer pattern
- 🔗 Cross-FynApp state sharing
- 🎪 Event-driven synchronization
- 🔒 Type-safe context hooks

### Dashboard Applications
Complex multi-section applications:
- 📊 Tab-based navigation
- 📈 Charts and statistics
- 📋 Data tables
- ⚙️ Settings management
- 🎛️ Real-time updates

## Future Considerations

- **Advanced Dependency Resolution**: Third-party provider scenarios and resolution modes
- **Performance Optimization**: Bundle concatenation and loading strategies
- **Development Tooling**: Enhanced debugging and development experience
- **Ecosystem Integration**: Framework-specific adapters and tooling
- **Middleware Marketplace**: Standardized middleware distribution
- **Advanced Federation**: Dynamic fallback mechanisms and smart loading

## Architecture Diagrams

### System Overview
```
┌─────────────────────────────────────────────────────────────────┐
│                        FynMesh Kernel                          │
├─────────────────────────────────────────────────────────────────┤
│  Lifecycle Management │ Federation Integration │ Middleware    │
│  Dependency Resolution │ Platform Abstraction  │ Management    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼──────┐ ┌─────▼─────┐ ┌──────▼──────┐
            │   FynApp A   │ │  FynApp B │ │   FynApp C  │
            │              │ │           │ │             │
            │ ┌──────────┐ │ │ ┌───────┐ │ │ ┌─────────┐ │
            │ │Components│ │ │ │Middleware│ │ │Components│ │
            │ │          │ │ │ │Provider│ │ │          │ │
            │ └──────────┘ │ │ └───────┘ │ │ └─────────┘ │
            └──────────────┘ └───────────┘ └─────────────┘
```

### Middleware Flow
```
Provider FynApp          Kernel Registry          Consumer FynApp
┌─────────────┐         ┌─────────────────┐      ┌─────────────────┐
│__middleware_│────────▶│  Auto-Detection │      │  useMiddleware  │
│   Export    │         │  & Registration │      │     API         │
└─────────────┘         └─────────────────┘      └─────────────────┘
                                │                          │
                                ▼                          ▼
                        ┌─────────────────┐      ┌─────────────────┐
                        │  Middleware     │      │  FynModule      │
                        │  Registry       │      │  Interface      │
                        │  provider::name │      │  initialize()   │
                        └─────────────────┘      │  execute()      │
                                │                └─────────────────┘
                                ▼                          │
                        ┌─────────────────┐                │
                        │  Lifecycle      │◀───────────────┘
                        │  Management     │
                        │  setup() →      │
                        │  apply() →      │
                        │  execute()      │
                        └─────────────────┘
```

This architecture provides a robust, scalable, and maintainable foundation for enterprise-scale micro frontend applications with comprehensive middleware support.
