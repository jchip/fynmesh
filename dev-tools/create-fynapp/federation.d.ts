/**
 * Ambient declarations for federated module specifiers.
 *
 * A FynApp imports its remotes by specifiers like `fynapp-x1/main` or
 * `fynapp-shell-mw/middleware/shell-layout`. Those are resolved by the FynMesh
 * kernel at runtime out of the share scope -- there is nothing on disk for node
 * or TypeScript to resolve, so without this every such import is a hard
 * `TS2307: Cannot find module`.
 *
 * The shorthand form (no body) is deliberate: it makes every import from a
 * matching specifier `any`, named and type-position imports included. Giving it
 * a body with `export = any` resolves the module but still rejects named type
 * imports, which is the shape FynApps actually use.
 *
 * An ambient module name may carry at most one `*`, and it matches `/` as well,
 * so this single pattern covers every `fynapp-*` remote at any depth.
 *
 * Consumed via `files` in a FynApp's tsconfig.json, because `include` globs are
 * filtered by the default `exclude` of node_modules while `files` is not:
 *
 *   "files": ["node_modules/create-fynapp/federation.d.ts"]
 */
declare module "fynapp-*";
