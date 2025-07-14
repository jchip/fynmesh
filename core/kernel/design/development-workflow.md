# FynMesh Development Workflow

## Overview

This document outlines the complete development workflow for building applications with FynMesh, including FynApp development, middleware creation, template system usage, and deployment strategies. The workflow is designed to support enterprise-scale development with multiple teams and complex application architectures.

## Development Environment Setup

### Prerequisites

```bash
# Required tools
- Node.js 18+ with ESM support
- TypeScript 5.2+
- Git
- Modern browser with ES2020 support

# FynMesh-specific tools
- fyn (package manager)
- xrun (task runner)
- create-fynapp (project generator)
```

### Initial Setup

```bash
# Clone the FynMesh repository
git clone https://github.com/your-org/fynmesh.git
cd fynmesh

# Install dependencies and bootstrap
fyn install
fyn bootstrap

# Start demo server
cd demo/demo-server
fyn start
```

## FynApp Development Workflow

### 1. Creating a New FynApp

```bash
# Using create-fynapp tool
cd ~/dev/fynmesh/demo
npx create-fynapp my-new-app --framework react

# Manual creation
mkdir fynapp-my-app
cd fynapp-my-app
fyn init
```

### 2. FynApp Structure Setup

```typescript
// package.json
{
  "name": "fynapp-my-app",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "rm -rf dist && rollup -c",
    "dev": "rollup -c -w"
  },
  "devDependencies": {
    "@fynmesh/kernel": "../../core/kernel",
    "rollup-plugin-federation": "../../rollup-federation/rollup-plugin-federation",
    "create-fynapp": "../../dev-tools/create-fynapp"
  }
}
```

```typescript
// src/config.ts
export const config = {
  loadMiddlewares: true, // Enable middleware loading
};
```

```typescript
// src/main.ts
import { useMiddleware, FynModule, FynModuleRuntime } from "@fynmesh/kernel";

const appModule: FynModule = {
  initialize(runtime: FynModuleRuntime) {
    // Optional initialization logic
    return { status: "ready" };
  },

  async execute(runtime: FynModuleRuntime) {
    // Main application logic
    console.log(`🚀 ${runtime.fynApp.name} is running!`);

    // Create app container
    const container = document.createElement('div');
    container.innerHTML = `
      <div style="padding: 20px; background: #f0f0f0; border-radius: 8px;">
        <h2>${runtime.fynApp.name}</h2>
        <p>A FynMesh micro frontend application</p>
      </div>
    `;

    // Find target element and render
    const target = document.getElementById(runtime.fynApp.name);
    if (target) {
      target.appendChild(container);
    }
  },
};

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
    },
  },
  appModule,
);
```

```typescript
// rollup.config.ts
import { setupReactFederationPlugins, fynmeshShareScope } from "create-fynapp";

export default {
  input: ["fynapp-entry-dummy.js", "fynapp-entry.js"],
  output: {
    dir: "dist",
    format: "system",
    sourcemap: true,
  },
  plugins: [
    ...setupReactFederationPlugins({
      name: "fynapp-my-app",
      shareScope: fynmeshShareScope,
      filename: "fynapp-entry.js",
      exposes: {
        "./main": "./src/main.ts"
      },
    }),
  ],
};
```

### 3. Development Process

```bash
# Start development build
fyn dev

# Build for production
fyn build

# Test the FynApp
cd ../demo-server
fyn start
# Navigate to http://localhost:3000
```

## Middleware Development Workflow

### 1. Creating a Middleware Provider

```bash
# Create middleware provider FynApp
mkdir fynapp-my-middleware
cd fynapp-my-middleware
```

### 2. Middleware Implementation

```typescript
// src/middleware/my-middleware.ts
import { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

export class MyMiddleware implements FynAppMiddleware {
  public readonly name = "my-middleware";

  private configCache = new WeakMap();

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    const { fynApp, meta } = context;
    const config = this.validateConfig(meta.config);

    // Store FynApp-specific configuration
    this.configCache.set(fynApp, config);

    console.debug(`🔧 ${this.name} middleware setup for ${fynApp.name}`);
    return { status: "ready" };
  }

  async apply(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynApp, runtime } = context;
    const config = this.configCache.get(fynApp);

    // Create middleware API
    const api = this.createAPI(fynApp, config);

    // Store in middleware context
    runtime.middlewareContext.set(this.name, {
      api,
      config,
      // ... other middleware data
    });

    console.debug(`✅ ${this.name} middleware applied to ${fynApp.name}`);
  }

  private validateConfig(config: any): any {
    // Validate and provide defaults
    return {
      enabled: config?.enabled !== false,
      // ... other config options
    };
  }

  private createAPI(fynApp: any, config: any): any {
    return {
      // API methods for consumers
      doSomething: () => { /* implementation */ },
      getConfig: () => config,
    };
  }
}

// Export the middleware instance
export const __middleware__MyMiddleware = new MyMiddleware();
```

