# FynMesh - Micro-Frontend Framework with Module Federation

FynMesh is a micro-frontend framework built using Rollup's Module Federation plugin to enable seamless sharing of code between independently deployed applications.

## Overview

FynMesh allows you to:
- Build independent micro-frontends with their own deployment lifecycle
- Share components and logic between applications using Module Federation
- Efficiently handle shared dependencies to avoid duplicate loading
- Integrate applications seamlessly at runtime

## Project Structure

This is a monorepo managed with [fyn](https://github.com/electrode-io/fyn) package manager:

- `rollup-federation/` - Core federation implementation
  - `federation-js/` - JavaScript implementation of the Module Federation runtime
- `demo/` - Example applications demonstrating the framework in action
  - `fynapp-1/` - Sample micro-frontend application

## Key Features

- **Runtime Module Sharing**: Load modules from other applications at runtime
- **Shared Dependency Management**: Smart loading of shared dependencies with version matching
- **Flexible Architecture**: Support for various micro-frontend patterns

## Getting Started

1. Clone the repository
2. Install fyn if you don't have it already:
   ```
   npm install -g fyn
   ```
3. Install dependencies using fyn:
   ```
   fyn bootstrap
   ```
4. Build the federation library:
   ```
   cd rollup-federation/federation-js
   fyn run build
   ```
5. Run the demo applications:
   ```
   cd demo/fynapp-1
   fyn run dev
   ```

## Configuration Example

A basic Rollup configuration with Module Federation:

```js
// rollup.config.mjs
import federation from "rollup-plugin-federation";

export default {
  // ...
  plugins: [
    federation({
      name: "my-app",
      shareScope: "fynmesh",
      filename: "app-entry.js",
      exposes: {
        "./components/Button": "./src/components/Button.tsx",
      },
      shared: {
        "react": {
          singleton: true,
          requiredVersion: "^18.0.0",
        },
      },
    }),
    // ...
  ],
};
```

## Monorepo Structure

This project uses a monorepo structure to manage multiple packages:

- Each package can be developed and deployed independently
- Shared dependencies are managed efficiently by fyn
- Packages can import from each other easily within the monorepo

## Documentation

For more detailed documentation on how to use FynMesh, please check the documentation within each module.

## License

[Apache 2.0](LICENSE)