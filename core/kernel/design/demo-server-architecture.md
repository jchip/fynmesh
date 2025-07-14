# Demo Server Architecture

## Overview

The FynMesh Demo Server is a comprehensive development and demonstration environment that showcases the capabilities of the FynMesh framework. It provides a sophisticated template system, intelligent container management, and live examples of middleware usage across multiple framework implementations.

**Status: ✅ PRODUCTION READY** - Fully implemented with Nunjucks template system and responsive container management.

## Architecture Components

### Template System

The demo server uses a Nunjucks-based template engine for dynamic HTML generation, providing maintainable and flexible content management.

**Key Features:**
- **Nunjucks Template Engine**: Powerful templating with inheritance and includes
- **Dynamic Content Generation**: FynApp configuration and container generation
- **Hot Reloading**: Automatic template recompilation during development
- **Component-Based Structure**: Reusable template components
- **Build-Time Generation**: Templates compiled to static HTML for production

### Directory Structure

```
demo/demo-server/
├── package.json
├── scripts/
│   └── build-templates.js         # Template compilation script
├── src/
│   ├── dev-proxy.ts              # Development proxy server
│   ├── proxy.ts                  # Core proxy functionality
│   └── input.css                 # Source styles (compiled to Tailwind)
├── templates/
│   ├── layouts/
│   │   └── base.html             # Base page layout
│   ├── pages/
│   │   └── index.html            # Main demo page template
│   └── components/
│       ├── styles.html           # CSS and styling components
│       └── fynapp-loader.html    # FynApp loading script component
├── public/
│   ├── index.html                # Generated HTML (build output)
│   ├── system.js                 # SystemJS module loader
│   └── tailwind.css              # Compiled Tailwind CSS
├── tailwind.config.js            # Tailwind CSS configuration
└── xrun-tasks.ts                 # Build and development tasks
```

## Template System Implementation

### Base Layout

```html
<!-- templates/layouts/base.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}FynMesh Micro Frontend Demo{% endblock %}</title>

    {% if isProduction %}
    <link href="/node_modules/spectre.css/dist/spectre.min.css" rel="stylesheet">
    {% else %}
    <link href="/node_modules/spectre.css/dist/spectre.css" rel="stylesheet">
    {% endif %}

    {% block styles %}{% endblock %}
    {% block scripts_head %}{% endblock %}
</head>
<body class="{% block body_class %}body-gradient{% endblock %}" style="min-height: 100vh;">
    {% block content %}{% endblock %}
    {% block scripts_body %}{% endblock %}
</body>
</html>
```

### Main Page Template

```html
<!-- templates/pages/index.html -->
{% extends "layouts/base.html" %}

{% block styles %}
    {% include "components/styles.html" %}
{% endblock %}

{% block scripts_head %}
    {% include "components/fynapp-loader.html" %}
{% endblock %}

{% block content %}
    <!-- Header Section -->
    <header style="position: relative; overflow: hidden;">
        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; opacity: 0.75;" class="header-gradient"></div>
        <div style="position: relative; padding: 3rem 2rem;" class="container">
            <div class="text-center">
                <h1 class="text-bold animate-fade-in" style="font-size: 3rem; color: #fbbf24;">
                    <span style="display: block;">FynMesh</span>
                    <span style="display: block; font-size: 2rem; font-weight: normal; margin-top: 0.5rem; color: #38bdf8;">
                        Micro Frontend Demo
                    </span>
                </h1>
                <p style="margin-top: 2rem; font-size: 1.2rem; color: #f1f5f9; max-width: 600px; margin-left: auto; margin-right: auto;" class="animate-slide-up">
                    Experience the power of independently deployable micro-frontends with module federation
                </p>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main style="padding: 3rem 2rem;" class="container">
        <!-- FynApp Containers -->
        <div class="columns">
            {% for app in fynApps %}
            <div class="column col-12">
                <div style="margin-bottom: 1rem; height: 100%;">
                    <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                        <div class="bg-{{ app.color }} pulse-animation" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 0.5rem;"></div>
                        <h5 style="margin: 0; color: #1f2937;">{{ app.name }}</h5>
                        <span class="label bg-{{ app.badge }}" style="margin-left: 0.5rem; color: white;">{{ app.framework }}</span>
                    </div>
                    <div id="{{ app.id }}" class="loading-spinner card fynapp-card text-{{ app.color }}" style="min-height: 350px; box-shadow: 0 8px 25px rgba(0,0,0,0.1); border-left: 4px solid; padding: 1rem;" data-border-color="{{ app.color }}"></div>
                </div>
            </div>
            {% endfor %}
        </div>
    </main>
{% endblock %}
```

