# Test Utils

This directory contains test utilities and manual testing scripts for the create-fynapp CLI tool.

## Files

### `test-ast.js`
Manual test script for the AST-based configuration management system.

**Usage:**
```bash
# From the create-fynapp root directory
node test-utils/test-ast.js
```

**What it does:**
- Creates a sample rollup federation config
- Uses `RollupConfigManager` to modify shared dependencies
- Updates React dependencies from v19 to v18 with singleton: true
- Adds new dependencies (lodash)
- Shows before/after comparison
- Cleans up test files automatically

**Example output:**
- Shows original config
- Demonstrates AST-based modifications
- Preserves formatting and comments
- Saves modified config for inspection

## Running Tests

For automated Jest tests, use:
```bash
fyn jest-test
```

For manual testing and debugging:
```bash
node test-utils/test-ast.js
```