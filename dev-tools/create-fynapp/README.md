# FynApp CLI Tools

This package provides two command-line tools for working with FynApps:

1. `create-fynapp` - For creating new FynApps
2. `cfa` - For ongoing FynApp development and maintenance

## Installation

To install the tools globally:

```bash
cd dev-tools/create-fynapp
npm run install-cfa
```

## Usage

### Creating a New FynApp

Create a new FynApp using either of these methods:

```bash
# Using the create-fynapp command
create-fynapp --name my-app --framework react

# Or using npm create
npm create fynapp -- --name my-app --framework react
```

Options:
- `--name, -n`: Name for the new FynApp
- `--framework, -f`: Framework to use (react, vue, preact, solid, marko)
- `--dir, -d`: Target directory (relative to demo/)
- `--skip-install`: Skip dependency installation

### Ongoing Development with cfa

The `cfa` command provides several subcommands for working with existing FynApps. Navigate to your FynApp directory and run commands from there:

#### Build a FynApp

```bash
# Navigate to your FynApp directory
cd path/to/your/fynapp

# Run the build command
cfa build
```

Options:
- `--dir, -d`: Target directory (defaults to current directory)
- `--watch, -w`: Watch mode - rebuild on changes
- `--minify, -m`: Minify output

#### Update Dependencies

```bash
# In your FynApp directory
cfa update
```

Options:
- `--dir, -d`: Target directory (defaults to current directory)
- `--check-only`: Only check for updates, don't update

#### Manage Configuration

```bash
# View configuration
cfa config

# Extract configuration from files
cfa config -a extract

# Set a configuration value
cfa config -a set -k buildOptions.minify -v true
```

Options:
- `--dir, -d`: Target directory (defaults to current directory)
- `--action, -a`: Action to perform (view, extract, set)
- `--key, -k`: Configuration key (for set action)
- `--value, -v`: Configuration value (for set action)

## Development & Testing

### Running Tests

```bash
# Run Jest test suite
fyn jest-test

# Run manual AST config manager test
node test-utils/test-ast.js
```

### Test Utils

The `test-utils/` directory contains manual testing scripts and utilities:

- **`test-ast.js`** - Manual test for AST-based configuration management
- **`README.md`** - Documentation for test utilities

### AST Config Manager

The project includes an AST-based configuration management system for programmatically modifying rollup federation configs while preserving formatting and comments.

## Configuration

FynApp configurations are stored in `~/.fynmesh/fynapps/` for persistent management across sessions.