### 3. Module Exposure

```typescript
// rollup.config.ts
export default {
  plugins: [
    ...setupReactFederationPlugins({
      name: "fynapp-my-middleware",
      exposes: {
        "./main": "./src/main.ts",
        "./middleware/my-middleware": "./src/middleware/my-middleware.ts"
      }
    })
  ]
};
```

### 4. Testing Middleware

```typescript
// src/main.ts (simple test main for middleware provider)
import { useMiddleware, noOpMiddlewareUser } from "@fynmesh/kernel";

export const main = useMiddleware(
  {
    info: {
      name: "my-middleware",
      provider: "fynapp-my-middleware",
      version: "^1.0.0",
    },
    config: {
      enabled: true,
    },
  },
  noOpMiddlewareUser,
);
```

## Framework-Specific Development

### React FynApp Development

```typescript
// src/App.tsx
import React, { useState, useEffect } from 'react';
import { FynModuleRuntime } from "@fynmesh/kernel";

interface AppProps {
  runtime: FynModuleRuntime;
}

const App: React.FC<AppProps> = ({ runtime }) => {
  const [designTokens, setDesignTokens] = useState<any>(null);

  useEffect(() => {
    // Get middleware APIs
    const designTokensContext = runtime.middlewareContext.get("design-tokens");
    setDesignTokens(designTokensContext?.api);
  }, [runtime]);

  return (
    <div style={{
      padding: 'var(--fynmesh-spacing-lg)',
      background: 'var(--fynmesh-color-light)',
      borderRadius: 'var(--fynmesh-radius-md)',
    }}>
      <h2>React FynApp</h2>
      <p>Current theme: {designTokens?.getTheme()}</p>
      <button onClick={() => designTokens?.setTheme('fynmesh-dark')}>
        Switch to Dark Theme
      </button>
    </div>
  );
};

export default App;
```

```typescript
// src/main.ts
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useMiddleware, FynModule, FynModuleRuntime } from "@fynmesh/kernel";
import App from './App';

const reactModule: FynModule = {
  async execute(runtime: FynModuleRuntime) {
    const targetElement = document.getElementById(runtime.fynApp.name);
    if (targetElement) {
      const root = ReactDOM.createRoot(targetElement);
      root.render(React.createElement(App, { runtime }));
    }
  },
};

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
    },
  },
  reactModule,
);
```

### Vue FynApp Development

```vue
<!-- src/App.vue -->
<template>
  <div class="vue-app">
    <h2>Vue FynApp</h2>
    <p>Current theme: {{ currentTheme }}</p>
    <button @click="switchTheme">Switch Theme</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps(['runtime']);
const currentTheme = ref('');
let designTokens = null;

onMounted(() => {
  const designTokensContext = props.runtime.middlewareContext.get("design-tokens");
  designTokens = designTokensContext?.api;
  currentTheme.value = designTokens?.getTheme() || '';
});

const switchTheme = () => {
  const newTheme = currentTheme.value === 'fynmesh-default' ? 'fynmesh-dark' : 'fynmesh-default';
  designTokens?.setTheme(newTheme);
  currentTheme.value = newTheme;
};
</script>

<style>
.vue-app {
  padding: var(--fynmesh-spacing-lg);
  background: var(--fynmesh-color-light);
  border-radius: var(--fynmesh-radius-md);
}
</style>
```

## Demo Server Integration

### 1. Adding FynApp to Demo Server

```typescript
// demo/demo-server/scripts/build-templates.js
const templateData = {
  // ... existing data
  fynApps: [
    // ... existing apps
    {
      id: "fynapp-my-app",
      name: "My Custom App",
      framework: "React",
      color: "fynapp-custom",
      badge: "info",
    },
  ],
};
```

```css
/* demo/demo-server/templates/components/styles.html */
:root {
  /* ... existing colors */
  --fynapp-custom: #ff6b6b;
}

.bg-fynapp-custom { background-color: var(--fynapp-custom); }
.text-fynapp-custom { color: var(--fynapp-custom); }
.border-fynapp-custom { border-color: var(--fynapp-custom); }

[data-border-color="fynapp-custom"] {
  border-left-color: var(--fynapp-custom) !important;
}
```

### 2. Proxy Configuration

```typescript
// demo/demo-server/src/dev-proxy.ts
startDevProxy([
  // ... existing mappings
  [
    { path: "/fynapp-my-app" },
    { protocol: "file", path: Path.join(__dirname, "../../fynapp-my-app") },
  ],
]);
```

### 3. Loading Script Update

