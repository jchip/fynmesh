# Routing Architecture - Design Document

**Status:** Proposed
**Date:** 2025-11-01
**Philosophy:** Kernel stays out of routing - routing is app-level concern

## Core Principle

**Routing is NOT a kernel responsibility.** The kernel provides minimal primitives only where absolutely necessary (preloading optimization, SSR serialization). All routing logic lives in the shell/host application or dedicated routing FynApps.

## Why Zero-Kernel Routing?

1. **Separation of concerns** - Routing is application orchestration, not module federation
2. **Framework freedom** - Apps can use React Router, Tanstack Router, Vue Router, etc.
3. **Simplicity** - Kernel stays focused on module loading and middleware coordination
4. **SSR flexibility** - Server-side routing handled by framework of choice (Next.js, Remix, SvelteKit)
5. **No lock-in** - Different apps can use different routing strategies

---

## Three-Layer Architecture

### Layer 1: Shell/Host Application (Owns Routing)

The shell application is responsible for all routing concerns:

- **Route definition** - Define application routes using any router library
- **Route matching** - Match URLs to components/views
- **Navigation** - Handle browser history, back/forward buttons
- **FynApp orchestration** - Load/unload FynApps based on current route
- **SSR** - Server-side rendering of routes

**Example with React Router:**

```typescript
// shell-app/src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { kernel } from './kernel';

// Route configuration for build-time analysis
export const ROUTE_CONFIG = {
  '/': ['fynapp-home'],
  '/dashboard': ['fynapp-charts', 'fynapp-data-grid'],
  '/admin': ['fynapp-admin-panel', 'fynapp-users-table'],
  '/profile': ['fynapp-user-card', 'fynapp-settings']
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  );
}

// Route components orchestrate FynApp loading
function Dashboard() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    // Load FynApps needed for this route
    kernel.loadFynAppsByName([
      { name: 'fynapp-charts' },
      { name: 'fynapp-data-grid' }
    ]).then(() => setReady(true));
  }, []);

  if (!ready) return <LoadingSpinner />;

  return (
    <div>
      <div id="charts-container" />
      <div id="data-grid-container" />
    </div>
  );
}
```

**Example with Tanstack Router:**

```typescript
// shell-app/src/router.tsx
import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router';
import { kernel } from './kernel';

const rootRoute = createRootRoute();

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  loader: async () => {
    // Preload FynApps during route transition
    await kernel.loadFynAppsByName([
      { name: 'fynapp-charts' },
      { name: 'fynapp-data-grid' }
    ]);
  },
  component: Dashboard
});

const router = createRouter({
  routeTree: rootRoute.addChildren([dashboardRoute])
});
```

---

### Layer 2: FynApp Route Metadata (Optional)

FynApps can declare route hints in their manifests for build-time optimization:

**Manifest Extension:**

```json
{
  "name": "fynapp-charts",
  "version": "1.0.0",
  "route-hints": {
    "patterns": ["/dashboard", "/reports/*", "/analytics/:id"],
    "priority": "high",
    "preload-strategy": "onIdle"
  }
}
```

**Route Hints Specification:**

- `patterns` - Array of route patterns this FynApp is commonly used on
- `priority` - Preload priority: `high`, `medium`, `low`
- `preload-strategy` - When to preload: `immediate`, `onIdle`, `onHover`, `onVisible`

**Important:** These hints are **informational only**. The kernel does NOT interpret them at runtime. They're consumed by build-time analysis tools.

---

### Layer 3: Preloading Integration (Build-Time)

Build-time analyzer generates preload directives based on shell route config:

**CLI Tool:**

```bash
# Analyze shell app's route config
fyn analyze-routes --config shell-app/route-config.ts --output dist/preload.html
```

**Analyzer reads shell's ROUTE_CONFIG:**

```typescript
// shell-app/route-config.ts
export const ROUTE_CONFIG = {
  '/': ['fynapp-home'],
  '/dashboard': ['fynapp-charts', 'fynapp-data-grid'],
  '/admin': ['fynapp-admin-panel']
};
```

**Generates route-specific preload tags:**

```html
<!-- For route: /dashboard -->
<link rel="modulepreload" href="/fynapp-charts/dist/fynapp-entry.js">
<link rel="modulepreload" href="/fynapp-data-grid/dist/fynapp-entry.js">
<link rel="modulepreload" href="/fynapp-react-middleware/dist/fynapp-entry.js">
```

