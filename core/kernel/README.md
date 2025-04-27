# fynmesh Kernel

A simple kernel implementation for the fynmesh microfrontend framework.

## Overview

This is a minimal implementation of the kernel that can:

1. Load a simple fynapp distribution
2. Enable the fynapp to bootstrap
3. Allow the fynapp to register itself with the kernel

## Installation

```bash
npm install @fynmesh/kernel
```

## Usage

```typescript
import { Kernel } from "@fynmesh/kernel";

// Create a new kernel instance
const kernel = new Kernel({
  baseUrl: "https://example.com/fynapps/",
  debug: true,
});

// Load a fynapp
await kernel.loadFynapp("example-fynapp");

// Get a module from the fynapp
const module = await kernel.getModule("example-fynapp", "./App");
```

## Fynapp Structure

A fynapp should have the following structure:

```
example-fynapp/
├── manifest.json     # Fynapp metadata
└── remoteEntry.js    # Module Federation entry point
```

The `manifest.json` should contain:

```json
{
  "name": "example-fynapp",
  "version": "1.0.0",
  "entry": "remoteEntry.js",
  "type": "fynapp"
}
```

## Fynapp Bootstrap

Each fynapp should expose a `./bootstrap` module that exports a default function:

```typescript
// bootstrap.ts
export default async function bootstrap(kernel: any) {
  // Initialize the fynapp
  console.log("Fynapp bootstrapped");

  // Register components, services, etc.
}
```

## API Reference

### Kernel

The main class for the fynmesh kernel.

#### Constructor

```typescript
new Kernel(config?: KernelConfig)
```

#### Methods

- `loadFynapp(name: string)`: Load a fynapp by name
- `getModule(fynappName: string, moduleName: string)`: Get a module from a fynapp
- `getRegistry()`: Get the fynapp registry

### FynappRegistry

Registry for fynapps.

#### Methods

- `register(name: string, container: FynappContainer)`: Register a fynapp container
- `get(name: string)`: Get a fynapp container by name
- `has(name: string)`: Check if a fynapp is registered

## Next Steps

This is a minimal implementation. Future enhancements will include:

1. Integration with federation-js for proper module loading
2. Support for shared dependencies
3. Communication between fynapps
4. Error handling and recovery
5. Hot module replacement

## License

UNLICENSED
