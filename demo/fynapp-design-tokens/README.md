# Design Tokens Middleware - Theme Scoping

This middleware provides flexible theme management with support for both **scoped** (per-fynapp) and **global** themes.

## Features

- **7 Predefined Themes**: Default, Dark, Blue, Green, Purple, Sunset, and Cyberpunk
- **Per-FynApp Scoping**: Each fynapp can have its own theme without affecting others
- **Global Themes**: Option to apply themes across all fynapp instances
- **Theme Switching**: Runtime theme switching with persistence
- **CSS Custom Properties**: Automatic CSS variable injection
- **TypeScript Support**: Full type safety

## Configuration Options

### Scoped Themes (Default)
```typescript
{
  info: {
    name: "design-tokens",
    provider: "fynapp-design-tokens",
    version: "^1.0.0",
  },
  config: {
    theme: "fynmesh-blue",
    cssCustomProperties: true,
    cssVariablePrefix: "fynmesh",
    enableThemeSwitching: true,
    global: false, // Scoped to this fynapp only
  },
}
```

### Global Themes
```typescript
{
  info: {
    name: "design-tokens",
    provider: "fynapp-design-tokens",
    version: "^1.0.0",
  },
  config: {
    theme: "fynmesh-dark",
    cssCustomProperties: true,
    cssVariablePrefix: "fynmesh",
    enableThemeSwitching: true,
    global: true, // Applies to all fynapp instances
  },
}
```

## Generated CSS

### Scoped Theme (global: false)
```css
#fynapp-1 {
  --fynmesh-color-primary: #2563eb;
  --fynmesh-color-secondary: #64748b;
  --fynmesh-spacing-md: 1rem;
  /* ... other variables ... */
}
```

### Global Theme (global: true)
```css
:root {
  --fynmesh-color-primary: #2563eb;
  --fynmesh-color-secondary: #64748b;
  --fynmesh-spacing-md: 1rem;
  /* ... other variables ... */
}
```

## Available Themes

| Theme | Description | Primary Color |
|-------|-------------|---------------|
| `fynmesh-default` | Default light theme | #2563eb |
| `fynmesh-dark` | Dark theme | #3b82f6 |
| `fynmesh-blue` | Blue-focused theme | #1e40af |
| `fynmesh-green` | Green/nature theme | #059669 |
| `fynmesh-purple` | Purple/royal theme | #7c3aed |
| `fynmesh-sunset` | Orange/sunset theme | #ea580c |
| `fynmesh-cyberpunk` | Neon/cyberpunk theme | #00ff88 |

## Usage in Components

### Using CSS Variables
```typescript
const Button: React.FC = () => (
  <button style={{
    backgroundColor: 'var(--fynmesh-color-primary)',
    color: 'var(--fynmesh-color-light)',
    padding: 'var(--fynmesh-spacing-md)',
    borderRadius: 'var(--fynmesh-radius-md)',
  }}>
    Click me
  </button>
);
```

### Using the API
```typescript
const MyComponent: React.FC = ({ runtime }) => {
  const designTokensData = runtime.middlewareContext.get("design-tokens");
  const api = designTokensData?.api;

  const handleThemeChange = (theme: string) => {
    // Theme changes are always attempted globally
    // But only affect apps that have opted into global changes
    api?.setTheme(theme, true);
  };

  const handleGlobalOptIn = (optIn: boolean) => {
    // Controls whether this app accepts global theme changes
    api?.setGlobalOptIn(optIn);
  };

  return (
    <div>
      <button onClick={() => handleThemeChange('fynmesh-dark')}>
        Switch to Dark Theme (Global)
      </button>
      <label>
        <input
          type="checkbox"
          checked={api?.getGlobalOptIn()}
          onChange={(e) => handleGlobalOptIn(e.target.checked)}
        />
        Accept global theme changes
      </label>
    </div>
  );
};
```

