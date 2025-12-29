# How to Create a FynApp

This guide provides complete instructions for creating a FynApp micro frontend. All code examples are complete and copy-paste ready.

## Prerequisites

- Working in the `fynmesh` monorepo
- Node.js installed
- `fyn` package manager available

## Step-by-Step Checklist

1. [ ] Create FynApp directory under `demo/`
2. [ ] Create `package.json`
3. [ ] Create `tsconfig.json`
4. [ ] Create `rollup.config.mjs`
5. [ ] Create `src/main.ts` (FynUnit entry)
6. [ ] Create `src/App.tsx` (React component)
7. [ ] Create `src/styles.css`
8. [ ] Register in demo-server (fynapp-loader.html AND dev-proxy.ts)
9. [ ] Build and test

---

## Complete File Contents

### 1. Create Directory

```bash
mkdir -p demo/my-fynapp/src
cd demo/my-fynapp
```

### 2. package.json

Create `demo/my-fynapp/package.json`:

```json
{
  "name": "my-fynapp",
  "version": "1.0.0",
  "description": "My FynApp micro frontend",
  "type": "module",
  "main": "dist/fynapp-entry.js",
  "exports": {
    ".": "./dist/fynapp-entry.js"
  },
  "scripts": {
    "build": "rm -rf dist && rollup -c",
    "dev": "rollup -c -w"
  },
  "dependencies": {
    "tslib": "^2.8.1"
  },
  "devDependencies": {
    "@fynmesh/kernel": "^1.0.0",
    "@rollup/plugin-node-resolve": "^15.2.3",
    "@rollup/plugin-typescript": "^11.1.6",
    "@types/node": "^20.8.9",
    "@types/react": "^19.1.4",
    "@types/react-dom": "^19.1.5",
    "create-fynapp": "^1.0.0",
    "esm-react": "^19.1.0",
    "esm-react-dom": "^19.1.0",
    "postcss": "^8.5.3",
    "rollup": "^4.9.1",
    "rollup-plugin-postcss": "^4.0.2",
    "rollup-plugin-federation": "^1.0.0",
    "rollup-wrap-plugin": "^1.0.0",
    "typescript": "^5.2.2"
  }
}
```

### 3. tsconfig.json