**SSR Integration:**

```typescript
// server.tsx
import { ROUTE_CONFIG } from './route-config';
import { generatePreloadTags } from 'fynmesh-analyzer';

app.get('/dashboard', async (req, res) => {
  const fynApps = ROUTE_CONFIG['/dashboard'];
  const preloadTags = await generatePreloadTags(fynApps);

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        ${preloadTags}
      </head>
      <body>
        <div id="root">${renderApp()}</div>
      </body>
    </html>
  `);
});
```

---

## Use Case Solutions

### 1. Single-Page App Navigation

**Solution:** Shell app uses standard router library

- React Router, Tanstack Router, Vue Router, etc.
- Kernel not involved
- FynApps render into DOM containers managed by routes

```typescript
// Shell handles all SPA navigation
<Routes>
  <Route path="/page1" element={<Page1 />} />
  <Route path="/page2" element={<Page2 />} />
</Routes>
```

---

### 2. Cross-FynApp Orchestration

**Solution:** Route components orchestrate FynApp loading

```typescript
function DashboardRoute() {
  React.useEffect(() => {
    // Load multiple FynApps for this route
    kernel.loadFynAppsByName([
      { name: 'fynapp-charts' },
      { name: 'fynapp-data-grid' },
      { name: 'fynapp-filters' }
    ]);
  }, []);

  return (
    <DashboardLayout>
      <div id="filters-slot" />
      <div id="charts-slot" />
      <div id="grid-slot" />
    </DashboardLayout>
  );
}
```

---

### 3. Deep Linking & Sharing

**Solution:** Shell app router captures full state in URL

```typescript
// URL encodes full application state
// /dashboard?chart=sales&dateRange=2024-Q1&gridPage=3

function Dashboard() {
  const [searchParams] = useSearchParams();
  const chartType = searchParams.get('chart');
  const dateRange = searchParams.get('dateRange');
  const gridPage = searchParams.get('gridPage');

  React.useEffect(() => {
    kernel.loadFynAppsByName([...]).then(() => {
      // Pass URL params to FynApps via shared state or events
      kernel.emitAsync(new CustomEvent('ROUTE_STATE', {
        detail: { chartType, dateRange, gridPage }
      }));
    });
  }, [chartType, dateRange, gridPage]);
}
```

---

### 4. Preloading Optimization

**Solution:** Build-time analyzer + route hints

**Step 1:** Shell exports route config
```typescript
export const ROUTE_CONFIG = {
  '/dashboard': ['fynapp-charts', 'fynapp-grid']
};
```

**Step 2:** Build tool generates preload directives
```bash
fyn analyze-routes --config route-config.ts
```

**Step 3:** Inject into HTML at build or runtime (SSR)
```html
<link rel="modulepreload" href="/fynapp-charts/dist/fynapp-entry.js">
```

See `route-based-preloading.md` for detailed preloading strategies.

---

### 5. Server-Side Routing & Rendering

**Solution:** Framework-native SSR with kernel serialization

**Next.js Example:**

```typescript
// pages/dashboard.tsx
import { kernel } from '../kernel';

export async function getServerSideProps() {
  // Server-side: prepare kernel runtime
  const serverKernel = createServerKernel();
  await serverKernel.loadFynAppsByName([
    { name: 'fynapp-charts' }
  ]);

  // Serialize kernel state for hydration
  return {
    props: {
      kernelState: serverKernel.serializeState()
    }
  };
}

export default function Dashboard({ kernelState }) {
  React.useEffect(() => {
    // Client-side: hydrate kernel state
    kernel.hydrateState(kernelState);
  }, []);

  return <div id="dashboard" />;
}
```

**Remix Example:**

```typescript
// routes/dashboard.tsx
import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

export async function loader() {
  const kernel = createServerKernel();
  await kernel.loadFynAppsByName([{ name: 'fynapp-charts' }]);

  return json({
    kernelState: kernel.serializeState()
  });
}

