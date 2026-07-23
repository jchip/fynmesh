# Design Tokens Middleware

## Overview

The Design Tokens Middleware is a comprehensive solution for managing design systems in FynMesh micro frontend applications. It provides centralized theme management, CSS custom properties injection, and type-safe design tokens that can be shared across all FynApps in the ecosystem.

**Status: ✅ PRODUCTION READY** - Fully implemented and tested in the FynMesh demo environment.

## Architecture

### Core Components

1. **DesignTokens Class**: Central management of design tokens and themes
2. **DesignTokensMiddleware**: FynMesh middleware implementation
3. **Token Categories**: Colors, typography, spacing, shadows, borders, breakpoints
4. **Theme System**: Predefined and custom themes with runtime switching
5. **CSS Integration**: Automatic CSS custom properties injection

### Token Structure

```typescript
interface DesignTokensData {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: {
    sizes: Record<string, string>;
    weights: Record<string, number>;
    families: Record<string, string>;
  };
  shadows: Record<string, string>;
  borders: {
    radius: Record<string, string>;
    width: Record<string, string>;
  };
  breakpoints: Record<string, string>;
}
```

### Default Token Set

**Colors:**
- Primary system colors: `primary`, `secondary`, `success`, `warning`, `danger`, `info`, `light`, `dark`
- FynApp-specific colors: `fynapp1`, `fynapp1b`, `fynapp2`, `fynapp3`, `fynapp4`, `fynapp5`, `fynapp6`, `fynapp7`

**Typography:**
- Font sizes: `xs` (0.75rem) to `6xl` (3.75rem)
- Font weights: `thin` (100) to `black` (900)
- Font families: `sans`, `serif`, `mono`

**Spacing:**
- `xs` (0.25rem) to `3xl` (3rem)

**Shadows:**
- `sm`, `md`, `lg`, `xl`, `2xl`, `inner`, `none`

**Borders:**
- Radius: `none` to `full` (9999px)
- Width: `0` to `8` (8px)

**Breakpoints:**
- `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px), `2xl` (1536px)

## Implementation Details

### Provider Implementation

```typescript
// fynapp-design-tokens/src/middleware/design-tokens.ts
export class DesignTokensMiddleware implements FynAppMiddleware {
  public readonly name = "design-tokens";
  private designTokens: DesignTokens;
  private fynAppConfigs = new WeakMap<FynApp, DesignTokensMiddlewareConfig>();

  constructor() {
    this.designTokens = new DesignTokens();
  }

  async setup(context: FynAppMiddlewareCallContext): Promise<{ status: string }> {
    const { fynApp, meta } = context;
    const config = this.validateConfig(meta.config);

    this.fynAppConfigs.set(fynApp, config);

    console.debug(`🎨 Design Tokens Middleware setup for ${fynApp.name}`);
    return { status: "ready" };
  }

  async apply(context: FynAppMiddlewareCallContext): Promise<void> {
    const { fynApp, runtime } = context;
    const config = this.fynAppConfigs.get(fynApp)!;

    // Set up theme
    if (config.theme) {
      this.designTokens.setTheme(config.theme);
    }

    // Inject CSS custom properties
    if (config.cssCustomProperties !== false) {
      this.designTokens.injectCSSCustomProperties(fynApp.name, config.cssVariablePrefix);
    }

    // Create API for this FynApp
    const api = this.createDesignTokensAPI(fynApp, config);

    // Store in middleware context
    runtime.middlewareContext.set(this.name, {
      designTokens: this.designTokens,
      api,
      tokens: this.designTokens.getTokens(),
      theme: this.designTokens.getTheme(),
    });

    console.debug(`✅ Design Tokens Middleware applied to ${fynApp.name}`);
  }
}

