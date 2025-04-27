# React 19 App with TypeScript and Rollup

A simple React 19 application using TypeScript and bundled with Rollup.

## Features

- React 19
- TypeScript
- Rollup for bundling
- Development server with live reloading

## Getting Started

### Prerequisites

- Node.js (recommended version 16 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install
```

### Development

To start the development server:

```bash
npm run dev
```

This will start a development server at http://localhost:3000 with live reloading.

### Building for Production

To build the application for production:

```bash
npm run build
```

This will create optimized files in the `dist` directory.

### Running the Production Build

To serve the production build:

```bash
npm start
```

## Project Structure

```
/
├── public/             # Static assets and index.html
├── dist/               # Output directory for builds (generated)
├── src/                # Source code
│   ├── components/     # React components
│   ├── App.tsx         # Main App component
│   └── index.tsx       # Application entry point
├── rollup.config.js    # Rollup configuration
└── tsconfig.json       # TypeScript configuration
```

## Notes

- This project uses `@ts-ignore` to suppress TypeScript errors related to React 19 type definitions.
- Type definitions for React 19 are not fully available yet, so we've disabled strict type checking.
- The build process copies all files from the `public` directory to the `dist` directory.