export default function Dashboard() {
  const { kernelState } = useLoaderData();

  React.useEffect(() => {
    kernel.hydrateState(kernelState);
  }, []);

  return <div id="dashboard" />;
}
```

---

## What Kernel DOES Provide

### Minimal APIs for App Orchestration

The kernel provides only essential primitives:

#### 1. FynApp Loading (already exists)

```typescript
kernel.loadFynAppsByName([
  { name: 'fynapp-charts', range: '^1.0.0' }
])
```

#### 2. Optional Event Bus for Analytics

```typescript
// Shell app can emit route change events
kernel.events.on('ROUTE_CHANGE', (event: CustomEvent) => {
  const { from, to } = event.detail;
  analytics.track('navigation', { from, to });
});

// Shell app triggers events
function navigateTo(path: string) {
  kernel.emitAsync(new CustomEvent('ROUTE_CHANGE', {
    detail: { from: location.pathname, to: path }
  }));
  navigate(path);
}
```

#### 3. SSR Serialization Helpers

```typescript
// Server-side
const state = kernel.serializeState();

// Client-side
kernel.hydrateState(state);
```

---

## What Kernel Does NOT Provide

The kernel explicitly does **NOT** provide:

- ❌ Route definition APIs
- ❌ Route matching logic
- ❌ Navigation APIs
- ❌ History management
- ❌ Route guards/middleware
- ❌ Nested routing
- ❌ Route transitions/animations
- ❌ Runtime route→FynApp mapping

These are **all application concerns** handled by the shell app's router.

---

## Build-Time Tools

### `fyn analyze-routes` CLI

Analyze shell app's route configuration and generate preload directives:

```bash
# Generate preload tags for all routes
fyn analyze-routes --config shell-app/route-config.ts

# Generate route-specific HTML files
fyn analyze-routes --config route-config.ts --output-dir dist/routes

# Output JSON manifest for programmatic use
fyn analyze-routes --config route-config.ts --format json
```

**Implementation:**

```typescript
// Reuses existing ManifestResolver
import { ManifestResolver } from 'fynmesh-kernel';

class RouteAnalyzer {
  async analyzeRoutes(config: RouteConfig) {
    const resolver = new ManifestResolver();
    const results: Record<string, string[]> = {};

    for (const [route, fynApps] of Object.entries(config)) {
      // Build dependency graph for this route's FynApps
      const graph = await resolver.buildGraph(
        fynApps.map(name => ({ name }))
      );

      const batches = resolver.topoBatches(graph);
      const allMeta = resolver.getAllNodeMeta();

      // Extract entry file URLs
      const preloadUrls: string[] = [];
      for (const batch of batches) {
        for (const key of batch) {
          const meta = allMeta.get(key)!;
          preloadUrls.push(`${meta.distBase}fynapp-entry.js`);
        }
      }

      results[route] = preloadUrls;
    }

    return results;
  }