```html
<!-- demo/demo-server/templates/components/fynapp-loader.html -->
<script>
(async () => {
  // ... existing loading logic

  // Load your custom FynApp
  if (features["fynapp-my-app"]) {
    console.log("loading remote fynapp /fynapp-my-app/dist");
    fynMeshKernel.loadFynApp("/fynapp-my-app/dist");
  }
})();
</script>
```

## Testing Strategy

### Unit Testing

```typescript
// src/__tests__/middleware.test.ts
import { MyMiddleware } from '../middleware/my-middleware';
import { createMockCallContext } from '@fynmesh/kernel/test-utils';

describe('MyMiddleware', () => {
  let middleware: MyMiddleware;
  let mockContext: any;

  beforeEach(() => {
    middleware = new MyMiddleware();
    mockContext = createMockCallContext();
  });

  test('should setup with valid config', async () => {
    mockContext.meta.config = { enabled: true };
    const result = await middleware.setup(mockContext);
    expect(result.status).toBe('ready');
  });

  test('should apply middleware correctly', async () => {
    await middleware.setup(mockContext);
    await middleware.apply(mockContext);

    const contextData = mockContext.runtime.middlewareContext.get('my-middleware');
    expect(contextData).toBeDefined();
    expect(contextData.api).toBeDefined();
  });
});
```

### Integration Testing

```typescript
// src/__tests__/integration.test.ts
import { FynMeshKernelCore } from '@fynmesh/kernel';

describe('FynApp Integration', () => {
  let kernel: FynMeshKernelCore;

  beforeEach(() => {
    kernel = new FynMeshKernelCore();
  });

  test('should load and bootstrap FynApp', async () => {
    // Load middleware first
    await kernel.loadFynApp('/fynapp-my-middleware/dist');

    // Load consumer FynApp
    await kernel.loadFynApp('/fynapp-my-app/dist');

    // Verify middleware is available
    const fynApp = kernel.getLoadedFynApp('fynapp-my-app');
    expect(fynApp).toBeDefined();

    const middlewareContext = fynApp.middlewareContext.get('my-middleware');
    expect(middlewareContext).toBeDefined();
  });
});
```

### End-to-End Testing

```typescript
// e2e/fynapp.e2e.ts
import { test, expect } from '@playwright/test';

test('FynApp loads and displays correctly', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for FynApp to load
  await page.waitForSelector('#fynapp-my-app');

  // Verify content
  const content = await page.textContent('#fynapp-my-app h2');
  expect(content).toBe('My Custom App');

  // Test middleware functionality
  await page.click('button:has-text("Switch Theme")');

  // Verify theme change
  const updatedTheme = await page.textContent('#fynapp-my-app .theme-indicator');
  expect(updatedTheme).toContain('fynmesh-dark');
});
```

## Build and Deployment

### Development Build

```bash
# Build single FynApp
cd fynapp-my-app
fyn build

# Build all FynApps
cd ~/dev/fynmesh
fyn bootstrap

# Build demo server
cd demo/demo-server
fyn build
```

### Production Build

```bash
# Set production environment
export NODE_ENV=production

# Build everything
fyn bootstrap

# Build optimized demo server
cd demo/demo-server
fyn build
```

### Deployment Strategies

#### Static Deployment

```bash
# Build all assets
NODE_ENV=production fyn bootstrap

# Deploy to CDN/static hosting
# Each FynApp dist/ directory can be deployed independently
rsync -av fynapp-my-app/dist/ user@server:/var/www/fynapp-my-app/
rsync -av demo/demo-server/public/ user@server:/var/www/demo/
```

#### Container Deployment

```dockerfile
# Dockerfile for FynApp
FROM nginx:alpine

COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  fynapp-my-app:
    build: ./fynapp-my-app
    ports:
      - "3001:80"

  demo-server:
    build: ./demo/demo-server
    ports:
      - "3000:80"
    depends_on:
      - fynapp-my-app
```

## Development Best Practices

### Code Organization

```
fynapp-my-app/
├── src/
│   ├── components/          # Reusable components
│   ├── middleware/          # Middleware implementations
│   ├── utils/              # Utility functions
│   ├── types/              # TypeScript type definitions
│   ├── config.ts           # FynApp configuration
│   └── main.ts             # Entry point
├── __tests__/              # Test files
├── dist/                   # Build output
├── package.json
├── rollup.config.ts
└── tsconfig.json
```

### Configuration Management

```typescript
// src/config.ts
interface FynAppConfig {
  loadMiddlewares: boolean;
  development?: {
    hotReload: boolean;
    debugMode: boolean;
  };
  production?: {
    minify: boolean;
    sourceMaps: boolean;
  };
}

export const config: FynAppConfig = {
  loadMiddlewares: true,
  development: {
    hotReload: true,
    debugMode: process.env.NODE_ENV !== 'production',
  },
  production: {
    minify: true,
    sourceMaps: false,
  },
};
```