### Theme Change Subscriptions
```typescript
const MyComponent: React.FC = ({ runtime }) => {
  const [currentTheme, setCurrentTheme] = useState("fynmesh-default");

  useEffect(() => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      const api = designTokensData.api;

      // Subscribe to theme changes
      const unsubscribe = api.subscribeToThemeChanges((theme, tokens, fynAppName) => {
        // fynAppName is undefined for global changes
        // fynAppName is set for scoped changes
        if (!fynAppName || fynAppName === runtime?.fynApp?.name) {
          setCurrentTheme(theme);
          console.log(`Theme changed to ${theme}${fynAppName ? ` for ${fynAppName}` : ' globally'}`);
        }
      });

      return unsubscribe;
    }
  }, [runtime]);

  return <div>Current theme: {currentTheme}</div>;
};
```

## Demo Setup

### FynApp-1 (Scoped Default Theme)
```typescript
// fynapp-1/src/main.ts
export const main = useMiddleware([
  {
    info: { name: "design-tokens", provider: "fynapp-design-tokens", version: "^1.0.0" },
    config: {
      theme: "fynmesh-default",
      global: false, // Scoped to fynapp-1
    },
  },
], middlewareUser);
```

### FynApp-1-B (Scoped Green Theme)
```typescript
// fynapp-1-b/src/main.ts
export const main = useMiddleware([
  {
    info: { name: "design-tokens", provider: "fynapp-design-tokens", version: "^1.0.0" },
    config: {
      theme: "fynmesh-green",
      global: false, // Scoped to fynapp-1-b
    },
  },
], middlewareUser);
```

## Theme Scoping Behavior

### Per-FynApp Theme Management
Each fynapp can control both how it applies themes and whether it participates in global theme changes:

1. **Initial State**: Each fynapp starts with its configured theme
2. **Dual Control**: The checkbox controls both applying themes and accepting global changes
3. **Theme Application**: When checkbox is checked, theme changes apply globally; when unchecked, they apply locally
4. **Global Participation**: When checkbox is checked, the app accepts global changes; when unchecked, it ignores them
5. **Persistence**: Both per-fynapp themes and global opt-in preferences are persisted

### Checkbox Behavior
The "Apply globally (affects all fynapp instances)" checkbox controls:
- **Checked**: This app applies theme changes globally AND accepts global theme changes
- **Unchecked**: This app applies theme changes locally only AND ignores global theme changes

### Example Scenarios

#### Scenario 1: Mixed Global Settings
- FynApp-1: Default theme, "Apply globally" checkbox **checked**
- FynApp-1-B: Green theme, "Apply globally" checkbox **unchecked**
- User switches FynApp-1 to Dark theme
- Result: FynApp-1 shows Dark globally, FynApp-1-B remains Green (ignores global change)

#### Scenario 2: Both Apps Global
- FynApp-1: Default theme, "Apply globally" checkbox **checked**
- FynApp-1-B: Green theme, "Apply globally" checkbox **checked**
- User switches FynApp-1 to Purple theme
- Result: Both FynApp-1 and FynApp-1-B show Purple theme

#### Scenario 3: Local Theme Changes
- FynApp-1: Purple theme, "Apply globally" checkbox **checked**
- FynApp-1-B: Purple theme, "Apply globally" checkbox **unchecked**
- User switches FynApp-1-B to Cyberpunk theme (applies locally only)
- Result: FynApp-1 remains Purple, FynApp-1-B shows Cyberpunk (local change only)

## Benefits

### Scoped Themes (`global: false`)
- ✅ **Isolated styling**: Each fynapp has its own theme
- ✅ **Independent switching**: Change themes without affecting other apps
- ✅ **Easier debugging**: CSS variables scoped to specific containers
- ✅ **Better encapsulation**: Follows micro-frontend principles

### Global Themes (`global: true`)
- ✅ **Consistent styling**: All fynapp instances share the same theme
- ✅ **Simpler management**: One theme controls everything
- ✅ **Better performance**: Single CSS injection
- ✅ **Traditional approach**: Familiar for most developers

## Architecture

The middleware automatically detects the `global` configuration and generates appropriate CSS:

1. **Scoped mode**: Injects CSS variables scoped to `#fynapp-name`
2. **Global mode**: Injects CSS variables at `:root` level
3. **Mixed mode**: Supports both scoped and global themes in the same application

This approach is **clean, straightforward, and not messy** because:
- Each fynapp gets its own style element regardless of scope
- CSS generation is centralized and consistent
- Configuration is explicit and clear
- No complex dependency management required