  generateHtml(routeUrls: Record<string, string[]>): Record<string, string> {
    const htmlFiles: Record<string, string> = {};

    for (const [route, urls] of Object.entries(routeUrls)) {
      const tags = urls.map(url =>
        `<link rel="modulepreload" href="${url}" as="script">`
      ).join('\n');

      htmlFiles[route] = tags;
    }

    return htmlFiles;
  }
}
```

---

## Manifest Route Hints Specification

FynApps can optionally declare route hints in `fynapp.manifest.json`:

```json
{
  "name": "fynapp-charts",
  "version": "1.0.0",
  "route-hints": {
    "patterns": ["/dashboard", "/reports/*", "/analytics/:id"],
    "priority": "high",
    "preload-strategy": "onIdle",
    "tags": ["analytics", "visualization"]
  }
}
```

### Fields

- **`patterns`** (string[]) - Route patterns where this FynApp is commonly used
  - Supports wildcards: `/admin/*`
  - Supports params: `/user/:id`
  - Used by analyzer to suggest FynApps for routes

- **`priority`** (string) - Preload priority
  - `high` - Critical for initial render, preload immediately
  - `medium` - Important but not critical, preload on idle
  - `low` - Nice to have, preload on demand

- **`preload-strategy`** (string) - When to trigger preload
  - `immediate` - Preload as soon as possible
  - `onIdle` - Preload during browser idle time
  - `onHover` - Preload when user hovers over navigation link
  - `onVisible` - Preload when navigation link enters viewport

- **`tags`** (string[]) - Semantic tags for discovery
  - Help identify related FynApps
  - Used by analyzer for recommendations

### Usage in Analysis

```typescript
// Analyzer can suggest FynApps based on route hints
const suggestions = analyzer.suggestFynApps('/dashboard');
// Returns: FynApps with route-hints.patterns matching "/dashboard"
```

---

## Shell App Patterns

### Pattern 1: Route-Based Lazy Loading

Load FynApps only when route is accessed:

```typescript
function Dashboard() {
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    kernel.loadFynAppsByName([
      { name: 'fynapp-charts' }
    ]).then(() => setLoaded(true));
  }, []);

  if (!loaded) return <Skeleton />;
  return <div id="charts" />;
}
```

### Pattern 2: Preload on Hover

Preload FynApps when user hovers over navigation link:

```typescript
function NavLink({ to, fynApps, children }) {
  const handleMouseEnter = () => {
    // Preload in background
    kernel.loadFynAppsByName(
      fynApps.map(name => ({ name }))
    );
  };

  return (
    <Link to={to} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  );
}

// Usage
<NavLink to="/dashboard" fynApps={['fynapp-charts', 'fynapp-grid']}>
  Dashboard
</NavLink>
```

### Pattern 3: Parallel Route Transitions

Load next route's FynApps during transition animation:

```typescript
function App() {
  const navigate = useNavigate();

  const transitionTo = async (path: string, fynApps: string[]) => {
    // Start transition animation
    setTransitioning(true);

    // Load FynApps in parallel with animation
    await Promise.all([
      kernel.loadFynAppsByName(fynApps.map(name => ({ name }))),
      sleep(300) // Wait for animation
    ]);

    navigate(path);
    setTransitioning(false);
  };

  return (
    <button onClick={() => transitionTo('/dashboard', ['fynapp-charts'])}>
      Go to Dashboard
    </button>
  );
}
```

### Pattern 4: Route Guards with FynApp Loading

Combine authentication guards with FynApp preloading:

```typescript
function ProtectedRoute({ fynApps, children }) {
  const { isAuthenticated } = useAuth();
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (isAuthenticated) {
      kernel.loadFynAppsByName(
        fynApps.map(name => ({ name }))
      ).then(() => setLoaded(true));
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!loaded) return <LoadingSpinner />;

  return children;
}
```

---

## Migration Path for TODO.md Items

The TODO.md currently lists routing as kernel concerns. Here's how they map to the new architecture:

### TODO Section 12: "Federated routing with cross-FynApp navigation"

**Old approach:** Kernel manages routing
**New approach:** Shell app orchestrates FynApps via routes

```typescript
// Shell app handles all navigation
function App() {
  return (
    <Routes>
      <Route path="/dashboard" element={
        <MultiAppView fynApps={['charts', 'grid']} />
      } />
    </Routes>
  );
}
```

### TODO Section 1: "Routing middleware"

**Old approach:** Routing as kernel middleware
**New approach:** Optional routing utility FynApp

```typescript
// Optional: FynApp that provides routing utilities
// fynapp-routing-utils exports helpers for shell apps
import { preloadOnHover, routeGuards } from 'fynapp-routing-utils';
```

### TODO Section 15: "Pre/post-auth routing"

**Old approach:** Kernel handles auth routing
**New approach:** Shell app + auth middleware

```typescript
// Shell app combines auth middleware with router
function App() {
  const { isAuthenticated } = useAuth(); // from auth middleware

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/app/*" element={
        isAuthenticated ? <AppRoutes /> : <Navigate to="/login" />
      } />
    </Routes>
  );
}
```

---

## Integration with Existing Systems

### Middleware System

Routing complements middleware but doesn't replace it:

```typescript
// Auth middleware controls access
// Routing controls which FynApps load

function ProtectedDashboard() {
  // Auth middleware provides authentication
  const { user } = useAuthMiddleware();

  React.useEffect(() => {
    // Only load FynApps if authenticated
    if (user) {
      kernel.loadFynAppsByName([{ name: 'fynapp-charts' }]);
    }
  }, [user]);
}
```

### Preloading System

Routes feed into the preloading system via static analysis:

1. Shell defines `ROUTE_CONFIG`
2. Build tool analyzes dependency graph
3. Generates `<link rel="modulepreload">` tags
4. Browser preloads in parallel during page load

See `route-based-preloading.md` for detailed integration.

---

## SSR Kernel API Design

To support server-side rendering, the kernel needs minimal additions:

### State Serialization

```typescript
interface FynMeshKernel {
  // Serialize runtime state for SSR
  serializeState(): SerializedKernelState;

  // Hydrate state on client
  hydrateState(state: SerializedKernelState): void;
}

interface SerializedKernelState {
  appsLoaded: Record<string, { name: string; version: string }>;
  middlewares: Record<string, any>;
  // Minimal state needed for hydration
}
```

### Server-Safe Loading

```typescript
// Server kernel doesn't inject DOM elements
class ServerKernel extends FynMeshKernelCore {
  async loadFynApp(baseUrl: string): Promise<void> {
    // Server-side: load without DOM injection
    const fynAppEntry = await import(baseUrl);
    const fynApp = await this.loadFynAppBasics(fynAppEntry);
    // Skip bootstrap if no ./main module
    if (fynApp.exposes['./main']) {
      await this.bootstrapFynApp(fynApp);
    }
  }
}
```

---

## Example: Complete Shell App

```typescript
// shell-app/src/main.tsx
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { createBrowserKernel } from 'fynmesh-kernel/browser';

// Create kernel instance
const kernel = createBrowserKernel();

// Route configuration for build-time analysis
export const ROUTE_CONFIG = {
  '/': ['fynapp-home'],
  '/dashboard': ['fynapp-charts', 'fynapp-data-grid'],
  '/admin': ['fynapp-admin-panel']
};

function App() {
  const navigate = useNavigate();

  // Optional: Track route changes for analytics
  React.useEffect(() => {
    const handler = () => {
      kernel.emitAsync(new CustomEvent('ROUTE_CHANGE', {
        detail: { path: location.pathname }
      }));
    };

    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  return (
    <div className="app">
      <nav>
        <NavLink to="/" fynApps={ROUTE_CONFIG['/']}>Home</NavLink>
        <NavLink to="/dashboard" fynApps={ROUTE_CONFIG['/dashboard']}>
          Dashboard
        </NavLink>
        <NavLink to="/admin" fynApps={ROUTE_CONFIG['/admin']}>
          Admin
        </NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </div>
  );
}

// Preload on hover
function NavLink({ to, fynApps, children }) {
  const navigate = useNavigate();

  const handleMouseEnter = () => {
    kernel.loadFynAppsByName(fynApps.map(name => ({ name })));
  };

  return (
    <a
      href={to}
      onMouseEnter={handleMouseEnter}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

// Route component
function Dashboard() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    kernel.loadFynAppsByName([
      { name: 'fynapp-charts' },
      { name: 'fynapp-data-grid' }
    ]).then(() => setReady(true));
  }, []);

  if (!ready) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <div id="charts-container" />
      <div id="data-grid-container" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

---

## Advantages of This Architecture

1. **Zero kernel complexity** - Routing stays in application layer
2. **Framework freedom** - Use any router (React Router, Tanstack, Vue Router, etc.)
3. **SSR flexibility** - Works with Next.js, Remix, SvelteKit, etc.
4. **Simple mental model** - Shell app = routing + orchestration, FynApps = features
5. **Build-time optimization** - Static analysis generates perfect preload directives
6. **Progressive enhancement** - Works without JavaScript (SSR)
7. **No lock-in** - Change routers without touching kernel

---

## Open Questions

1. Should kernel provide route change event bus, or let shell handle analytics?
2. Do we need a reference shell app implementation in the repo?
3. Should route hints support wildcards in patterns (e.g., `/admin/*`)?
4. How to handle dynamic route parameters in static analysis?
5. Should we provide a routing utilities FynApp (`fynapp-routing-utils`)?

---

## Next Steps

1. ✅ Document zero-kernel routing architecture
2. ⏳ Implement `fyn analyze-routes` CLI tool
3. ⏳ Add SSR serialization APIs to kernel
4. ⏳ Create reference shell app with routing examples
5. ⏳ Update `route-based-preloading.md` to reference this doc

---

## References

- [React Router](https://reactrouter.com/)
- [Tanstack Router](https://tanstack.com/router)
- [Next.js Routing](https://nextjs.org/docs/routing/introduction)
- [Remix Routing](https://remix.run/docs/en/main/guides/routing)
- [Module Federation + Routing](https://module-federation.github.io/blog/routing)