### Error Handling

```typescript
// src/utils/error-handling.ts
export class FynAppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any,
  ) {
    super(message);
    this.name = 'FynAppError';
  }
}

export const handleMiddlewareError = (error: Error, middlewareName: string) => {
  console.error(`❌ Middleware ${middlewareName} error:`, error);

  // Provide fallback functionality
  return {
    api: createFallbackAPI(),
    status: 'error',
    error: error.message,
  };
};
```

### Performance Optimization

```typescript
// src/utils/performance.ts
export const lazyLoadMiddleware = async (middlewareName: string) => {
  try {
    const start = performance.now();
    const middleware = await import(`../middleware/${middlewareName}`);
    const end = performance.now();

    console.debug(`⚡ Middleware ${middlewareName} loaded in ${end - start}ms`);
    return middleware;
  } catch (error) {
    console.warn(`⚠️ Failed to load middleware ${middlewareName}:`, error);
    return null;
  }
};

export const measureRenderTime = (componentName: string, renderFn: () => void) => {
  const start = performance.now();
  renderFn();
  const end = performance.now();

  console.debug(`🎨 ${componentName} rendered in ${end - start}ms`);
};
```

## Debugging and Development Tools

### Browser DevTools Integration

```typescript
// src/utils/devtools.ts
declare global {
  interface Window {
    __FYNMESH_DEBUG__: {
      kernel: any;
      fynApps: Map<string, any>;
      middleware: Map<string, any>;
    };
  }
}

export const setupDevTools = (runtime: FynModuleRuntime) => {
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    window.__FYNMESH_DEBUG__ = {
      kernel: runtime.kernel,
      fynApps: runtime.kernel.getLoadedFynApps(),
      middleware: runtime.middlewareContext,
    };

    console.log('🔍 FynMesh debug tools available on window.__FYNMESH_DEBUG__');
  }
};
```

### Logging Utilities

```typescript
// src/utils/logging.ts
export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`ℹ️ [${new Date().toISOString()}] ${message}`, ...args);
  },

  warn: (message: string, ...args: any[]) => {
    console.warn(`⚠️ [${new Date().toISOString()}] ${message}`, ...args);
  },

  error: (message: string, ...args: any[]) => {
    console.error(`❌ [${new Date().toISOString()}] ${message}`, ...args);
  },

  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 [${new Date().toISOString()}] ${message}`, ...args);
    }
  },
};
```

## Common Patterns and Recipes

### Shared State Management

```typescript
// middleware/shared-state.ts
export class SharedStateMiddleware implements FynAppMiddleware {
  public readonly name = "shared-state";
  private globalState = new Map<string, any>();
  private subscribers = new Map<string, Set<Function>>();

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    const api = {
      get: (key: string) => this.globalState.get(key),
      set: (key: string, value: any) => {
        this.globalState.set(key, value);
        this.notifySubscribers(key, value);
      },
      subscribe: (key: string, callback: Function) => {
        if (!this.subscribers.has(key)) {
          this.subscribers.set(key, new Set());
        }
        this.subscribers.get(key)!.add(callback);

        return () => this.subscribers.get(key)?.delete(callback);
      },
    };

    context.runtime.middlewareContext.set(this.name, { api });
    return { status: "ready" };
  }

  private notifySubscribers(key: string, value: any) {
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback(value));
    }
  }
}
```

### Cross-Framework Communication

```typescript
// utils/cross-framework-bridge.ts
export class CrossFrameworkBridge {
  private eventBus = new EventTarget();

  emit(event: string, data: any) {
    this.eventBus.dispatchEvent(
      new CustomEvent(event, { detail: data })
    );
  }

  on(event: string, handler: (data: any) => void) {
    const listener = (e: CustomEvent) => handler(e.detail);
    this.eventBus.addEventListener(event, listener);

    return () => this.eventBus.removeEventListener(event, listener);
  }

  // Framework-specific helpers
  reactHook() {
    const [state, setState] = useState<any>(null);

    useEffect(() => {
      return this.on('state-change', setState);
    }, []);

    return state;
  }

  vueComposable() {
    const state = ref(null);

    onMounted(() => {
      return this.on('state-change', (data) => {
        state.value = data;
      });
    });

    return state;
  }
}
```

## Conclusion

The FynMesh development workflow provides a comprehensive framework for building scalable micro frontend applications. With its middleware system, template-based demo environment, and extensive tooling support, developers can create sophisticated applications while maintaining clean separation of concerns and excellent developer experience.

The workflow supports both simple applications and complex enterprise scenarios, with clear patterns for testing, deployment, and maintenance. By following these guidelines, teams can build robust, maintainable micro frontend applications that scale with their business needs.