// Export the middleware instance
export const __middleware__DesignTokens = new DesignTokensMiddleware();
```

### Module Exposure

```typescript
// rollup.config.ts
export default {
  plugins: [
    setupReactFederationPlugins({
      name: "fynapp-design-tokens",
      exposes: {
        "./main": "./src/main.ts",
        "./middleware/design-tokens": "./src/middleware/design-tokens.ts"
      }
    })
  ]
};
```

### Configuration

```typescript
// src/config.ts
export const config = {
  loadMiddlewares: true,
};
```

## Consumer Usage

### Basic Usage

```typescript
// Consumer FynApp main.ts
import { useMiddleware, FynModule, FynModuleRuntime } from "@fynmesh/kernel";

const middlewareUser: FynModule = {
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
        // Update UI accordingly
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
  middlewareUser,
);
```

### Configuration Options

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

## CSS Integration

### Automatic CSS Custom Properties

The middleware automatically injects CSS custom properties that can be used in stylesheets:

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

### Generated CSS Output

```css
:root {
  /* Colors */
  --fynmesh-color-primary: #2563eb;
  --fynmesh-color-secondary: #64748b;
  --fynmesh-color-success: #059669;
  --fynmesh-color-fynapp1: #6366f1;
  --fynmesh-color-fynapp2: #8b5cf6;
  /* ... */

  /* Typography */
  --fynmesh-text-xs: 0.75rem;
  --fynmesh-text-sm: 0.875rem;
  --fynmesh-text-base: 1rem;
  /* ... */

  /* Spacing */
  --fynmesh-spacing-xs: 0.25rem;
  --fynmesh-spacing-sm: 0.5rem;
  --fynmesh-spacing-md: 1rem;
  /* ... */
}
```

## JavaScript API

### Global API Access

```typescript
// Access the global API
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

### API Methods

```typescript
interface DesignTokensAPI {
  getTokens(): DesignTokensData;
  getTheme(): string;
  setTheme(theme: string): void;
  getCSSVariable(tokenPath: string): string;
  subscribeToThemeChanges(callback: (theme: string, tokens: DesignTokensData) => void): () => void;
  injectCustomCSS(css: string): void;
}
```

## Theme System

### Built-in Themes

1. **fynmesh-default**: Light theme with FynMesh brand colors
2. **fynmesh-dark**: Dark theme variant with inverted colors

### Custom Themes

```typescript
// Define custom theme
const customTheme: ThemeConfig = {
  name: "my-custom-theme",
  tokens: {
    colors: {
      primary: "#ff6b6b",
      secondary: "#4ecdc4",
      success: "#51cf66",
      warning: "#ffd43b",
      danger: "#ff6b6b",
      info: "#74c0fc",
      light: "#f8f9fa",
      dark: "#212529",
      // FynApp colors
      fynapp1: "#ff6b6b",
      fynapp2: "#4ecdc4",
      // ... other colors
    },
    typography: {
      sizes: {
        // Override font sizes
        base: "1.125rem",
        lg: "1.25rem",
        // ... other sizes
      },
      weights: {
        // Use default weights
      },
      families: {
        // Use default families
      },
    },
    // ... other token categories
  },
  cssCustomProperties: true,
  cssVariablePrefix: "fynmesh",
};

// Register and use custom theme
export const main = useMiddleware(
  {
    info: {
      name: "design-tokens",
      provider: "fynapp-design-tokens",
      version: "^1.0.0",
    },
    config: {
      theme: customTheme,
      cssCustomProperties: true,
      cssVariablePrefix: "fynmesh",
    },
  },
  middlewareUser,
);
```

### Theme Switching

```typescript
// Runtime theme switching
const designTokens = window.fynMeshDesignTokens;

// Switch to dark theme
designTokens.setTheme("fynmesh-dark");

// Switch to custom theme
designTokens.setTheme("my-custom-theme");

// Subscribe to theme changes
designTokens.subscribeToThemeChanges((theme, tokens) => {
  console.log(`Theme changed to ${theme}`);
  // Update UI components
  updateUIForTheme(theme, tokens);
});
```

## Advanced Usage

### Theme Persistence

The middleware automatically persists theme selection to localStorage:

