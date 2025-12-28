# How to Create a FynApp

This guide walks you through creating a FynApp micro frontend from scratch.

## Quick Start

The fastest way to create a FynApp:

```bash
# From the fynmesh repo root
create-fynapp --name my-fynapp --framework react
```

Or manually create the following structure:

```
my-fynapp/
├── package.json
├── rollup.config.mjs
├── tsconfig.json
└── src/
    ├── main.ts      # FynUnit entry point
    ├── App.tsx      # React component
    └── styles.css
```

## Project Structure

### package.json

```json
{
  "name": "my-fynapp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/fynapp-entry.js",
  "scripts": {
    "build": "rm -rf dist && rollup -c",
    "dev": "rollup -c -w"
  },
  "devDependencies": {
    "@fynmesh/kernel": "^1.0.0",
    "@rollup/plugin-node-resolve": "^15.2.3",
    "@rollup/plugin-typescript": "^11.1.6",
    "create-fynapp": "^1.0.0",
    "esm-react": "^19.1.0",
    "esm-react-dom": "^19.1.0",
    "fynapp-shell-mw": "^1.0.0",
    "rollup": "^4.9.1",
    "rollup-plugin-federation": "^1.0.0",
    "rollup-wrap-plugin": "^1.0.0",
    "typescript": "^5.2.2"
  }
}
```

### rollup.config.mjs

Use the `create-fynapp` helper APIs for consistent configuration:

```javascript
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { newRollupPlugin } from "rollup-wrap-plugin";
import {
  env,
  setupFynAppOutputConfig,
  fynappDummyEntryName,
  fynappEntryFilename,
  setupDummyEntryPlugins,
  setupReactAliasPlugins,
  setupMinifyPlugins,
  setupReactFederationPlugins,
} from "create-fynapp";
import { defineConfig } from "rollup";

export default [
  defineConfig({
    input: [fynappDummyEntryName, fynappEntryFilename],
    ...setupFynAppOutputConfig(),
    external: ["esm-react", "esm-react-dom"],
    plugins: [
      ...setupDummyEntryPlugins(),
      newRollupPlugin(resolve)({
        exportConditions: [env],
      }),
      ...setupReactFederationPlugins({
        name: "my-fynapp",
        exposes: {
          "./main": "./src/main.ts",
        },
        shared: {},
      }),
      ...setupReactAliasPlugins(),
      newRollupPlugin(typescript)({
        tsconfig: "./tsconfig.json",
        sourceMap: true,
        inlineSources: true,
      }),
      ...setupMinifyPlugins(),
    ],
  }),
];
```

### Helper APIs

| Helper | Purpose |
|--------|---------|
| `setupFynAppOutputConfig()` | Standard output config (dist/, systemjs, sourcemaps) |
| `setupDummyEntryPlugins()` | Virtual entry for federation |
| `setupReactAliasPlugins()` | Alias react to esm-react |
| `setupReactFederationPlugins()` | React-specific federation with manifest generation |
| `setupFederationPlugins()` | Generic federation (for Vue, etc.) |
| `setupMinifyPlugins()` | Terser for production builds |

## FynUnit Lifecycle

Every FynApp exports a `main` that wraps a FynUnit with middleware support:

### src/main.ts

```typescript
import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import type { SelfManagedResult, ComponentFactoryResult } from "fynapp-shell-mw/middleware/shell-layout";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

class MyFynAppUnit implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  /**
   * Called first - return readiness status
   */
  initialize(runtime: FynUnitRuntime) {
    return {
      status: "ready" as const,
      mode: "standalone" as const,  // or "provider" / "consumer"
    };
  }

  /**
   * Called when middleware is ready - render the app
   */
  async execute(runtime: FynUnitRuntime): Promise<SelfManagedResult | ComponentFactoryResult> {
    // Check if shell is managing us
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;

    if (isShellManaged) {
      // Return component factory for shell to render
      return {
        type: "component-factory",
        componentFactory: (React) => ({
          component: (props) => React.createElement(App, { ...props, runtime }),
          props: {},
        }),
        metadata: { framework: "react", version: React.version },
      };
    }

    // Standalone: render ourselves
    const target = document.getElementById("my-fynapp") || document.createElement("div");
    this.root = ReactDOMClient.createRoot(target);
    this.root.render(React.createElement(App, { runtime }));

    return {
      type: "self-managed",
      target,
      cleanup: () => this.shutdown(),
    };
  }

  /**
   * Called when FynApp is unloaded
   */
  shutdown(): void {
    this.root?.unmount();
    this.root = undefined;
  }
}

export const main = useMiddleware([], new MyFynAppUnit());
```