### Component Templates

#### Styles Component

```html
<!-- templates/components/styles.html -->
<style>
    /* Loading spinner styles */
    .loading-spinner {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 200px;
    }

    .loading-spinner::before {
        content: '';
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    /* FynApp colors */
    :root {
        --fynapp-1: #6366f1;
        --fynapp-1-b: #10b981;
        --fynapp-2: #8b5cf6;
        --fynapp-3: #ff5733;
        --fynapp-4: #42b883;
        --fynapp-5: #673ab8;
        --fynapp-6: #4f46e5;
        --fynapp-7: #2D7FF9;
    }

    /* Dynamic border colors for FynApp containers */
    [data-border-color="fynapp-1"] { border-left-color: var(--fynapp-1) !important; }
    [data-border-color="fynapp-1-b"] { border-left-color: var(--fynapp-1-b) !important; }
    [data-border-color="fynapp-2"] { border-left-color: var(--fynapp-2) !important; }
    [data-border-color="fynapp-3"] { border-left-color: var(--fynapp-3) !important; }
    [data-border-color="fynapp-4"] { border-left-color: var(--fynapp-4) !important; }
    [data-border-color="fynapp-5"] { border-left-color: var(--fynapp-5) !important; }
    [data-border-color="fynapp-6"] { border-left-color: var(--fynapp-6) !important; }
    [data-border-color="fynapp-7"] { border-left-color: var(--fynapp-7) !important; }

    /* Custom animations */
    @keyframes fadeIn {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideUp {
        0% { opacity: 0; transform: translateY(30px); }
        100% { opacity: 1; transform: translateY(0); }
    }

    .animate-fade-in {
        animation: fadeIn 0.5s ease-in-out;
    }

    .animate-slide-up {
        animation: slideUp 0.6s ease-out;
    }

    /* Pulse animation for status indicators */
    .pulse-animation {
        animation: pulse 2s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
</style>
```

#### FynApp Loader Component

```html
<!-- templates/components/fynapp-loader.html -->
{% if isProduction %}
<script src="/system.min.js"></script>
<script src="/federation-js/dist/federation-js.min.js"></script>
<script src="/core/kernel/dist/fynmesh-browser-kernel.min.js"></script>
{% else %}
<script src="/system.js"></script>
<script src="/federation-js/dist/federation-js.dev.js"></script>
<script src="/core/kernel/dist/fynmesh-browser-kernel.dev.js"></script>
{% endif %}

<script>
    (async () => {
        const features = {
            "react-18": {{ features["react-18"] | dump | safe }},
            "react-19": {{ features["react-19"] | dump | safe }},
            "fynapp-1": {{ features["fynapp-1"] | dump | safe }},
            "fynapp-1-b": {{ features["fynapp-1-b"] | dump | safe }},
            "fynapp-2-react18": {{ features["fynapp-2-react18"] | dump | safe }},
            "fynapp-3-marko": {{ features["fynapp-3-marko"] | dump | safe }},
            "fynapp-4-vue": {{ features["fynapp-4-vue"] | dump | safe }},
            "fynapp-5-preact": {{ features["fynapp-5-preact"] | dump | safe }},
            "fynapp-6-react": {{ features["fynapp-6-react"] | dump | safe }},
            "fynapp-7-solid": {{ features["fynapp-7-solid"] | dump | safe }},
            "design-tokens": {{ features["design-tokens"] | dump | safe }}
        };

        // STEP 1: Load Design Tokens Middleware first
        if (features["design-tokens"]) {
            console.log("🎨 Loading Design Tokens Middleware provider /fynapp-design-tokens/dist");
            await fynMeshKernel.loadFynApp("/fynapp-design-tokens/dist");
            console.log("✅ Design Tokens Middleware loaded and ready");
        }

        // STEP 2: Load React versions
        if (features["react-18"]) {
            fynMeshKernel.loadFynApp("/fynapp-react-18/dist");
            console.log("loading remote fynapp /fynapp-react-18/dist");
        }
        if (features["react-19"]) {
            fynMeshKernel.loadFynApp("/fynapp-react-19/dist");
            console.log("loading remote fynapp /fynapp-react-19/dist");
        }

        // STEP 3: Load React Context Middleware
        console.log("🔧 Loading React Context Middleware provider /fynapp-react-middleware/dist");
        await fynMeshKernel.loadFynApp("/fynapp-react-middleware/dist");

        // STEP 4: Load consumer FynApps
        if (features["fynapp-1"]) {
            console.log("loading remote fynapp /fynapp-1/dist");
            fynMeshKernel.loadFynApp("/fynapp-1/dist");
        }
        if (features["fynapp-1-b"]) {
            console.log("loading remote fynapp /fynapp-1-b/dist");
            fynMeshKernel.loadFynApp("/fynapp-1-b/dist");
        }
        if (features["fynapp-2-react18"]) {
            console.log("loading remote fynapp /fynapp-2-react18/dist");
            fynMeshKernel.loadFynApp("/fynapp-2-react18/dist");
        }
        if (features["fynapp-3-marko"]) {
            console.log("loading remote fynapp /fynapp-3-marko/dist");
            fynMeshKernel.loadFynApp("/fynapp-3-marko/dist");
        }
        if (features["fynapp-4-vue"]) {
            console.log("loading remote fynapp /fynapp-4-vue/dist");
            fynMeshKernel.loadFynApp("/fynapp-4-vue/dist");
        }
        if (features["fynapp-5-preact"]) {
            console.log("loading remote fynapp /fynapp-5-preact/dist");
            fynMeshKernel.loadFynApp("/fynapp-5-preact/dist");
        }
        if (features["fynapp-6-react"]) {
            console.log("loading remote fynapp /fynapp-6-react/dist");
            fynMeshKernel.loadFynApp("/fynapp-6-react/dist");
        }
        if (features["fynapp-7-solid"]) {
            console.log("loading remote fynapp /fynapp-7-solid/dist");
            fynMeshKernel.loadFynApp("/fynapp-7-solid/dist");
        }
    })();
</script>
```

