# FynMesh React Context Middleware Demo

## Overview

We've implemented a **generic React Context middleware system** for FynMesh that demonstrates the full middleware architecture pattern. This implementation showcases how middleware can be provided by one FynApp and consumed by others.

## Architecture

### 1. Middleware Provider: `fynapp-react-middleware`

**Purpose**: A dedicated FynApp that provides generic React Context middleware
**Location**: `demo/fynapp-react-middleware/`

**Key Features**:

- ✅ **Generic Context Factory**: Creates any type of React context from configuration
- ✅ **Isolation vs Sharing**: Contexts can be isolated per FynApp or shared globally
- ✅ **State Persistence**: Supports localStorage, sessionStorage, and memory storage
- ✅ **Action System**: Declarative state update functions with middleware hooks
- ✅ **Performance Optimization**: Context selectors for efficient re-rendering
- ✅ **Lifecycle Hooks**: State change callbacks and validation

**Exports**:

- `./middleware/react-context` → Contains `__middleware__ReactContext`

### 2. Consumer Example: `fynapp-1`

**Purpose**: Demonstrates how to consume the React Context middleware in a real FynApp
**Location**: `demo/fynapp-1/`

**Features**:

- 🎨 **Theme Management**: Light/dark mode with color themes and localStorage persistence
- 👤 **User Management**: Authentication state with profile data and sessionStorage
- 🔧 **Enhanced UI**: Theme-aware styling and user controls
- 🛠️ **Middleware Integration**: Shows real-world usage patterns

## Configuration Examples

### Provider Configuration (Minimal)

The middleware provider requires no configuration - it just exports the middleware:

```typescript
// fynapp-react-middleware/src/middleware/react-context.tsx
export const __middleware__ReactContext = new GenericReactContextMiddleware();
```

### Consumer Configuration (Real Example)

Here's how `fynapp-1` configures the middleware:

```typescript
// demo/fynapp-1/src/config.ts
export default {
  middlewareRequirements: [
    {
      name: "react-context",
      version: "^1.0.0",
      required: true,
      provider: "fynapp-react-middleware",
    },
  ],
  middlewareConfig: {
    "react-context": {
      contexts: [
        {
          contextName: "theme",
          initialState: {
            mode: "dark",
            colors: {
              primary: "#4a90e2",
              secondary: "#333",
              background: "#1a1a1a",
              text: "#ffffff",
            },
          },
          actions: {
            toggleTheme: (state) => ({
              mode: state.mode === "light" ? "dark" : "light",
              colors:
                state.mode === "light"
                  ? {
                      primary: "#4a90e2",
                      secondary: "#333",
                      background: "#1a1a1a",
                      text: "#ffffff",
                    }
                  : {
                      primary: "#007bff",
                      secondary: "#f5f5f5",
                      background: "#ffffff",
                      text: "#000000",
                    },
            }),
            setTheme: (state, mode) => ({ mode }),
          },
          persistence: {
            key: "fynapp-1-theme",
            storage: "localStorage",
          },
          shared: true, // Share across FynApps
        },
        {
          contextName: "user",
          initialState: {
            isAuthenticated: false,
            username: null,
            profile: {
              email: "",
              preferences: {
                notifications: true,
                language: "en",
              },
            },
          },
          actions: {
            login: (state, username) => ({
              isAuthenticated: true,
              username,
              profile: {
                email: `${username}@example.com`,
                preferences: state.profile.preferences,
              },
            }),
            logout: () => ({
              isAuthenticated: false,
              username: null,
              profile: {
                email: "",
                preferences: { notifications: true, language: "en" },
              },
            }),
            updateProfile: (state, updates) => ({
              profile: { ...state.profile, ...updates },
            }),
          },
          persistence: {
            key: "fynapp-1-user",
            storage: "sessionStorage",
          },
          shared: false, // Keep user state isolated to this app
        },
      ],
    },
  },
};
```

## Usage Patterns

### 1. Basic Context Usage

