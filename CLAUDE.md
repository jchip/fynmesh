# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Build Commands
```bash
# Install dependencies (use fyn, not npm)
fyn bootstrap                    # Development install
NODE_ENV=production fyn bootstrap # Production install

# Install federation dependency (required after bootstrap)
xrun fynmesh/install-federation build

# Build entire workspace
fynpo                    # Development build
NODE_ENV=production fynpo # Production build

# Build specific package (run from package directory)
fyn build
rollup -c  # For FynApps with rollup configuration
```

### Development Commands
```bash
# Start demo server
fyn start  # Or: cd demo/demo-server && fyn start

# Run tests (from package directory)
fyn test           # or xrun xarc/test-only
fyn coverage       # or xrun xarc/test-cov

# Documentation
fyn docs           # or xrun xarc/docs

# Create new FynApp
npm install -g create-fynapp
create-fynapp  # or cfa
```

### Common Package Scripts
- `fyn build` - Build the package
- `fyn test` - Run tests
- `fyn dev` - Development mode (usually TypeScript watch)
- `fyn start` - Start application/server

## Architecture Overview

FynMesh is an enterprise-scale Module Federation framework built on **SystemJS** that enables runtime loading and sharing of micro-frontends (FynApps) across multiple frameworks.

### Core Components

1. **Kernel** (`core/kernel/`)
   - Platform-agnostic runtime for loading FynApps
   - `FynMeshKernelCore` base class with browser/Node.js implementations
   - Manages federation setup, dependency resolution, and FynApp lifecycle
   - Entry point: `src/index.ts` auto-detects platform

2. **Rollup Federation** (`rollup-federation/`)
   - Module federation implementation based on SystemJS
   - `federation-js/` - Core runtime library
   - `rollup-plugin-federation/` - Rollup plugin for building federated modules
   - Co-located from: https://github.com/jchip/rollup-federation

3. **FynApps** (micro-frontends)
   - Self-contained applications with independent deployment
   - Standard structure:
     ```
     fynapp/
     ├── rollup.config.ts  # Federation configuration
     ├── src/
     │   ├── main.ts      # Entry with main() function
     │   └── config.ts    # FynApp metadata
     └── dist/
         ├── federation.json  # Generated metadata
         └── fynapp-entry.js # Federation entry point
     ```

### Key Concepts

**Module Federation**: FynApps share code at runtime through:
- **Exposes**: Modules this FynApp provides to others
- **Shared**: Dependencies that can be shared (React, etc.)
- **Share Scope**: "fynmesh" namespace for all shared modules

**Multi-Version Support**: Can load multiple versions of the same module:
- `fynapp-react-18/` and `fynapp-react-19/` provide different React versions
- `fynapp-x1/` and `fynapp-x1-v2/` demonstrate versioned component libraries

**Loading Process**:
1. Kernel loads federation.json metadata
2. Resolves dependency load order
3. Loads federation entry modules
4. Initializes containers and share scope
5. Bootstraps FynApps in dependency order

### Workspace Management

- **Colorepo**: Managed with `fynpo` for multi-package development
- **Package Manager**: Use `fyn` instead of npm/yarn
- **Local Dependencies**: Specified in package.json `fyn` field
- **Task Runner**: `@xarc/run` for build automation

### Framework Support

Demonstrated in `demo/` directory:
- React 18 & 19
- Vue.js
- Marko
- Preact
- Solid.js

Each framework FynApp follows the same federation pattern but with framework-specific build configurations.

## Development Tips

1. **Always use `fyn`** for package management, not npm/yarn
2. **Run `fyn bootstrap`** after cloning to set up workspace
3. **FynApp development**: Use `create-fynapp` CLI for scaffolding
4. **Federation config**: Key settings in `rollup.config.ts`:
   - `name`: Unique FynApp identifier
   - `exposes`: Modules to share
   - `shared`: Dependencies to deduplicate
5. **Testing**: Most packages use Jest with TypeScript
6. **Build output**: FynApps build to SystemJS format for runtime loading