```typescript
// Configuration
config: {
  persistTheme: true,
  storageKey: "fynmesh-theme",
}

// The middleware will:
// 1. Load persisted theme on initialization
// 2. Save theme changes to localStorage
// 3. Apply persisted theme across browser sessions
```

### CSS-in-JS Integration

```typescript
// Use with styled-components
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

// Use with emotion
const buttonStyles = css`
  background: var(--fynmesh-color-primary);
  color: var(--fynmesh-color-light);
  padding: var(--fynmesh-spacing-sm) var(--fynmesh-spacing-md);
`;
```

### Custom Token Injection

```typescript
// Inject custom CSS rules
designTokens.injectCustomCSS(`
  .dashboard-card {
    background: var(--fynmesh-color-light);
    border: var(--fynmesh-border-1) solid var(--fynmesh-color-primary);
    border-radius: var(--fynmesh-radius-lg);
    padding: var(--fynmesh-spacing-lg);
    box-shadow: var(--fynmesh-shadow-md);
  }

  .dashboard-card.dark {
    background: var(--fynmesh-color-dark);
    color: var(--fynmesh-color-light);
  }
`);
```

## Demo Integration

### Demo Server Loading

```javascript
// In demo-server/public/index.html
(async () => {
  // STEP 1: Load Design Tokens Middleware first
  console.log("🎨 Loading Design Tokens Middleware provider");
  await fynMeshKernel.loadFynApp("/fynapp-design-tokens/dist");
  console.log("✅ Design Tokens Middleware loaded and ready");

  // STEP 2: Load consumer FynApps
  await fynMeshKernel.loadFynApp("/fynapp-1/dist");
  await fynMeshKernel.loadFynApp("/fynapp-1-b/dist");
  await fynMeshKernel.loadFynApp("/fynapp-6-react/dist");

  // All FynApps now have access to design tokens!
})();
```

### Theme Switcher UI

```typescript
// Create a theme switcher component
const createThemeSwitcher = () => {
  const switcher = document.createElement('div');
  switcher.innerHTML = `
    <div class="theme-switcher">
      <button onclick="window.fynMeshDesignTokens?.setTheme('fynmesh-default')">
        🌞 Default Theme
      </button>
      <button onclick="window.fynMeshDesignTokens?.setTheme('fynmesh-dark')">
        🌙 Dark Theme
      </button>
    </div>
  `;

  // Style the switcher
  switcher.querySelector('.theme-switcher').style.cssText = `
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    display: flex;
    gap: 0.5rem;
  `;

  return switcher;
};

// Add theme switcher to the page
document.body.appendChild(createThemeSwitcher());
```

## Performance Considerations

### Efficient CSS Generation

- **Lazy Generation**: CSS is generated only when needed
- **Caching**: Generated CSS is cached and reused
- **Minimal DOM Updates**: Only affected style elements are updated
- **Batch Updates**: Multiple theme changes are batched

### Memory Management

- **WeakMap Usage**: FynApp-specific configurations stored in WeakMap
- **Event Cleanup**: Proper cleanup of event listeners
- **Style Element Management**: Efficient management of injected style elements

### Loading Optimization

- **Preloaded Themes**: Common themes are preloaded
- **Async Theme Loading**: Custom themes can be loaded asynchronously
- **Minimal Bundle Size**: Core functionality is optimized for size

## Benefits for Micro Frontends

### Consistency
- **Unified Design System**: All FynApps share the same design tokens
- **Brand Consistency**: Consistent colors, typography, and spacing
- **Visual Harmony**: Coordinated appearance across all micro frontends

### Flexibility
- **Runtime Theming**: Change themes without rebuilding applications
- **FynApp-Specific Configs**: Each FynApp can have custom configurations
- **Extensible Token System**: Easy to add new token categories

### Performance
- **CSS Custom Properties**: Efficient runtime theming
- **Shared Resources**: Single source of truth reduces duplication
- **Lazy Loading**: Tokens loaded only when needed

