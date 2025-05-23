# FynMesh - Micro-Frontend Framework with Module Federation

FynMesh is a micro-frontend framework built using Rollup's Module Federation plugin to enable seamless sharing of code between independently deployed applications. The repository is organized as a colorepo managed with [fynpo](https://jchip.github.io/fynpo/).

## Overview

FynMesh allows you to:

- Build independent micro-frontends with their own deployment lifecycle
- Share components and logic between applications using Module Federation
- Efficiently handle shared dependencies to avoid duplicate loading
- Integrate applications seamlessly at runtime

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

## Project Structure

This is a colorepo managed with [fynpo](https://jchip.github.io/fynpo/):

- `core/kernel/` - Main kernel implementation for loading and managing fynapps
- `rollup-federation/` - Core federation implementation <https://github.com/jchip/rollup-federation>
- `demo/` - Example applications demonstrating the framework in action with various frontend frameworks
- `dev-tools/` - Development tools including create-fynapp for scaffolding new fynapps
- `misc/` - Miscellaneous utilities and examples

## Key Features

- **Runtime Module Sharing**: Load modules from other applications at runtime
- **Shared Dependency Management**: Smart loading of shared dependencies with version matching
- **Flexible Architecture**: Support for various micro-frontend patterns
- **Framework Agnostic**: Support for React, Vue, Marko, Preact, Solid, and more
- **Development Tooling**: CLI tools for creating and managing fynapps

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

## Colorepo Structure

This project uses a colorepo structure to manage multiple packages:

- Each package can be developed and deployed independently
- Shared dependencies are managed efficiently by fyn
- Packages can import from each other easily within the colorepo
- The kernel provides runtime integration between independently deployed fynapps

## Key Technologies

- **Module Federation**: Used for sharing code between independently deployed applications
- **Rollup**: Build tool used for bundling fynapps
- **TypeScript**: The primary language used throughout the codebase
- **Various Frontend Frameworks**: Support for React, Vue, Marko, Preact, and Solid

## Documentation

For more detailed documentation on how to use FynMesh, please check the documentation within each module.

## License

[Apache 2.0](LICENSE)