## Build System

### Template Compilation Script

```javascript
// scripts/build-templates.js
#!/usr/bin/env node

const nunjucks = require("nunjucks");
const fs = require("fs");
const path = require("path");

// Configure Nunjucks
const env = nunjucks.configure("templates", {
  autoescape: true,
  noCache: process.env.NODE_ENV !== "production",
});

// Template data
const templateData = {
  title: "FynMesh Micro Frontend Demo",
  isProduction: process.env.NODE_ENV === "production",
  features: {
    "react-18": true,
    "react-19": true,
    "fynapp-1": true,
    "fynapp-1-b": true,
    "fynapp-2-react18": true,
    "fynapp-3-marko": true,
    "fynapp-4-vue": true,
    "fynapp-5-preact": true,
    "fynapp-6-react": true,
    "fynapp-7-solid": true,
    "design-tokens": true,
  },
  fynApps: [
    {
      id: "fynapp-1",
      name: "FynApp 1 (React 19)",
      framework: "React 19",
      color: "fynapp-1",
      badge: "primary",
    },
    {
      id: "fynapp-1-b",
      name: "FynApp 1-B (React 19)",
      framework: "React 19",
      color: "fynapp-1-b",
      badge: "success",
    },
    {
      id: "fynapp-2-react18",
      name: "FynApp 2",
      framework: "React 18",
      color: "fynapp-2",
      badge: "secondary",
    },
    {
      id: "fynapp-6-react",
      name: "FynApp 6",
      framework: "React",
      color: "fynapp-6",
      badge: "info",
    },
    {
      id: "fynapp-5-preact",
      name: "FynApp 5",
      framework: "Preact",
      color: "fynapp-5",
      badge: "warning",
    },
    {
      id: "fynapp-7-solid",
      name: "FynApp 7",
      framework: "Solid",
      color: "fynapp-7",
      badge: "primary",
    },
    {
      id: "fynapp-4-vue",
      name: "FynApp 4",
      framework: "Vue",
      color: "fynapp-4",
      badge: "success",
    },
    {
      id: "fynapp-3-marko",
      name: "FynApp 3",
      framework: "Marko",
      color: "fynapp-3",
      badge: "warning",
    },
  ],
  infoCards: [
    {
      title: "Independent Deployment",
      description: "Each micro-frontend can be developed and deployed independently by different teams.",
      icon: "bi-boxes",
      color: "primary",
    },
    {
      title: "Module Federation",
      description: "Share code and dependencies between applications at runtime using Module Federation.",
      icon: "bi-code-square",
      color: "secondary",
    },
    {
      title: "Multi-Framework",
      description: "Support for React, Vue, Preact, Solid, and Marko frameworks running together.",
      icon: "bi-lightning-charge",
      color: "success",
    },
  ],
};

try {
  // Render the main page
  const html = env.render("pages/index.html", templateData);

  // Ensure public directory exists
  const publicDir = path.join(__dirname, "../public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write the generated HTML
  const outputPath = path.join(publicDir, "index.html");
  fs.writeFileSync(outputPath, html);

  console.log("✅ Templates compiled successfully!");
  console.log(`📄 Generated: ${outputPath}`);
} catch (error) {
  console.error("❌ Template compilation failed:", error);
  process.exit(1);
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "build": "xrun build:templates compile",
    "build:templates": "node scripts/build-templates.js",
    "compile": "tsc",
    "dev": "xrun build && node dist/dev-proxy.js",
    "start": "xrun build && node dist/dev-proxy.js"
  }
}
```

