# FynApp CLI Tools

`create-fynapp` provides two commands:

- `create-fynapp` creates a React FynApp under a repository's `demo/` directory.
- `cfa` builds and checks an existing FynApp or installs the bundled coding-agent skills.

## Installation

Install the released commands globally with fyn:

```bash
fyn global add create-fynapp
```

If the commands are not on `PATH`, run `fyn global setup-path` and follow its
shell instructions.

To work on this package in the FynMesh monorepo:

```bash
cd dev-tools/create-fynapp
fyn install
fyn run build
```

## Create a FynApp

Run the command from the FynMesh repository root. The target is always created
under `demo/`.

```bash
create-fynapp --name my-app --framework react
```

The release scaffold supports React. Other framework demos and low-level build
configuration exist in FynMesh, but their generator templates are roadmap work.

Options:

- `--name, -n <string>`: package and federation name.
- `--framework, -f <string>`: `react`.
- `--dir, -d <string>`: directory relative to `demo/` (defaults to the name).
- `--skip-install`: create files without running `fyn install`.

The command creates `package.json`, `tsconfig.json`, `rollup.config.ts`, and
starter source files. Register a new demo app separately as described in
[`agent/GUIDE.md`](./agent/GUIDE.md).

## Work with an existing FynApp

Run `cfa` from the FynApp directory, or pass `--dir`.

### Build

```bash
cfa build
cfa build --watch
cfa build --dir demo/my-app
```

Options:

- `--dir, -d <string>`: target directory (defaults to the current directory).
- `--watch, -w`: rebuild when source files change.
- `--minify, -m`: enable minified output.

### Check build output

```bash
cfa check
cfa check --no-build
```

`cfa check` builds with the local Rollup binary, then checks for
`dist/fynapp-entry.js` and a parseable `dist/fynapp.manifest.json` with the
required identity and `./main` expose. `--no-build` checks an existing
`dist/`.

### What a build emits

`dist/` gets JSON as well as JavaScript, and the files are not interchangeable:

- **`fynapp.manifest.json`** — this FynApp's public contract: identity, `exposes`,
  `consume-shared` / `provide-shared`, `import-exposed`, `shared-providers`. Other
  FynApps' builds read it off disk to discover who provides their shared modules, so
  **build order matters** — a dependency built after its consumer leaves the consumer's
  `shared-providers` empty.
- **`__FYNAPP_MANIFEST__`** inside `fynapp-entry.js` — the same manifest embedded in the
  entry, which is how the kernel reads it without an extra request. Middleware
  registration depends on it and has no fallback.
- **`federation.json`** — build plumbing: expose-to-chunk mapping and share config. Optional;
  nothing at runtime needs it.
- **`federation.bundles.json`** — only when the build's chunks were combined into one file:
  the map of which file carries which module, which a host reads to preload the file that
  will really be fetched.
- **`__collected_shares.json`** — debug output. Nothing reads it.

Full reference, including every consumer:
[notes/BUILD-ARTIFACTS.md](https://github.com/jchip/fynmesh/blob/main/notes/BUILD-ARTIFACTS.md).

### Install coding-agent skills

```bash
cfa install-skills
cfa install-skills --dir path/to/project
cfa install-skills --force
```

This opt-in command copies the bundled `fynapp-modify` and
`fynapp-migrate-kernel` skills into `<project>/.claude/skills/`.

## Authoring references

- [FynApp guide](./agent/GUIDE.md)
- [FynApp contract](./agent/CONTRACT.md)
- [Kernel migration playbook](./agent/MIGRATION.md)
- [Curated examples](https://github.com/jchip/fynmesh/tree/main/dev-tools/create-fynapp/examples)

## Development checks

```bash
fyn run build
fyn run jest-test
```

## License

Apache-2.0
