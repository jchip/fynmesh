# FynApp React Middleware Provider

This FynApp provides generic React Context middleware for the FynMesh ecosystem.

**Note**: The middleware is automatically detected and applied by the FynMesh kernel when this FynApp is loaded. No explicit requirements declaration is needed.

## Features

- ✅ **Generic Context Factory**: Create any type of React context with configuration
- ✅ **Isolation vs Sharing**: Per-FynApp isolated contexts or shared across FynApps
- ✅ **State Persistence**: localStorage, sessionStorage, or memory persistence
- ✅ **Action System**: Declarative actions with middleware hooks
- ✅ **Performance Optimization**: Context selectors and efficient re-rendering
- ✅ **Type Safety**: Full TypeScript support with generic types

## Usage

### 1. In Consumer FynApp Configuration

```typescript
// src/config.ts
export default {
  middlewareConfig: {
    "react-context": {
      contexts: [
        {
          contextName: "theme",
          initialState: {
            mode: "light",
            colors: { primary: "#007acc", secondary: "#f0f0f0" },
          },
          actions: {
            toggleTheme: (state) => ({
              mode: state.mode === "light" ? "dark" : "light",
            }),
            setColors: (state, colors) => ({ colors }),
          },
          persistence: {
            key: "app-theme",
            storage: "localStorage",
          },
          shared: true, // Share across all FynApps
        },
        {
          contextName: "userProfile",
          initialState: {
            name: "",
            preferences: {},
          },
          actions: {
            updateProfile: (state, updates) => updates,
            setPreference: (state, key, value) => ({
              preferences: { ...state.preferences, [key]: value },
            }),
          },
          shared: false, // Isolated per FynApp
        },
      ],
    },
  },
};
```

### 2. In Consumer FynApp Component

```typescript
// src/App.tsx
import React from "react";

export default function App({ middleware }) {
  const contextMiddleware = middleware?.get("react-context");

  // Use single context
  const { state: theme, actions: themeActions } =
    contextMiddleware.useContext("theme");

  // Use context selector for performance
  const useThemeSelector = contextMiddleware.useContextSelector("theme");
  const themeMode = useThemeSelector((state) => state.mode);

  // Use multiple contexts
  const { theme: themeState, userProfile } =
    contextMiddleware.useMultipleContexts(["theme", "userProfile"]);

  return (
    <div
      style={{
        backgroundColor: theme.mode === "dark" ? "#000" : "#fff",
        color: theme.mode === "dark" ? "#fff" : "#000",
      }}
    >
      <h1>Theme Mode: {themeMode}</h1>
      <button onClick={() => themeActions.toggleTheme()}>Toggle Theme</button>
      <p>
        Available contexts:{" "}
        {contextMiddleware.getAvailableContexts().join(", ")}
      </p>
    </div>
  );
}
```

## Context Configuration Options

### Basic Configuration

```typescript
interface ContextConfig<T> {
  contextName: string; // Unique identifier
  initialState: T; // Initial state object
  actions?: Record<string, ActionFunction>; // State update functions
  persistence?: PersistenceConfig; // State persistence
  shared?: boolean; // Share across FynApps
  middleware?: MiddlewareHooks; // Lifecycle hooks
}
```

### Persistence Options

```typescript
{
  persistence: {
    key: "unique-storage-key",
    storage: "localStorage" | "sessionStorage" | "memory"
  }
}
```

### Action Functions

```typescript
{
  actions: {
    // Simple state update
    setTheme: (state, theme) => ({ mode: theme }),

    // Function-based update
    toggleTheme: (state) => ({
      mode: state.mode === "light" ? "dark" : "light"
    }),

    // Complex state update
    updateSettings: (state, settings) => ({
      settings: { ...state.settings, ...settings }
    })
  }
}
```

### Middleware Hooks

```typescript
{
  middleware: {
    onStateChange: (oldState, newState, action) => {
      console.log(`${action} changed state:`, { oldState, newState });
    },
    validation: (state) => {
      return state.mode === "light" || state.mode === "dark";
    }
  }
}
```

## API Reference

The middleware exposes the following APIs to consumer FynApps:

- `useContext(contextName)`: Get context value and actions
- `useContextSelector(contextName)`: Get selector hook for performance
- `useMultipleContexts(contextNames)`: Get multiple contexts efficiently
- `getAvailableContexts()`: List all available context names
- `hasContext(contextName)`: Check if context exists

## Building

```bash
npm install
npm run build
```

## Development

```bash
npm run dev
```