## Container Management

### Intelligent Container Sizing

The demo server implements intelligent container sizing based on FynApp content requirements:

**Container Size Categories:**

1. **Standard FynApps** (fynapp-1, fynapp-1-b, fynapp-2): `min-height: 200px`
   - Simple demo applications with basic functionality
   - Compact display for quick overview

2. **Framework Demos** (fynapp-3, fynapp-4, fynapp-5, fynapp-7): `min-height: 350px`
   - Framework-specific implementations
   - More space for framework-specific features

3. **Complex Applications** (fynapp-6-react): `min-height: 80vh`
   - Dashboard applications with multiple sections
   - Tab navigation, charts, data tables
   - Full application experience

### Responsive Container Implementation

```css
/* Base container styles */
.fynapp-card {
  transition: all 0.3s ease;
  box-shadow: 0 8px 25px rgba(0,0,0,0.1);
  border-left: 4px solid;
  padding: 1rem;
}

.fynapp-card:hover {
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* Dynamic border colors based on FynApp */
[data-border-color="fynapp-1"] { border-left-color: var(--fynapp-1) !important; }
[data-border-color="fynapp-2"] { border-left-color: var(--fynapp-2) !important; }
[data-border-color="fynapp-6"] { border-left-color: var(--fynapp-6) !important; }
```

### Container Configuration in Template

```html
<!-- Standard FynApp Container -->
<div id="{{ app.id }}"
     class="loading-spinner card fynapp-card text-{{ app.color }}"
     style="min-height: 350px; box-shadow: 0 8px 25px rgba(0,0,0,0.1); border-left: 4px solid; padding: 1rem;"
     data-border-color="{{ app.color }}">
</div>

<!-- Complex Application Container (Special handling for fynapp-6) -->
{% if app.id == "fynapp-6-react" %}
<div id="{{ app.id }}"
     class="loading-spinner card fynapp-card text-{{ app.color }}"
     style="min-height: 80vh; box-shadow: 0 8px 25px rgba(0,0,0,0.1); border-left: 4px solid; padding: 0;"
     data-border-color="{{ app.color }}">
</div>
{% endif %}
```

## Development Server

### Proxy Server Implementation

```typescript
// src/dev-proxy.ts
import { startDevProxy } from "./proxy";
import * as Path from "node:path";

// Determine environment-specific file paths
const isProduction = process.env.NODE_ENV === "production";
const federationJsPath = isProduction
  ? Path.join(__dirname, "../node_modules/federation-js/dist/federation-js.min.js")
  : Path.join(__dirname, "../node_modules/federation-js/dist/federation-js.js");

// Start the development proxy with all FynApp mappings
startDevProxy([
  // Static files
  [{ path: "/" }, { protocol: "file", path: Path.join(__dirname, "../public") }],
  [{ path: "/node_modules" }, { protocol: "file", path: Path.join(__dirname, "../node_modules") }],

  // Federation and kernel files
  [{ path: "/federation-js/dist/federation-js.js" }, { protocol: "file", path: federationJsPath }],
  [{ path: "/federation-js" }, { protocol: "file", path: Path.join(__dirname, "../node_modules/federation-js") }],
  [{ path: "/core/kernel" }, { protocol: "file", path: Path.join(__dirname, "../../../core/kernel") }],

  // FynApp mappings
  [{ path: "/fynapp-design-tokens" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-design-tokens") }],
  [{ path: "/fynapp-react-middleware" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-middleware") }],
  [{ path: "/fynapp-1" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-1") }],
  [{ path: "/fynapp-1-b" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-1-b") }],
  [{ path: "/fynapp-2-react18" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-2-react18") }],
  [{ path: "/fynapp-3-marko" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-3-marko") }],
  [{ path: "/fynapp-4-vue" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-4-vue") }],
  [{ path: "/fynapp-5-preact" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-5-preact") }],
  [{ path: "/fynapp-6-react" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-6-react") }],
  [{ path: "/fynapp-7-solid" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-7-solid") }],
  [{ path: "/fynapp-react-18" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-18") }],
  [{ path: "/fynapp-react-19" }, { protocol: "file", path: Path.join(__dirname, "../../fynapp-react-19") }],
]);
```

