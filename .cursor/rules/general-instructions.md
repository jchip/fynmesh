# General Rules for Cursor

- When running commands and doing `cd`, always use full path. Always use `~` to refer to user's home directory.
- Use `fyn` instead npm.
  - add dependencies: `fyn add`
  - add devDependencies: `fyn add --dev`
  - add a package from the local colo-repo: use path to the package such as `fyn add ../../core/kernel`
  - install: `fyn` or `fyn install` or force install `fyn install --force-install`
- Use `xrun` to run npm scripts
  - run npm script: `xrun <script>`
  - run multiple scripts serially: `xrun -s <script1> <script2> ...`
  - run multiple scripts concurrently: `xrun <script1> <script2> ...`
  - append extra args to script: `xrun <script1> -- arg1 --opt1`
- Never automatically jump to implement tests until prompted to do so.
- To build all changed packages in the colo-repo, cd to the repo's root dir, and run `fyn bootstrap`

# Colo-repo Structure

```
~/dev/fynmesh/
├── core/
│   └── kernel/                    # FynMesh kernel implementation
│       └── design/                # Architecture and design documents
├── demo/                          # Example FynApps and demonstrations
│   ├── fynapp-1/                  # Basic demo FynApp
│   ├── fynapp-react-middleware/   # React middleware provider
│   ├── fynapp-react-18/           # React 18 example
│   ├── fynapp-react-19/           # React 19 example
│   ├── regular-react-app/         # Non-federated React app
│   ├── demo-server/               # Development server
│   └── MIDDLEWARE-DEMO.md         # Middleware usage examples
├── rollup-federation/             # Federation tooling and samples
│   ├── federation-js/             # Core federation library
│   ├── rollup-plugin-federation/  # Rollup plugin for federation
│   └── sample-react-federation*/  # Federation examples
├── demo-rollup-externals/         # External dependency examples
├── dev-tools/                     # Development utilities
│   ├── create-fynapp/             # FynApp project generator and development assistant
│   └── rollup-wrap-plugin/        # Rollup wrapper plugin
├── .cursor/
│   └── rules/                     # Development rules and guidelines
├── package.json                   # Root package.json (mono-repo)
├── fynpo.json                     # Fynpo mono-repo configuration
└── fyn-lock.yaml                  # Dependency lock file
```

## Key Paths for Development

- **Kernel**: `~/dev/fynmesh/core/kernel/` - Core FynMesh implementation
- **Architecture Docs**: `~/dev/fynmesh/core/kernel/design/` - FynMesh architecture and design documents
- **Demo FynApps**: `~/dev/fynmesh/demo/` - Example applications and middleware
- **Federation Tools**: `~/dev/fynmesh/rollup-federation/` - Module federation utilities
- **Dev Tools**: `~/dev/fynmesh/dev-tools/` - Development utilities (create-fynapp, rollup-wrap-plugin)
- **Rules**: `~/dev/fynmesh/.cursor/rules/fynmesh-development.md` - Development guidelines
- **Middleware Examples**: `~/dev/fynmesh/demo/MIDDLEWARE-DEMO.md` - Middleware usage patterns

## Common Package References

When adding local dependencies, use these relative paths:

- From demo FynApp to kernel: `../../core/kernel`
- Between demo FynApps: `../other-fynapp/`
- To federation tools: `../../rollup-federation/federation-js`
