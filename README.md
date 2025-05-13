# FynMesh - Micro-Frontend Framework with Module Federation

FynMesh is a micro-frontend framework built using Rollup's Module Federation plugin to enable seamless sharing of code between independently deployed applications.

## Overview

FynMesh allows you to:
- Build independent micro-frontends with their own deployment lifecycle
- Share components and logic between applications using Module Federation
- Efficiently handle shared dependencies to avoid duplicate loading
- Integrate applications seamlessly at runtime

## Project Structure

This is a colorepo managed with [fynpo](https://jchip.github.io/fynpo/):

- `rollup-federation/` - Core federation implementation <https://github.com/jchip/rollup-federation>
- `demo/` - Example applications demonstrating the framework in action

## Key Features

- **Runtime Module Sharing**: Load modules from other applications at runtime
- **Shared Dependency Management**: Smart loading of shared dependencies with version matching
- **Flexible Architecture**: Support for various micro-frontend patterns

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



## Colorepo Structure

This project uses a colorepo structure to manage multiple packages:

- Each package can be developed and deployed independently
- Shared dependencies are managed efficiently by fyn
- Packages can import from each other easily within the colorepo

## Documentation

For more detailed documentation on how to use FynMesh, please check the documentation within each module.

## License

[Apache 2.0](LICENSE)