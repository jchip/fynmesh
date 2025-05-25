# FynMesh - Web Application Framework with Module Federation & Micro Frontends

FynMesh is a web application framework that provides advanced module federation and micro-frontend capabilities using Rollup to enable seamless sharing of code between independently deployed applications.

## Overview

FynMesh allows you to:

- Build independent micro-frontends with their own deployment lifecycle
- Share components and logic between applications using Module Federation
- Efficiently handle shared dependencies to avoid duplicate loading
- Integrate applications seamlessly at runtime
- Load multiple versions of the same module simultaneously

## Core Architecture

### 1. Kernel

The kernel is the central component of FynMesh, located in the `core/kernel` directory. It's responsible for:

- Loading and initializing fynapps (micro-frontends)
- Managing shared dependencies
- Providing runtime configuration
- Handling cross-fynapp communication

The kernel implementation is minimal but functional, focusing on the essential capabilities needed to load and manage fynapps.

### 2. FynApps

FynApps are self-contained micro-frontends that can be developed and deployed independently. Each fynapp:

- Has its own build and deployment lifecycle
- Can expose components and modules for other fynapps to consume
- Can share dependencies with other fynapps
- Follows a specific structure with manifest files and module federation entry points

## Key Features & Capabilities

FynMesh provides powerful module federation capabilities that are valuable both for micro-frontend architectures and single applications. The framework can handle multiple versions of the same federated module running simultaneously through containers that implement the same federated module name but with different underlying implementations.

**Core Features:**
- **Runtime Module Sharing**: Load modules from other applications at runtime
- **Shared Dependency Management**: Smart loading of shared dependencies with version matching
- **Framework Agnostic**: Support for React, Vue, Marko, Preact, Solid, and more
- **Development Tooling**: CLI tools for creating and managing fynapps

**Advanced Capabilities:**
- **Multi-Version Support**: Load multiple versions of the same module simultaneously
- **Dynamic Code Loading**: Load application modules on-demand to reduce initial bundle size
- **Plugin Architecture**: Build extensible applications where features can be loaded dynamically
- **Library Sharing**: Share common libraries and components across different parts of a large application
- **Code Splitting**: Advanced code splitting strategies beyond what traditional bundlers offer
- **Runtime Flexibility**: Modify application behavior without rebuilding the entire application
- **Gradual Migration**: Deploy new versions alongside existing ones
- **A/B Testing**: Run different versions for different user groups
- **Backwards Compatibility**: Maintain support for legacy versions
- **Isolated Dependencies**: Apps can use different versions of the same library
- **Version Resolution**: Automatic handling of version compatibility

**Micro-Frontend Capabilities:**
- **Flexible Architecture**: Support for various micro-frontend patterns
- **Independent Deployment**: Each fynapp has its own build and deployment lifecycle
- **Cross-App Integration**: Seamless integration of independently developed applications

**Multi Versions Demo Examples:**

In demo, there's a fynapp `fynapp-react-lib` with two versions implemented in different directories:
- `demo/fynapp-react-18/` - Provides React 18 library as a federated module
- `demo/fynapp-react-19/` - Provides React 19 library as a federated module

In demo, there's a fynapp `fynapp-x1` with two versions implemented in different directories, to provide some common React components for other fynapps to build with:
- `demo/fynapp-x1/` - Version 1 of shared component library
- `demo/fynapp-x1-v2/` - Version 2 of shared component library

These capabilities enable:
- Independent deployment cycles for different teams
- Incremental adoption of new library versions
- Complex enterprise scenarios with mixed technology stacks
- Zero-downtime migrations and rollbacks

## Project Structure

This is a colorepo managed with [fynpo](https://jchip.github.io/fynpo/) where each package can be developed and deployed independently, while being automatically interconnected locally:

- `core/kernel/` - Main kernel implementation for loading and managing fynapps
- `rollup-federation/` - Core module federation based on SystemJS co-located at <https://github.com/jchip/rollup-federation>
- `demo/` - Example applications demonstrating the framework in action with various frontend frameworks
- `dev-tools/` - Development tools including create-fynapp for scaffolding new fynapps
- `misc/` - Miscellaneous utilities and examples

**Colorepo Benefits:**
- Shared dependencies are managed efficiently by fyn
- Packages can import from each other easily within the colorepo
- The kernel provides runtime integration between independently deployed fynapps

## Getting Started

1. Clone the repository
   ```
   git clone https://github.com/jchip/fynmesh.git
   ```
   or
   ```
   git clone git@github.com:jchip/fynmesh.git
   ```
2. Install fyn if you don't have it already:
   ```
   npm install -g fyn
   ```
3. Install dependencies using fyn:
   ```
   fyn bootstrap
   ```
   for production build:
   ```
   NODE_ENV=production fyn bootstrap
   ```
4. Run the demo applications:
   ```
   fyn start
   ```

## Development Workflow

The typical workflow for developing with FynMesh includes:

1. Create a new fynapp using the `create-fynapp` tool
2. Develop the fynapp independently
3. Build and deploy the fynapp
4. Register the fynapp with the kernel
5. The kernel loads and manages the fynapp at runtime

## Key Technologies

- **Module Federation**: Used for sharing code between independently deployed applications
- **Rollup**: Build tool used for bundling fynapps
- **TypeScript**: The primary language used throughout the codebase
- **Various Frontend Frameworks**: Support for React, Vue, Marko, Preact, and Solid

## Documentation

For more detailed documentation on how to use FynMesh, please check the documentation within each module.

## License

[Apache 2.0](LICENSE)