### Lifecycle Methods

| Method | When Called | Purpose |
|--------|-------------|---------|
| `initialize(runtime)` | First, before middleware | Report readiness and mode |
| `execute(runtime)` | After middleware ready | Render the app |
| `shutdown()` | When FynApp unloads | Cleanup resources |

### Initialize Return Values

```typescript
{
  status: "ready" | "waiting" | "error",
  mode: "standalone" | "provider" | "consumer",
  deferOk?: boolean,  // Can we continue if middleware isn't ready?
}
```

## Result Types

### SelfManagedResult

Use when your FynApp renders itself (standalone mode):

```typescript
{
  type: "self-managed",
  target: HTMLElement,
  cleanup?: () => void,
  metadata?: { framework: string, version: string }
}
```

### ComponentFactoryResult

Use when shell middleware manages rendering:

```typescript
{
  type: "component-factory",
  componentFactory: (React) => ({
    component: YourComponent,
    props: {}
  }),
  metadata?: { framework: string, version: string }
}
```

### NoRenderResult

Use when rendering isn't possible:

```typescript
{
  type: "no-render",
  message: "Target element not found",
  metadata?: { framework: string, version: string }
}
```

## Middleware Usage

### Using Middleware

```typescript
export const main = useMiddleware(
  [
    {
      middleware: import('fynapp-design-tokens/middleware/design-tokens/design-tokens',
        { with: { type: "fynapp-middleware" } }),
      config: { theme: "fynmesh-default" },
    },
    {
      middleware: import('fynapp-react-middleware/main/basic-counter',
        { with: { type: "fynapp-middleware" } }),
      config: { share: true },
    },
  ],
  new MyFynAppUnit()
);
```

### Accessing Middleware in Execute

```typescript
async execute(runtime: FynUnitRuntime) {
  // Get middleware APIs
  const designTokens = runtime.middlewareContext.get("design-tokens");
  const counter = runtime.middlewareContext.get("basic-counter");

  // Use them
  if (designTokens?.api) {
    designTokens.api.setTheme("fynmesh-dark");
  }
}
```

### Provider vs Consumer

- **Provider**: Supplies shared state/functionality to other FynApps
- **Consumer**: Uses shared state from a provider

```typescript
// Provider FynApp
initialize(runtime) {
  return { status: "ready", mode: "provider" };
}

// Consumer FynApp
initialize(runtime) {
  return { status: "ready", mode: "consumer", deferOk: true };
}
```

## Building & Testing

### Build Commands

```bash
# Development build with watch
fyn dev

# Production build
NODE_ENV=production fyn build
```

### Debug Logging

Enable verbose logging during builds:

```bash
DEBUG=create-fynapp fyn build
```

### Testing in Demo Server

1. Add your FynApp to `demo/`
2. Update `demo/demo-server/src/fynapps.ts` to include it
3. Run `fyn bootstrap` to build all
4. Run `fyn start` and navigate to `http://localhost:3000/demo.html`

## Common Patterns

### Exposing Multiple Modules

```javascript
setupReactFederationPlugins({
  name: "my-fynapp",
  exposes: {
    "./main": "./src/main.ts",
    "./components": "./src/components/index.ts",
    "./hooks": "./src/hooks/index.ts",
  },
})
```

### Consuming Shared Dependencies

```javascript
setupReactFederationPlugins({
  name: "my-fynapp",
  exposes: { "./main": "./src/main.ts" },
  shared: {
    "esm-react": { import: false, semver: "^19.0.0" },
    "esm-react-dom": { import: false, semver: "^19.0.0" },
  },
})
```

### Adding CSS Support

```javascript
import postcss from "rollup-plugin-postcss";

plugins: [
  ...setupDummyEntryPlugins(),
  newRollupPlugin(postcss)({ inject: true }),
  // ... rest of plugins
]
```

## Troubleshooting

### "Cannot find module '@fynmesh/kernel'"

Make sure you have the kernel as a dev dependency and run `fyn install`.

### FynApp not loading

1. Check the browser console for errors
2. Verify `fynapp-entry.js` exists in `dist/`
3. Ensure the FynApp is registered in the demo server

### Middleware not available

1. Middleware loads asynchronously - use `deferOk: true` in initialize
2. Check the provider FynApp is loaded first
3. Verify the middleware import path is correct