Create `demo/my-fynapp/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist/types",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Note**: Use `"jsx": "react"` (classic mode) instead of `"jsx": "react-jsx"` because the `esm-react` package doesn't export `/jsx-runtime`.

### 4. rollup.config.mjs

Create `demo/my-fynapp/rollup.config.mjs`:

```javascript
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import postcss from "rollup-plugin-postcss";
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
      newRollupPlugin(postcss)({
        inject: true,
        extract: false,
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

### 5. src/main.ts

Create `demo/my-fynapp/src/main.ts`:

```typescript
import { useMiddleware } from "@fynmesh/kernel";
import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import React from "react";
import ReactDOMClient from "react-dom/client";
import App from "./App";

// Inline result types to avoid fynapp-shell-mw dependency
interface SelfManagedResult {
  type: "self-managed";
  target: HTMLElement;
  cleanup?: () => void;
  metadata?: Record<string, unknown>;
}

interface ComponentFactoryResult {
  type: "component-factory";
  componentFactory: (React: unknown) => { component: unknown; props: unknown };
  metadata?: Record<string, unknown>;
}

/**
 * FynUnit implementation for my-fynapp
 */
class MyFynappUnit implements FynUnit {
  private root?: ReturnType<typeof ReactDOMClient.createRoot>;

  /**
   * Initialize - called first to determine readiness
   */
  initialize(runtime: FynUnitRuntime) {
    console.debug(`📋 ${runtime.fynApp.name} initialize called`);
    return {
      status: "ready" as const,
      mode: "standalone" as const,
    };
  }

  /**
   * Execute - called when middleware is ready, renders the app
   */
  async execute(
    runtime: FynUnitRuntime
  ): Promise<SelfManagedResult | ComponentFactoryResult> {
    console.debug(`🚀 ${runtime.fynApp.name} executing`);

    // Check if shell middleware is managing this execution
    const shellMiddleware = runtime.middlewareContext.get("shell-layout");
    const isShellManaged = shellMiddleware?.isShellManaged;

    if (isShellManaged) {
      // Shell-managed mode: return a component factory
      console.debug(
        `🎭 ${runtime.fynApp.name} returning component factory for shell`
      );

      return {
        type: "component-factory",
        componentFactory: (React: any) => ({
          component: (props: any) =>
            React.createElement(App, {
              appName: runtime.fynApp.name,
              runtime,
              ...props,
            }),
          props: {},
        }),
        metadata: {
          framework: "react",
          version: React.version,
          capabilities: ["component"],
        },
      };
    }

    // Standalone mode: render directly
    console.debug(`🚀 ${runtime.fynApp.name} rendering in standalone mode`);

    // Find or create target element
    let targetElement = document.getElementById("my-fynapp");
    if (!targetElement) {
      targetElement = document.createElement("div");
      targetElement.id = "my-fynapp";
      document.body.appendChild(targetElement);
    }

    // Create React root and render
    this.root = ReactDOMClient.createRoot(targetElement);
    this.root.render(
      React.createElement(App, {
        appName: runtime.fynApp.name,
        runtime,
      })
    );

    return {
      type: "self-managed",
      target: targetElement,
      cleanup: () => this.shutdown(),
      metadata: {
        framework: "react",
        version: React.version,
        capabilities: ["self-managed"],
      },
    };
  }

  /**
   * Shutdown - cleanup when FynApp is unloaded
   */
  shutdown(): void {
    console.debug(`🛑 my-fynapp shutting down`);
    this.root?.unmount();
    this.root = undefined;
  }
}

// Export the main entry point
// Middleware is optional - use an empty array if not needed
export const main = useMiddleware([], new MyFynappUnit());
```

### 6. src/App.tsx

Create `demo/my-fynapp/src/App.tsx`:

```tsx
import React, { useState } from "react";
import type { FynUnitRuntime } from "@fynmesh/kernel";
import "./styles.css";

interface AppProps {
  appName: string;
  runtime?: FynUnitRuntime;
}

const App: React.FC<AppProps> = ({ appName, runtime }) => {
  const [count, setCount] = useState(0);

  return (
    <div className="fynapp-container">
      <h2 className="fynapp-title">
        {appName} - React {React.version}
      </h2>

      <div className="fynapp-content">
        <p>Welcome to your new FynApp!</p>

        <div className="counter-section">
          <p>
            Count: <strong>{count}</strong>
          </p>
          <button
            className="fynapp-button"
            onClick={() => setCount((c) => c + 1)}
          >
            Increment
          </button>
        </div>

        {runtime && (
          <div className="runtime-info">
            <p>
              <small>
                Running as: {runtime.fynApp.name} v{runtime.fynApp.version}
              </small>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
```

### 7. src/styles.css

Create `demo/my-fynapp/src/styles.css`:

```css
.fynapp-container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  padding: 1.5rem;
  max-width: 600px;
  margin: 0 auto;
}

.fynapp-title {
  color: #333;
  margin-bottom: 1rem;
  font-size: 1.5rem;
}

.fynapp-content {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 1.5rem;
}

.counter-section {
  margin-top: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 4px;
  text-align: center;
}

.fynapp-button {
  background: #0066cc;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  margin-top: 0.5rem;
}

.fynapp-button:hover {
  background: #0052a3;
}

.runtime-info {
  margin-top: 1rem;
  color: #666;
  text-align: center;
}
```

---

## Register in Demo Server

### 8. Update demo-server fynapp-loader.html

Add your FynApp to the features list. Edit `demo/demo-server/templates/components/fynapp-loader.html`:

Find the `features` object and add your FynApp:

```javascript
const features = {
    "fynapp-2-react18": "lazy",
    "fynapp-1": true,
    "fynapp-1-b": true,
    // ... other apps ...
    "my-fynapp": true,  // <-- Add this line
};
```

**Options:**
- `true` - Load eagerly on page load
- `"lazy"` - Deferred loading with UI button
- `false` or omit - Don't load

The kernel's registry resolver automatically finds FynApps at `demo/{name}/dist/` based on the name.

### 8b. Update demo-server dev-proxy.ts

Add your FynApp path mapping to `demo/demo-server/src/dev-proxy.ts`:

Find the array passed to `startDevProxy()` and add your FynApp:

```typescript
  [
    { path: "/my-fynapp" },
    { protocol: "file", path: Path.join(__dirname, "../../my-fynapp") },
  ],
```

This step is required for the dev server to know where to find your FynApp's files.

---

## Build and Test

### 9. Build

From the fynmesh repo root:

```bash
# Install dependencies and build all
fyn bootstrap

# Or build just your FynApp
cd demo/my-fynapp
fyn install
fyn build
```

### Expected Build Output

After building, you should see:
```
demo/my-fynapp/dist/
├── fynapp-entry.js        # Main entry point
├── fynapp-entry.js.map    # Source map
├── fynapp.manifest.json   # Federation manifest
└── main-[hash].js         # Exposed module chunk
```

### 10. Test

```bash
# From repo root
fyn start
```

Navigate to:
- `http://localhost:3000/demo.html` - Full demo with all FynApps
- `http://localhost:3000/shell.html` - Shell middleware demo

---

## Key Concepts

### FynUnit Lifecycle

| Method | When Called | Returns |
|--------|-------------|---------|
| `initialize(runtime)` | First, before middleware setup | `{ status, mode, deferOk? }` |
| `execute(runtime)` | After middleware ready | `SelfManagedResult` or `ComponentFactoryResult` |
| `shutdown()` | When FynApp unloads | `void` |

### Result Types

**SelfManagedResult** - FynApp renders itself:
```typescript
{ type: "self-managed", target: HTMLElement, cleanup?: () => void }
```

**ComponentFactoryResult** - Shell renders the FynApp:
```typescript
{ type: "component-factory", componentFactory: (React) => ({ component, props }) }
```

**NoRenderResult** - Cannot render:
```typescript
{ type: "no-render", message: string }
```

### Initialize Modes

- `standalone` - FynApp manages its own rendering
- `provider` - FynApp provides shared state/services to others
- `consumer` - FynApp consumes shared state from a provider

---

## Adding Middleware

To use middleware (e.g., design tokens, shared counter):

```typescript
export const main = useMiddleware(
  [
    {
      // @ts-ignore - TS can't understand module federation imports
      middleware: import(
        "fynapp-design-tokens/middleware/design-tokens/design-tokens",
        { with: { type: "fynapp-middleware" } }
      ),
      config: {
        theme: "fynmesh-default",
        cssCustomProperties: true,
      },
    },
  ],
  new MyFynappUnit()
);
```

Access middleware in execute:
```typescript
async execute(runtime: FynUnitRuntime) {
  const designTokens = runtime.middlewareContext.get("design-tokens");
  if (designTokens?.api) {
    designTokens.api.setTheme("fynmesh-dark");
  }
  // ... rest of execute
}
```

---

## CSS Support

CSS support via PostCSS is already included in the base configuration. The setup includes:

- `postcss` and `rollup-plugin-postcss` in package.json devDependencies
- PostCSS plugin configured in rollup.config.mjs with `inject: true`

Simply import your CSS files in your components:
```typescript
import "./styles.css";
```

---

## Troubleshooting

### Build fails with "Cannot find module"

Run `fyn install` in your FynApp directory.

### FynApp not loading in browser

1. Check browser console for errors
2. Verify `dist/fynapp-entry.js` exists
3. Check the FynApp is added to `features` object in `demo/demo-server/templates/components/fynapp-loader.html`
4. Verify the FynApp directory name matches the name in `features`
5. Rebuild demo-server: `cd demo/demo-server && fyn build`

### Middleware not available

1. Use `deferOk: true` in initialize return
2. Ensure the provider FynApp loads before consumers
3. Check middleware import path matches the expose path in the provider

### TypeScript errors with middleware imports

Add `// @ts-ignore` above the import - TypeScript doesn't understand module federation dynamic imports with import attributes.

---

## Quick Reference

### Helper APIs from create-fynapp

| API | Purpose |
|-----|---------|
| `setupFynAppOutputConfig()` | Standard output: dist/, systemjs, sourcemaps |
| `setupDummyEntryPlugins()` | Virtual entry required by federation |
| `setupReactAliasPlugins()` | Maps react → esm-react |
| `setupReactFederationPlugins(config)` | React federation with manifest |
| `setupFederationPlugins(config)` | Generic federation (Vue, etc.) |
| `setupMinifyPlugins()` | Terser for production |
| `fynappDummyEntryName` | Constant for input array |
| `fynappEntryFilename` | Constant for input array |
| `env` | Current NODE_ENV |

### Debug Logging

```bash
DEBUG=create-fynapp fyn build
```
