# FynMesh Demo Quick Reference

## Live URLs

| URL                                | Description           |
| ---------------------------------- | --------------------- |
| https://www.fynetiq.com/           | Landing page          |
| https://www.fynetiq.com/demo.html  | All FynApps demo      |
| https://www.fynetiq.com/shell.html | Shell middleware demo |

Alternative: https://jchip.github.io/fynmesh/

## Local Development

```bash
cd ~/dev/fynmesh
fyn bootstrap && fyn start
```

- http://localhost:3000/
- http://localhost:3000/demo.html
- http://localhost:3000/shell.html

Clean Demo build: `fyn clean:demo`

## FynApps

| FynApp             | Framework | Notes                 |
| ------------------ | --------- | --------------------- |
| fynapp-1           | React 19  | Middleware consumer   |
| fynapp-1-b         | React 19  | Design tokens         |
| fynapp-2-react18   | React 18  | Multi-version demo    |
| fynapp-3-marko     | Marko     |                       |
| fynapp-4-vue       | Vue 3     |                       |
| fynapp-5-preact    | Preact    |                       |
| fynapp-6-react     | React 19  | Dashboard UI          |
| fynapp-7-solid     | Solid.js  |                       |
| fynapp-8-svelte    | Svelte    |                       |
| fynapp-sidebar     | React 19  | Shell navigation      |
| fynapp-x1-v1       | React 18  | Shared widgets v1.0   |
| fynapp-x1-v2       | React 19  | Shared widgets v2.0   |
| fynapp-test-shared | -         | Shared module testing |

## Middleware & Library Providers

| FynApp                  | Type       | Notes                             |
| ----------------------- | ---------- | --------------------------------- |
| fynapp-design-tokens    | Middleware | Theming tokens                    |
| fynapp-react-middleware | Middleware | React Context (theme, user state) |
| fynapp-shell-mw         | Middleware | Shell layout/dynamic loading      |
| fynapp-react-18         | Library    | Exports React 18                  |
| fynapp-react-19         | Library    | Exports React 19                  |

## Middleware Demo

`fynapp-react-middleware` provides generic React Context middleware that `fynapp-1` consumes for:

- Theme management (light/dark, localStorage persistence)
- User state (authentication, sessionStorage)

See middleware config example in `demo/fynapp-1/src/config.ts`.

## Full Documentation

See [demo/demo-server/README.md](../demo/demo-server/README.md) for:

- Deployment workflow
- Build scripts
- Project structure
- Template system
- Troubleshooting

---

## Future: Large React Apps for Demo

Ideas for creating a FynApp with MB-sized JavaScript bundles to demonstrate lazy loading benefits.

| App/Library           | Bundle Size | Why It's Interesting                                                         |
| --------------------- | ----------- | ---------------------------------------------------------------------------- |
| **Monaco Editor**     | ~5-10MB     | VS Code's editor - syntax highlighting, intellisense, multi-language support |
| **Excalidraw**        | ~3-5MB      | Whiteboard/drawing app - very visual and interactive                         |
| **React Three Fiber** | ~2-4MB      | 3D graphics with Three.js - impressive demos                                 |
| **React Flow**        | ~1-2MB      | Node-based diagrams/flowcharts                                               |
| **AG Grid**           | ~3-5MB      | Enterprise data grid with all features                                       |

**Recommendation: Monaco Editor** - Shows heavy apps work as micro frontends, perfect lazy loading demo, recognizable (VS Code).

**Other Ideas:**

- PDF viewer (react-pdf) - ~2MB
- Markdown editor with live preview
- Code playground (like CodeSandbox lite)
- Chart dashboard with many visualization types

**Packages:**

- Monaco: `@monaco-editor/react`
- Excalidraw: `@excalidraw/excalidraw`
- React Three Fiber: `@react-three/fiber` + `@react-three/drei`
- React Flow: `reactflow`
- AG Grid: `ag-grid-react` + `ag-grid-community`
