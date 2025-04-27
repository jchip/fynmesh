# fynmesh

`fynmesh` is a microfrontend web framework built on top of the concept Module Federation and rollup.

## Overview

The framework is designed to enable a modular, scalable approach to building web applications by breaking them down into independently deployable microfrontends (fynapps). This architecture promotes:

- Independent development and deployment of frontend modules
- Shared dependencies and runtime code splitting
- Consistent development experience across teams
- Flexible composition of UI components

## Major Components

### 1. The Kernel

The kernel is the core runtime that:

- Manages the lifecycle of fynapps
- Handles module federation and loading
- Provides shared services and utilities
- Coordinates communication between fynapps

Key responsibilities:

- Loading and initializing fynapps
- Managing shared dependencies
- Providing runtime configuration
- Handling cross-fynapp communication

### 2. fynapp

A fynapp is a self-contained microfrontend that can be developed and deployed independently.

#### Development Structure

The development of a fynapp would follow the NPM package format, so a fynapp's code typically consists of the following minimum files:

```
fynapp/
├── package.json        # Dependencies and metadata
├── src/
│   ├── index.ts       # Entry point
│   ├── App.tsx        # Main application component
│   └── types.ts       # TypeScript type definitions
├── rollup.config.js   # Build configuration
└── tsconfig.json      # TypeScript configuration
```

Key characteristics:

- Independent build and deployment
- Isolated state management
- Clear boundaries and interfaces
- Shared dependency management

#### Deployment Structure

After building, a fynapp's deployment structure consists of:

```
dist/
├── manifest.json     # Fynapp metadata and configuration
├── remoteEntry.js    # Module Federation entry point
├── main.js           # Main application bundle
├── chunks/           # Code-split chunks
│   ├── vendor.js     # Third-party dependencies
│   └── *.js          # Other dynamic imports
└── assets/           # Static assets
    ├── images/
    └── styles/
```

The `manifest.json` contains essential metadata about the fynapp:

```json
{
  "name": "fynapp-name",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "exposes": {
    "./App": "./src/App",
    "./types": "./src/types"
  },
  "shared": {
    "react": { "singleton": true },
    "react-dom": { "singleton": true }
  },
  "entry": "./remoteEntry.js",
  "type": "fynapp"
}
```

Key aspects of the deployment:

1. **Manifest File**

   - Contains static metadata about the fynapp
   - Lists exposed modules and their paths
   - Specifies shared dependencies and versions
   - Enables kernel to make loading decisions without code execution
   - Helps with version compatibility checks

2. **Module Federation Format**

   - `remoteEntry.js` serves as the entry point for Module Federation
   - Exposes the fynapp's public API and shared modules
   - Defines the version and dependencies
   - Handles runtime module loading

3. **Bundle Structure**

   - Main application code is split into optimized chunks
   - Vendor dependencies are separated for better caching
   - Dynamic imports are automatically code-split
   - Assets are optimized and versioned

4. **Runtime Loading**
   - Bundles are loaded on-demand by the kernel
   - Module Federation handles dependency resolution
   - Shared dependencies are loaded from the kernel
   - Version compatibility is enforced

## Key Criteria

### 1. Module Mapping

A fynapp must provide a clear map of its modules in the manifest:

```json
{
  "modules": {
    "App": {
      "path": "./src/App",
      "bundle": "main.js",
      "version": "1.0.0",
      "type": "component"
    },
    "utils": {
      "path": "./src/utils",
      "bundle": "chunks/utils.js",
      "version": "1.0.0",
      "type": "utility"
    }
  }
}
```

This mapping enables:

- Precise module location tracking
- Version management per module
- Efficient bundle loading
- Clear module boundaries

### 2. Fynapp Dependencies

Fynapps must declare their dependencies on other fynapps:

```json
{
  "fynappDependencies": {
    "auth-fynapp": {
      "version": "^1.0.0",
      "requiredModules": ["AuthProvider", "useAuth"],
      "optionalModules": ["LoginForm"]
    },
    "ui-fynapp": {
      "version": "^2.0.0",
      "requiredModules": ["Button", "Input"],
      "optionalModules": ["Modal"]
    }
  }
}
```

This enables:

- Explicit dependency tracking
- Version compatibility checking
- Required vs optional module specification
- Clear dependency graph construction

### 3. Bundle Characteristics

Bundles must be designed for optimal loading and concatenation:

1. **Idempotency**

   - Each bundle must be self-contained
   - No side effects from multiple inclusions
   - Safe for concatenation
   - Clear initialization boundaries

2. **Bundle Structure**

   ```json
   {
     "bundles": {
       "main.js": {
         "type": "entry",
         "dependencies": ["vendor.js"],
         "modules": ["App", "Router"]
       },
       "vendor.js": {
         "type": "vendor",
         "dependencies": [],
         "modules": ["react", "react-dom"]
       }
     }
   }
   ```

3. **Concatenation Support**
   - Bundles can be safely combined
   - No global namespace pollution
   - Clear module boundaries
   - Efficient loading strategies

These criteria ensure:

- Reliable module loading
- Efficient bundle management
- Clear dependency tracking
- Optimal performance
- Safe concatenation
- Version compatibility

## Communication Flow

1. Kernel initializes and loads configuration
2. Kernel loads required fynapps based on routing/configuration
3. fynapps register themselves with the kernel
4. Inter-fynapp communication happens through kernel-mediated events
5. Shared services are accessed through kernel-provided interfaces

## Development Workflow

1. Create new fynapp using `create-fynapp`
2. Develop fynapp independently
3. Build and deploy fynapp
4. Register fynapp with kernel configuration
5. Kernel loads and manages fynapp at runtime

## Best Practices

1. Keep fynapps focused and single-purpose
2. Use shared types for inter-fynapp communication
3. Implement proper error boundaries
4. Follow consistent naming conventions
5. Document public interfaces
6. Maintain backward compatibility
7. Use proper versioning for shared dependencies