### Developer Experience
- **Type Safety**: Full TypeScript support prevents token misuse
- **IntelliSense**: Auto-completion for all token names
- **Runtime Debugging**: Easy to inspect current tokens and themes

## Testing

### Unit Tests

```typescript
// design-tokens.test.ts
import { DesignTokensMiddleware } from "./design-tokens";
import { createMockCallContext } from "@fynmesh/kernel/test-utils";

describe("DesignTokensMiddleware", () => {
  let middleware: DesignTokensMiddleware;
  let mockContext: FynAppMiddlewareCallContext;

  beforeEach(() => {
    middleware = new DesignTokensMiddleware();
    mockContext = createMockCallContext();
  });

  test("should setup with valid config", async () => {
    mockContext.meta.config = {
      theme: "fynmesh-default",
      cssCustomProperties: true,
    };

    const result = await middleware.setup(mockContext);
    expect(result.status).toBe("ready");
  });

  test("should apply design tokens", async () => {
    await middleware.setup(mockContext);
    await middleware.apply(mockContext);

    const contextData = mockContext.runtime.middlewareContext.get("design-tokens");
    expect(contextData).toBeDefined();
    expect(contextData.api).toBeDefined();
    expect(contextData.tokens).toBeDefined();
  });

  test("should inject CSS custom properties", async () => {
    await middleware.setup(mockContext);
    await middleware.apply(mockContext);

    // Check that CSS custom properties are injected
    const styleElement = document.getElementById(`fynmesh-design-tokens-${mockContext.fynApp.name}`);
    expect(styleElement).toBeTruthy();
    expect(styleElement.textContent).toContain("--fynmesh-color-primary");
  });
});
```

### Integration Tests

```typescript
// integration.test.ts
import { FynMeshKernelCore } from "@fynmesh/kernel";

describe("Design Tokens Integration", () => {
  let kernel: FynMeshKernelCore;

  beforeEach(() => {
    kernel = new FynMeshKernelCore();
    // Load design tokens middleware
    kernel.loadFynApp("/fynapp-design-tokens/dist");
  });

  test("should provide design tokens to consumer FynApps", async () => {
    const consumerFynApp = createTestFynApp("consumer");
    await kernel.bootstrapFynApp(consumerFynApp);

    // Check that design tokens are available
    const designTokensContext = consumerFynApp.middlewareContext.get("design-tokens");
    expect(designTokensContext).toBeDefined();
    expect(designTokensContext.api).toBeDefined();
  });

  test("should persist theme changes", async () => {
    const designTokens = window.fynMeshDesignTokens;

    designTokens.setTheme("fynmesh-dark");

    // Check localStorage
    expect(localStorage.getItem("fynmesh-theme")).toBe("fynmesh-dark");
  });
});
```

## Future Enhancements

### Advanced Features
- **Theme Inheritance**: Themes can inherit from other themes
- **Conditional Tokens**: Tokens based on viewport size or user preferences
- **Animation Tokens**: Tokens for consistent animations and transitions
- **Accessibility Tokens**: High contrast and accessibility-focused themes

### Developer Tools
- **Theme Inspector**: Browser extension for inspecting design tokens
- **Token Validation**: Runtime validation of token usage
- **Performance Monitoring**: Track theme change performance

### Integration
- **Design Tool Integration**: Export from Figma, Sketch, etc.
- **Build Tool Integration**: Generate tokens from design files
- **CI/CD Integration**: Automated token validation and deployment

## Conclusion

The Design Tokens Middleware provides a comprehensive solution for managing design systems in micro frontend architectures. It ensures consistency, flexibility, and excellent developer experience while maintaining performance and scalability.

The middleware is production-ready and serves as an excellent example of how to implement shared functionality across FynApps using the FynMesh middleware system. It demonstrates best practices for middleware design, including proper lifecycle management, configuration validation, and type safety.

With features like runtime theme switching, CSS custom properties injection, and comprehensive API access, the Design Tokens Middleware enables sophisticated design system management that scales with your application architecture.