### Hot Reloading

The development server supports hot reloading of templates:

1. **Template Changes**: Automatically detected and recompiled
2. **CSS Changes**: Tailwind CSS recompilation on source changes
3. **FynApp Changes**: Live reload when FynApp builds change
4. **Configuration Changes**: Template data and structure updates

## Build Process

### Development Workflow

```bash
# Start development server
fyn dev

# Build templates only
fyn build:templates

# Build everything
fyn build

# Production build
NODE_ENV=production fyn build
```

### Build Steps

1. **Template Compilation**: Nunjucks templates → HTML
2. **TypeScript Compilation**: TypeScript → JavaScript
3. **CSS Processing**: Input CSS → Tailwind CSS
4. **Asset Optimization**: Minification and optimization (production)

### Environment-Specific Features

**Development Mode:**
- Non-minified assets
- Source maps enabled
- Hot reloading
- Debug logging
- Development federation scripts

**Production Mode:**
- Minified assets
- No source maps
- Optimized builds
- Production federation scripts
- Template caching

## Performance Considerations

### Template Performance

- **Build-Time Generation**: Templates compiled to static HTML
- **Caching**: Nunjucks template caching in production
- **Minimal Runtime**: No template processing during page load
- **Component Reuse**: Efficient template component structure

### Container Performance

- **CSS Transitions**: Smooth container interactions
- **Lazy Loading**: FynApps loaded as needed
- **Efficient Rendering**: Minimal DOM manipulation
- **Memory Management**: Proper cleanup of FynApp instances

### Development Performance

- **Incremental Builds**: Only changed templates recompiled
- **Fast Startup**: Quick development server initialization
- **Efficient Proxy**: Minimal proxy overhead
- **Resource Optimization**: Efficient file serving

## Middleware Integration

### Loading Sequence

The demo server implements a specific loading sequence for optimal middleware functionality:

1. **Design Tokens Middleware**: Load first for theme capabilities
2. **React Versions**: Load React 18/19 shared modules
3. **Component Libraries**: Load shared component FynApps
4. **React Context Middleware**: Load for cross-app state sharing
5. **Consumer FynApps**: Load applications that use middleware

### Middleware Demonstration

The demo server showcases multiple middleware examples:

- **Design Tokens**: Theme switching and consistent styling
- **React Context**: Shared state across React applications
- **Custom Middleware**: Examples of custom functionality sharing

## Future Enhancements

### Advanced Features

- **Dynamic Configuration**: Runtime FynApp configuration
- **A/B Testing**: Template variants for feature testing
- **Analytics Integration**: User interaction tracking
- **Performance Monitoring**: Real-time performance metrics

### Developer Experience

- **Live Editing**: In-browser template editing
- **Visual Designer**: Drag-and-drop container layout
- **Debug Tools**: Enhanced debugging capabilities
- **Documentation Generator**: Automatic API documentation

### Production Features

- **CDN Integration**: Asset delivery optimization
- **Caching Strategies**: Advanced caching mechanisms
- **Load Balancing**: Multi-instance deployment
- **Monitoring**: Production monitoring and alerting

## Best Practices

### Template Development

- **Component Separation**: Keep components focused and reusable
- **Data Validation**: Validate template data thoroughly
- **Error Handling**: Graceful degradation for missing data
- **Performance**: Minimize template complexity

### Container Management

- **Responsive Design**: Support multiple screen sizes
- **Accessibility**: Ensure proper accessibility features
- **Performance**: Optimize container rendering
- **Flexibility**: Support various FynApp requirements

### Development Workflow

- **Version Control**: Proper template versioning
- **Testing**: Comprehensive template testing
- **Documentation**: Clear documentation for all components
- **Standards**: Consistent coding standards

## Conclusion

The FynMesh Demo Server provides a sophisticated and flexible platform for demonstrating micro frontend capabilities. With its Nunjucks template system, intelligent container management, and comprehensive middleware integration, it serves as both a development tool and a showcase for FynMesh's capabilities.

The architecture supports rapid development, easy maintenance, and scalable deployment, making it an essential component of the FynMesh ecosystem. The template system provides the flexibility needed for complex demonstrations while maintaining simplicity for everyday development tasks.
