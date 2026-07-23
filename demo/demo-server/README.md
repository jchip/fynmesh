# FynMesh Demo Server

The demo server provides local development and Cloudflare Pages deployment for the FynMesh micro-frontend demo.

## Table of Contents

- [Local Development](#local-development)
- [Cloudflare Pages Deployment](#cloudflare-pages-deployment)
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

## Cloudflare Pages Deployment

The demo site is deployed to **Cloudflare Pages**, which is connected to this repo's
`gh-pages` branch and serves the `/docs` directory. Cloudflare runs **no build** — it
publishes `docs/` as-is on every push to `gh-pages`.

### Deployment Architecture

- **Branch**: `gh-pages` — a **disposable** branch that is always the latest `main`
  plus one built `docs/` commit on top. It is **force-pushed** on every deploy, so it
  never accumulates history.
- **Output Directory**: `/docs` (at repository root) — Cloudflare Pages build output setting.
- **Cloudflare build config**: build command empty, build output `docs`, root directory empty.
- **Base Path**: Auto-detected at runtime
  - `https://www.lm360.ai/` → `/` (custom domain, root path)
  - `*.github.io/fynmesh/` → `/fynmesh/` (subdirectory, if ever served from GitHub Pages)
- **Live URL**: https://www.lm360.ai/
- **Custom Domain**: Configured in the Cloudflare Pages dashboard (no `CNAME` file).

#### Path Prefix Auto-Detection

The demo site automatically detects the correct path prefix based on the domain:

- **Custom Domain** (`www.lm360.ai` or `lm360.ai`): Uses `/` as the base path
- **GitHub Pages** (`*.github.io`): Extracts repo name from pathname (e.g., `/fynmesh/`)
- **Fallback**: Uses build-time configured path prefix

This allows the same build to work on multiple hosts without rebuilding.

### Deployment Steps

#### One command (recommended): `fyn publish-demo`

**Must be on the `main` branch.** From the repository root:

```bash
cd ~/dev/fynmesh
git checkout main
fyn publish-demo
```

`publish-demo` runs the whole pipeline **in production mode** —
`NODE_ENV=production` wrapping `clean:demo` → `build-prod` (rebuild all packages) →
`_gh-publish` (build the demo site, reset `gh-pages` to `main`, commit `docs/`, force
push). It leaves you back on a clean `main`; there is no separate `git push` step.

> ⚠️ **Always deploy with `NODE_ENV=production`.** Running `gh-publish` on its own does
> **not** set it, so `build-demo-site` renders templates in dev mode — loading
> non-minified `system.js`/`spectre.css`, verbose federation logging, and shipping
> `.map`/`.d.ts` files. Use `fyn publish-demo`, or if you must run the sub-step directly,
> prefix it: `NODE_ENV=production fyn _gh-publish`.

**What the `gh-publish` step does:**

1. **Builds the demo site** using `build-demo-site` to `../../.temp/docs/`
   (`.temp` is gitignored, so it survives the branch switch).
2. **Hard resets `gh-pages` to latest `main`**: `git checkout -B gh-pages main`.
3. **Drops the built docs onto the tree**: `rm -rf ../../docs` then
   `mv ../../.temp/docs ../../docs`.
4. **Commits**: `git add -f ../../docs` (docs is gitignored on `main`) then commits
   with an auto-generated `build demo site MM/DD/YYYY HH:MM` message.
5. **Force pushes**: `git push --force origin gh-pages` — this triggers the Cloudflare
   Pages deploy.
6. **Returns to a clean `main`**: `git checkout -f main` and removes the local `docs/`.

#### Deploy without rebuilding

If the package `dist/`s are already built in production mode and you only changed the
demo site (templates, copy list) or just want to re-push:

```bash
cd ~/dev/fynmesh
git checkout main
NODE_ENV=production fyn _gh-publish   # build demo site + reset gh-pages + force push
```

### Deploy-Only Files

Any files that must ship to the deployed site but aren't part of the demo build (e.g.
verification files) live under `demo/demo-server/` on `main` and are copied into `docs/`
by `build-demo-site.mts`. Currently this is the Google site-verification file. Cloudflare
Pages headers/redirects (`_headers`, `_redirects`) would go here too if ever needed.

### Deployment History

Because `gh-pages` is force-pushed, it holds only the latest deploy on top of `main`;
it is not a running history. Track deploys from `main` instead.

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
Builds the complete demo site for **Cloudflare Pages** deployment.

```bash
xrun build-demo-site
```

- **Output**: `../../.temp/docs/` (temporary build location)
- **Path Prefix**: `/` (base path; the runtime auto-detects per host)
- **Includes**:
  - Rendered HTML templates
  - All FynApp `dist/` directories
  - Static assets (system.js, sw.js, sw-utils.js)
  - Dependencies (kernel, federation-js, spectre.css)
  - Google site-verification file
- **Script**: `scripts/build-demo-site.mts`

#### `gh-publish`
Cloudflare Pages deployment step (reset `gh-pages`, build docs, force push).

**Prerequisites**: Must be run from `main` branch, **with `NODE_ENV=production`** — prefer
`fyn publish-demo` (sets it for the whole pipeline) over invoking this directly. Without
it, the demo site builds in dev mode (non-minified assets, source maps, verbose logging).

```bash
NODE_ENV=production fyn _gh-publish   # or: fyn publish-demo (clean + build-prod + this)
```

**Steps executed:**
1. `build-demo-site` - Build demo site to `../../.temp/docs/` (`.temp` is gitignored, so it persists across the branch switch)
2. `git checkout -B gh-pages main` - Hard reset `gh-pages` to latest `main` (creates it if missing)
3. `rm -rf ../../docs` + `mv ../../.temp/docs ../../docs` - Drop the fresh build onto the tree
4. `git add -f ../../docs` - Force add docs directory (requires -f because it's gitignored on `main`)
5. `git commit -m "build demo site MM/DD/YYYY HH:MM"` - Commit with auto-generated timestamp
6. `git push --force origin gh-pages` - Force push, which triggers the Cloudflare Pages deploy
7. `git checkout -f main` + `rm -rf ../../docs` - Return to a clean `main`

**After running this:**
- You are back on `main`; the deploy has been pushed. No manual `git push` needed.

**Why `.temp/docs` is used:**
- `docs/` is in `.gitignore` to keep it out of the `main` branch
- `build-demo-site` runs while on `main`, so it builds into `.temp/docs` (also gitignored)
- `git checkout -B gh-pages main` then resets the branch without disturbing `.temp/docs`
- The fresh build is moved into place on `gh-pages` and force-committed with `-f`

## Project Structure

```
demo/demo-server/
├── src/
│   ├── dev-proxy.ts         # Development proxy server entry point
│   └── proxy.ts             # Redbird proxy configuration
├── scripts/
│   ├── build-templates.mts  # Local development template builder
│   └── build-demo-site.mts  # Cloudflare Pages site builder
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
├── CNAME                   # Legacy GitHub Pages domain file (not deployed to Cloudflare)
└── package.json            # Package configuration

../../docs/                  # Cloudflare Pages output (gh-pages branch, force-pushed)
├── index.html              # Built demo site
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
  pathPrefix: string,  // "/" base path; runtime auto-detects per host
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
7. Deploy with `fyn publish-demo` (force-pushes `gh-pages`; no manual `git push`)

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

### Cloudflare Pages Not Updating

1. Verify the force push succeeded:
   ```bash
   git log origin/gh-pages --oneline -3
   ```

2. Check the deployment in the Cloudflare Pages dashboard (Deployments tab). Confirm the
   Production branch is `gh-pages` and the build output directory is `docs`.
3. Wait a minute for the Cloudflare deploy to finish
4. Clear browser cache and reload

## See Also

- [FynMesh Main README](../../README.md)
- [Demo Documentation](../../notes/DEMO.md)
- [Service Worker Documentation](SERVICE_WORKER.md)

