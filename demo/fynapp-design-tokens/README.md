# FynMesh Design Tokens Middleware 🎨

A comprehensive design tokens middleware for the FynMesh ecosystem that provides centralized theme management, CSS custom properties, and type-safe design tokens across all FynApps.

## Features

✅ **Centralized Design System** - Single source of truth for all design tokens
✅ **CSS Custom Properties** - Automatic injection of CSS variables
✅ **Theme Switching** - Runtime theme changes with persistence
✅ **Type Safety** - Full TypeScript support with strongly typed tokens
✅ **FynApp Integration** - Seamless integration with FynMesh middleware architecture
✅ **Performance Optimized** - Efficient CSS generation and updates
✅ **Extensible** - Easy to add custom themes and token categories

## Architecture

This middleware follows the FynMesh middleware pattern:

1. **Provider**: `fynapp-design-tokens` - Implements the design tokens middleware
2. **Consumers**: Any FynApp that uses `useMiddleware` to consume design tokens
3. **Automatic Discovery**: Middleware is auto-detected and registered by the FynMesh kernel

## Usage

### 1. Consumer FynApp Configuration

```typescript
// In your FynApp's main.ts
import { useMiddleware, FynModuleRuntime } from "@fynmesh/kernel";

const myFynAppUser = {
  async execute(runtime: FynModuleRuntime) {
    // Get design tokens from middleware
    const designTokensContext = runtime.middlewareContext.get("design-tokens");
    const { api: designTokens } = designTokensContext || {};

    if (designTokens) {
      console.log("🎨 Current theme:", designTokens.getTheme());
      console.log("🎨 Available tokens:", designTokens.getTokens());

      // Subscribe to theme changes
      designTokens.subscribeToThemeChanges((theme: string, tokens: any) => {
        console.log(`Theme changed to ${theme}`);
      });

      // Inject custom CSS using design tokens
      designTokens.injectCustomCSS(`
        .my-component {
          color: var(--fynmesh-color-primary);
          font-size: var(--fynmesh-text-lg);
          padding: var(--fynmesh-spacing-md);
          border-radius: var(--fynmesh-radius-md);
        }
      `);
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
      cssVariablePrefix: "fynmesh",
    },
  },
  myFynAppUser,
);
```

### 2. Using CSS Custom Properties

The middleware automatically injects CSS custom properties that you can use in your styles:

```css
/* Colors */
.primary-button {
  background: var(--fynmesh-color-primary);
  color: var(--fynmesh-color-light);
}

.fynapp-specific {
  border-color: var(--fynmesh-color-fynapp1);
}

/* Typography */
.heading {
  font-size: var(--fynmesh-text-3xl);
  font-weight: var(--fynmesh-font-weight-bold);
  font-family: var(--fynmesh-font-family-sans);
}

/* Spacing */
.card {
  padding: var(--fynmesh-spacing-lg);
  margin: var(--fynmesh-spacing-md);
  gap: var(--fynmesh-spacing-sm);
}

/* Borders & Shadows */
.card {
  border-radius: var(--fynmesh-radius-lg);
  box-shadow: var(--fynmesh-shadow-md);
  border: var(--fynmesh-border-1) solid var(--fynmesh-color-primary);
}
```

### 3. JavaScript API

```typescript
// Get the design tokens API
const designTokens = window.fynMeshDesignTokens;

// Get current tokens
const tokens = designTokens.getTokens();
console.log(tokens.colors.primary); // "#2563eb"

// Change theme
designTokens.setTheme("fynmesh-dark");

// Get CSS variable reference
const primaryColor = designTokens.getCSSVariable("color-primary");
// Returns: "var(--fynmesh-color-primary)"

// Subscribe to theme changes
const unsubscribe = designTokens.subscribeToThemeChanges((theme, tokens) => {
  console.log(`Theme changed to ${theme}`);
});

// Inject custom CSS
designTokens.injectCustomCSS(`
  .my-custom-style {
    background: var(--fynmesh-color-success);
  }
`);
```

## Configuration Options