```typescript
// From demo/fynapp-1/src/App.tsx
function App({ middleware }) {
  const contextMiddleware = middleware?.get('react-context');

  // Access individual contexts
  const themeContext = contextMiddleware?.useContext('theme');
  const userContext = contextMiddleware?.useContext('user');

  const theme = themeContext?.state || { mode: 'light', colors: {...} };
  const themeActions = themeContext?.actions || {};
  const user = userContext?.state || { isAuthenticated: false, username: null };
  const userActions = userContext?.actions || {};

  return (
    <div style={{ backgroundColor: theme.colors.background, color: theme.colors.text }}>
      <button onClick={() => themeActions.toggleTheme?.()}>
        Switch to {theme.mode === 'light' ? 'Dark' : 'Light'} Theme
      </button>

      {!user.isAuthenticated ? (
        <button onClick={() => userActions.login?.('demo-user')}>
          Login as Demo User
        </button>
      ) : (
        <div>
          <p>Welcome, {user.username}!</p>
          <button onClick={() => userActions.logout?.()}>Logout</button>
        </div>
      )}
    </div>
  );
}
```

### 2. Performance-Optimized Selectors

```typescript
function App({ middleware }) {
  const contextMiddleware = middleware?.get("react-context");
  const useThemeSelector = contextMiddleware.useContextSelector("theme");

  // Only re-renders when theme mode changes, not entire theme state
  const themeMode = useThemeSelector((state) => state.mode);

  return <h1>Current mode: {themeMode}</h1>;
}
```

### 3. Multi-Context Access

```typescript
function App({ middleware }) {
  const contextMiddleware = middleware?.get("react-context");

  // Efficiently access multiple contexts at once
  const { theme, user } = contextMiddleware.useMultipleContexts([
    "theme",
    "user",
  ]);

  return <div>...</div>;
}
```

## Key Design Decisions

### 1. **Separation of Concerns**

- **Provider FynApp**: Only provides middleware, no UI
- **Consumer FynApp**: Uses middleware through configuration
- **Clean separation** between middleware logic and application logic

### 2. **Configuration-Driven**

- Middleware behavior defined through declarative configuration
- No hardcoded context types or structures
- Flexible and reusable across different use cases

### 3. **Isolation vs Sharing**

- **Isolated contexts**: Each FynApp gets its own instance (user context)
- **Shared contexts**: Global state shared across all FynApps (theme context)
- **Configurable per context** based on requirements

### 4. **Performance Considerations**

- Context selectors to minimize re-renders
- Efficient multi-context access patterns
- Lazy evaluation and memoization where appropriate

### 5. **Developer Experience**

- Rich debugging and introspection capabilities
- Clear error messages and validation
- TypeScript support with generic types

## Testing the Implementation

### 1. Build the Projects

```bash
# Build middleware provider
cd demo/fynapp-react-middleware
fyn install
npm run build

# Build consumer (fynapp-1)
cd ../fynapp-1
fyn install
npm run build
```

### 2. Start Demo Server

```bash
cd ../demo-server
npm start
```

### 3. Load in Browser

Navigate to: `http://localhost:8080` and load both FynApps:

```javascript
// Load middleware provider first
await fynMeshKernel.loadFynApp("/fynapp-react-middleware");

// Then load consumer
await fynMeshKernel.loadFynApp("/fynapp-1");
```

## What This Demonstrates

### ✅ **Middleware Architecture**

- Complete middleware lifecycle: discovery → registration → application
- Provider/consumer pattern with federation
- Configuration-driven middleware behavior

### ✅ **Real-World Use Cases**

- Theme management with persistence and sharing
- User authentication state with session storage
- Application state management
- Cross-FynApp communication

### ✅ **Advanced Features**

- State persistence with multiple storage options
- Performance optimization techniques
- Debugging and introspection capabilities
- Type safety and developer experience

### ✅ **Scalability Patterns**

- Generic, reusable middleware design
- Clean separation between provider and consumer
- Configurable isolation vs sharing strategies

## Next Steps

This implementation provides a solid foundation for:

1. **Other Middleware Types**: Authentication, analytics, routing, etc.
2. **Enhanced Features**: Hot reloading, middleware dependencies, version management
3. **Production Deployment**: Error boundaries, performance monitoring, security
4. **Developer Tools**: Visual middleware inspector, configuration validators

The generic React Context middleware demonstrates how FynMesh's middleware system can provide powerful, reusable functionality while maintaining clean architecture and excellent developer experience.

## Summary of Changes to fynapp-1

The existing `fynapp-1` was updated to use our new generic middleware:

1. **Configuration Update**: Changed from simple theme config to rich context declarations
2. **App Component**: Updated to use new middleware API with separate contexts
3. **Enhanced Features**: Added user management, better theme controls, profile updates
4. **Real-World Pattern**: Shows how existing FynApps can adopt the middleware

This demonstrates that the middleware can be **easily integrated into existing FynApps** with minimal changes while providing significantly enhanced functionality.
