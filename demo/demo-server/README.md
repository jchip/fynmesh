# FynMesh Demo Server

The demo server provides local development and GitHub Pages deployment for the FynMesh micro-frontend demo.

## Table of Contents

- [Local Development](#local-development)
- [GitHub Pages Deployment](#github-pages-deployment)
- [Build Scripts](#build-scripts)
- [Project Structure](#project-structure)

## Local Development

### Prerequisites

- Node.js v24.x or later
- `fyn` package manager installed globally

### Setup

1. Bootstrap the project from the root:
   ```bash
   cd ~/dev/fynmesh
   fyn bootstrap
   ```

2. Start the development server:
   ```bash
   # From the root directory
   fyn start
   
   # Or directly from demo-server
   cd demo/demo-server
   fyn start
   ```

3. Open your browser:
   - Main Demo: http://localhost:3000
   - Shell Demo: http://localhost:3000/shell.html
   - HTTPS: https://localhost:3443

### Development Server Features

- **Hot Template Reloading**: Templates are rebuilt on server start
- **Development Proxy**: Routes requests to FynApp packages during development
- **Module Federation**: Dynamically loads micro-frontends at runtime
- **Multi-Framework Support**: Serves React 18/19, Vue, Preact, Solid, Svelte, and Marko apps
- **Shell Middleware Demo**: Dynamic FynApp loading with multi-region layout

### Demo Pages

| URL | Description |
|-----|-------------|
| `/` | Main demo with all FynApps displayed in a grid layout |
| `/shell.html` | Shell middleware demo with dynamic loading and multi-region layout |

#### Main Demo (`/`)
The main demo page displays all FynApps in a scrollable grid:
- FynApp 1 & 1-B (React 19) - Design tokens theme selection
- FynApp 2 (React 18) - Middleware consumer example
- FynApp 3 (Marko), 4 (Vue), 5 (Preact), 6 (React), 7 (Solid), 8 (Svelte) - Framework demos

#### Shell Demo (`/shell.html`)
Interactive shell middleware demo with:
- **Dynamic FynApp Loading**: Click sidebar items to load FynApps into the main region
- **Multi-Region Layout**: Header, sidebar, main content, footer regions
- **Load Controls**: Dropdown to select FynApp and target region
- **Status Tracking**: Shows loaded FynApps count and individual load status
- **Footer Info**: Current FynApp name, version, kernel version, middleware count

## GitHub Pages Deployment

The demo site is deployed to GitHub Pages using a **manual workflow** with the `gh-pages` branch.

### Deployment Architecture

- **Branch**: `gh-pages` (separate from `main`)
- **Output Directory**: `/docs` (at repository root)
- **Base Path**: Auto-detected at runtime
  - `https://www.fynetiq.com/` → `/` (custom domain, root path)
  - `https://jchip.github.io/fynmesh/` → `/fynmesh/` (GitHub Pages, subdirectory)
- **Live URLs**: 
  - Custom Domain: https://www.fynetiq.com/
  - GitHub Pages: https://jchip.github.io/fynmesh/
- **Custom Domain**: Configured via CNAME file

#### Path Prefix Auto-Detection

The demo site automatically detects the correct path prefix based on the domain:

- **Custom Domain** (`www.fynetiq.com` or `fynetiq.com`): Uses `/` as the base path
- **GitHub Pages** (`*.github.io`): Extracts repo name from pathname (e.g., `/fynmesh/`)
- **Fallback**: Uses build-time configured path prefix

This allows the same build to work on both the custom domain and GitHub Pages URL without rebuilding.

### Deployment Steps

#### 1. Build All FynApps

First, ensure all FynApps are built with production settings:

```bash
# From repository root
cd ~/dev/fynmesh
NODE_ENV=production fyn bootstrap
```

This builds all packages in production mode with optimizations.

#### 2. Run the Deployment Script

**Important**: You must be on the `main` branch before running this command.

```bash
cd demo/demo-server
xrun gh-publish
```

**What `gh-publish` does:**

1. **Builds the demo site in `main` branch** using `build-demo-site` task
   - Renders HTML templates with production settings
   - Copies all FynApp `dist/` directories to `../../.temp/docs/`
   - Copies static assets (system.js, sw.js, etc.)
   - Copies dependencies (kernel, federation-js, spectre.css)
   - Uses `.temp/docs` to avoid conflicts with git-tracked `docs/` on `gh-pages`

2. **Switches to `gh-pages` branch**: `git checkout gh-pages`
   - `.temp/docs` persists because `.temp` is in `.gitignore`

3. **Replaces old docs**: 
   - Deletes old `docs/` directory: `rm -rf ../../docs`
   - Moves new build: `mv ../../.temp/docs ../../docs`

4. **Commits changes**: 
   - Force adds docs directory with `git add -f ../../docs` (needed because it's gitignored on `main`)
   - Commits with message "update demo site to gh pages MM/DD/YYYY HH:MM" (timestamp auto-generated)

#### 3. Push to GitHub

```bash
git push
```

This pushes the `gh-pages` branch to GitHub, which triggers GitHub Pages to update the live site.

### Manual Deployment Workflow

```bash
# Complete deployment workflow (must start on main branch)
cd ~/dev/fynmesh

# 0. Ensure you're on main branch
git checkout main

# 1. Build all packages in production mode
NODE_ENV=production fyn bootstrap

# 2. Build demo site and switch to gh-pages branch with docs
cd demo/demo-server
xrun gh-publish

# 3. Push to GitHub (you'll be on gh-pages branch after step 2)
git push

# 4. Switch back to main branch for development
git checkout main
```

### Deployment History

You can view deployment history by checking the `gh-pages` branch:

```bash
git checkout gh-pages
git log
```

Example commits:
- `update demo site to gh pages 10/22/2025 21:02`
- `update demo site to gh pages 08/04/2025 21:27`
- `Update CNAME`

## Build Scripts

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `compile` | `tsc` | Compile TypeScript to JavaScript |
| `build:templates` | `xrun build-templates` | Build HTML templates for local dev |
| `build` | `xrun build:templates compile` | Build templates and compile TypeScript |
| `start` | `xrun build:templates && tsx src/dev-proxy.ts` | Start development server |
| `dev` | `xrun build:templates && tsc -w` | Watch mode for development |

### xrun Tasks

Custom xrun tasks are defined in `xrun-tasks.ts`:

#### `build-templates`
Builds HTML templates for **local development** with `/` base path.

```bash
xrun build-templates
```

- **Template Engine**: Nunjucks
- **Output**: `public/index.html`
- **Path Prefix**: `/` (local development)
- **Script**: `scripts/build-templates.mts`

#### `build-demo-site`
Builds the complete demo site for **GitHub Pages** deployment.

```bash
xrun build-demo-site
```

- **Output**: `../../.temp/docs/` (temporary build location)
- **Path Prefix**: `/fynmesh/` (GitHub Pages subdirectory path, auto-detected at runtime)
- **Includes**:
  - Rendered HTML templates
  - All FynApp `dist/` directories
  - Static assets (system.js, sw.js, sw-utils.js)
  - Dependencies (kernel, federation-js, spectre.css)
  - CNAME file (for custom domain: `www.fynetiq.com`)
- **Script**: `scripts/build-demo-site.mts`

#### `gh-publish`
Complete GitHub Pages deployment workflow.

**Prerequisites**: Must be run from `main` branch.

```bash
xrun gh-publish
```

**Steps executed:**
1. `build-demo-site` - Build demo site in `main` branch to `../../.temp/docs/`
2. `git checkout gh-pages` - Switch to deployment branch (`.temp/docs` persists)
3. `rm -rf ../../docs` - Remove old docs from `gh-pages`
4. `mv ../../.temp/docs ../../docs` - Move freshly built docs to final location
5. `git add -f ../../docs` - Force add docs directory (requires -f because it's gitignored on `main`)
6. `git commit -m "update demo site to gh pages MM/DD/YYYY HH:MM"` - Commit with auto-generated timestamp

**After running this:**
- You will be on `gh-pages` branch
- You must manually `git push` to deploy
- Switch back to `main` with `git checkout main`

**Why `.temp/docs` is used:**
- `docs/` is in `.gitignore` to keep it out of the `main` branch
- But `gh-pages` has `docs/` committed (using `-f` flag)
- When switching branches, git restores tracked files from the target branch
- So switching to `gh-pages` would overwrite a fresh build with the old committed version
- Building to `.temp/docs` (which is also gitignored) preserves the fresh build during branch switch

## Project Structure

```
demo/demo-server/
├── src/
│   ├── dev-proxy.ts         # Development proxy server entry point
│   └── proxy.ts             # Redbird proxy configuration
├── scripts/
│   ├── build-templates.mts  # Local development template builder
│   └── build-demo-site.mts  # GitHub Pages site builder
├── templates/
│   ├── pages/
│   │   └── index.html       # Main page template (Nunjucks)
│   ├── layouts/
│   │   └── base.html        # Base layout template
│   └── components/
│       ├── fynapp-loader.html  # FynApp loading logic
│       └── styles.html      # Shared styles component
├── public/
│   ├── index.html           # Generated HTML (local dev)
│   ├── shell.html           # Shell middleware demo page
│   ├── system.js            # SystemJS loader
│   ├── sw.js                # Service Worker
│   └── sw-utils.js          # Service Worker utilities
├── dist/                    # Compiled TypeScript output
├── xrun-tasks.ts           # Custom build tasks
├── CNAME                   # Custom domain for GitHub Pages (www.fynetiq.com)
└── package.json            # Package configuration

../../docs/                  # GitHub Pages output (gh-pages branch)
├── index.html              # Built demo site
├── CNAME                   # Custom domain configuration
├── fynapp-*/dist/          # All FynApp bundles
├── kernel/dist/            # FynMesh kernel
├── federation-js/dist/     # Module federation runtime
└── spectre.css/            # CSS framework
```

## Template System

### Nunjucks Templates

Templates are located in `templates/` and use Nunjucks syntax for:
- Conditional rendering based on feature flags
- Dynamic FynApp list generation
- Path prefix configuration
- Production vs development modes

### Template Data

Both build scripts provide the same template data structure:

```typescript
{
  title: "FynMesh Micro Frontend Demo",
  isProduction: boolean,
  pathPrefix: string,  // "/" for local, "/" for GitHub Pages
  features: {
    "react-18": true,
    "react-19": true,
    "fynapp-1": true,
    // ... etc
  },
  fynApps: [
    { id, name, framework, color, badge },
    // ...
  ],
  infoCards: [
    { icon, title, description, color },
    // ...
  ]
}
```

## Development Workflow

### Adding a New FynApp

1. Create the FynApp in `demo/`
2. Add it to `package.json` devDependencies
3. Update both build scripts:
   - `scripts/build-templates.mts` - Add to `features` and `fynApps`
   - `scripts/build-demo-site.mts` - Add to `packages` array
4. Update `templates/components/fynapp-loader.html`
5. Run `fyn bootstrap` to build
6. Test locally with `fyn start`
7. Deploy with `xrun gh-publish && git push`

### Debugging

- Check browser console for FynApp loading errors
- Verify FynApp manifests exist: `demo/fynapp-*/dist/fynapp.manifest.json`
- Check network tab for 404s on FynApp bundles
- Review `gh-pages` branch to verify deployed files

## Troubleshooting

### FynApps Not Loading

1. Verify production build completed:
   ```bash
   ls -la demo/fynapp-*/dist/
   ```

2. Check manifest files exist:
   ```bash
   find demo -name "fynapp.manifest.json"
   ```

3. Verify deployment copied files:
   ```bash
   git checkout gh-pages
   ls -la docs/fynapp-*/dist/
   ```

### Permission Errors

If you encounter `EPERM` errors during local development:
- Use `lsof -i :PORT` to find processes using ports
- Kill processes with `kill PID`
- The dev server uses ports 3000 (HTTP) and 3443 (HTTPS)

### GitHub Pages Not Updating

1. Verify push succeeded:
   ```bash
   git log --oneline -5
   ```

2. Check GitHub repository Settings → Pages
3. Wait a few minutes for GitHub Pages to rebuild
4. Clear browser cache and reload

## See Also

- [FynMesh Main README](../../README.md)
- [Middleware Demo Guide](../MIDDLEWARE-DEMO.md)
- [Service Worker Documentation](SERVICE_WORKER.md)