```typescript
interface DesignTokensMiddlewareConfig {
  theme?: string | ThemeConfig;           // Theme name or custom theme
  customTokens?: Partial<DesignTokens>;   // Override specific tokens
  cssCustomProperties?: boolean;          // Enable CSS custom properties (default: true)
  cssVariablePrefix?: string;             // CSS variable prefix (default: "fynmesh")
  enableThemeSwitching?: boolean;         // Enable runtime theme switching (default: true)
  persistTheme?: boolean;                 // Persist theme to localStorage (default: true)
  storageKey?: string;                    // localStorage key (default: "fynmesh-theme")
}
```

## Available Themes

### Built-in Themes

- **`fynmesh-default`** - Light theme with FynMesh brand colors
- **`fynmesh-dark`** - Dark theme variant

### Custom Themes

You can register custom themes:

```typescript
const customTheme: ThemeConfig = {
  name: "my-custom-theme",
  tokens: {
    colors: {
      primary: "#ff6b6b",
      secondary: "#4ecdc4",
      // ... other tokens
    },
    // ... other token categories
  },
  cssCustomProperties: true,
  cssVariablePrefix: "fynmesh",
};

// Register and use custom theme
designTokens.registerTheme(customTheme);
designTokens.setTheme("my-custom-theme");
```

## Token Categories

### Colors
- `primary`, `secondary`, `success`, `warning`, `danger`, `info`, `light`, `dark`
- FynApp-specific: `fynapp1`, `fynapp1b`, `fynapp2`, `fynapp3`, `fynapp4`, `fynapp5`, `fynapp6`, `fynapp7`

### Spacing
- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`

### Typography
- **Sizes**: `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`, `6xl`
- **Weights**: `thin`, `light`, `normal`, `medium`, `semibold`, `bold`, `extrabold`, `black`
- **Families**: `sans`, `serif`, `mono`

### Shadows
- `sm`, `md`, `lg`, `xl`, `2xl`, `inner`, `none`

### Borders
- **Radius**: `none`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `full`
- **Width**: `0`, `1`, `2`, `4`, `8`

### Breakpoints
- `sm`, `md`, `lg`, `xl`, `2xl`

## Benefits for Micro Frontends

✅ **Consistent Design** - All FynApps share the same design tokens
✅ **Theme Coordination** - Change themes across all FynApps simultaneously
✅ **No Build Dependencies** - Tokens are provided at runtime
✅ **Type Safety** - Full TypeScript support prevents token misuse
✅ **Performance** - Efficient CSS custom properties
✅ **Isolation** - Each FynApp can have custom configurations
✅ **Extensibility** - Easy to add new themes and token categories

## Integration with Demo Server

Load the design tokens middleware before your consumer FynApps:

```javascript
// In demo-server/public/index.html
(async () => {
  // Load design tokens middleware first
  await fynMeshKernel.loadFynApp("/fynapp-design-tokens/dist");

  // Then load consumer FynApps
  await fynMeshKernel.loadFynApp("/fynapp-1/dist");
  await fynMeshKernel.loadFynApp("/fynapp-1-b/dist");

  // All FynApps now have access to design tokens!
})();
```

## Advanced Usage

### Theme Switching UI

```typescript
// Create a theme switcher component
const createThemeSwitcher = () => {
  const switcher = document.createElement('div');
  switcher.innerHTML = `
    <button onclick="window.fynMeshDesignTokens?.setTheme('fynmesh-default')">
      Default Theme
    </button>
    <button onclick="window.fynMeshDesignTokens?.setTheme('fynmesh-dark')">
      Dark Theme
    </button>
  `;
  return switcher;
};
```

### CSS-in-JS Integration

```typescript
// Use with styled-components or similar
const StyledButton = styled.button`
  background: var(--fynmesh-color-primary);
  color: var(--fynmesh-color-light);
  padding: var(--fynmesh-spacing-sm) var(--fynmesh-spacing-md);
  border-radius: var(--fynmesh-radius-md);
  border: none;
  cursor: pointer;

  &:hover {
    background: var(--fynmesh-color-secondary);
    box-shadow: var(--fynmesh-shadow-md);
  }
`;
```

This Design Tokens Middleware provides a comprehensive solution for managing design systems in micro frontend architectures, ensuring consistency, flexibility, and excellent developer experience across all FynApps! 🚀
