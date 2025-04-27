# Bundle ESM Share

This is a demonstration of using Rollup to bundle a package (`esm-pkg`) using SystemJS as output format while maintaining ESM module format.

## Setup

The project uses:
- Rollup for bundling
- SystemJS for module loading
- ESM module format preserved

## Development

```bash
# Install dependencies
fyn install

# Build the bundle
npm run build
```

## Usage

After building, you can:

1. View the demo page (`demo.html`) to see how the SystemJS bundle is loaded
2. Import the bundle in your own projects

## Structure

- `src/index.js` - Entry file that imports and re-exports `esm-pkg`
- `dist/` - Output directory for the bundle
- `dist/importmap.json` - SystemJS import map for external dependencies
- `rollup.config.js` - Rollup configuration