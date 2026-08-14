/**
 * Reserved property names for terser's property mangler.
 *
 * The browser kernel is minified with `mangle.properties`, which renames every
 * property it sees. That is only safe if every name that crosses the bundle's
 * boundary is held back, so the list is *derived* rather than hand-maintained:
 * a name is reserved when it appears in a public type declaration, either the
 * kernel's own or that of an external package the kernel interoperates with.
 *
 * Deriving it means new public API is protected the moment it is declared —
 * the failure mode of a hand-written list is a silently renamed API, which no
 * unit test catches because tests run against `src`, not the bundle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Modules re-exported by `src/index.ts`. Their declarations describe everything
 * an importer of `@fynmesh/kernel` can touch, including the shapes FynApps and
 * middleware construct and hand back to the kernel.
 */
const PUBLIC_MODULES = [
  "index",
  "types",
  "use-middleware",
  "share-scope",
  "errors",
  "observable-state",
  "middleware-state-registry",
  "fyn-bus",
  "kernel-telemetry",
];

/**
 * Names the type declarations cannot reveal.
 *
 * Everything here is a property the kernel reads off, or writes onto, an object
 * it does not own: a global, a federation container, or a value produced by
 * FynApp build tooling. Quoted accesses (`manifest["import-exposed"]`) need no
 * entry — `keep_quoted` reserves those automatically.
 */
const EXTERNAL_CONTRACT = [
  // Globals the bundle publishes or consumes.
  "fynMeshKernel",
  "Federation",
  // Injected into a FynApp's federation entry by the build tooling.
  "__FYNAPP_MANIFEST__",
  // Result of `FynUnit.initialize()`, authored by FynApps.
  "deferOk",
  // `signalMiddlewareReady` detail bag, authored by middleware.
  "share",
  "cc",
  // `cc.meta.requireReady` — read by middleware, written by no one in-repo.
  "requireReady",
  // Version map slot for an unversioned middleware registration.
  "default",
  // Members of the object published on `globalThis.fynMeshKernel` that
  // `FynMeshKernel` in types.ts does not declare. Everything it *does* declare
  // is already covered by types.d.ts above.
  //
  // The extracted modules are deliberately not all listed: only `loader`
  // and `mwMgr` are reached from outside the bundle (by
  // demo/fynapp-shell-mw/src/middleware/shell-layout.ts, which calls
  // `kernel.loader.mkRuntime()` and
  // `kernel.mwMgr.getAutoApply()`). The other five
  // fields — manifestResolver, bootstrapCoordinator, middlewareExecutor,
  // fynAppRegistry, fynAppLifecycle — are kernel-internal wiring and are left
  // manglable. Reaching for one of those from a host page is unsupported.
  "runTime",
  "setPreloadCallback",
  "tryPreload",
  "loader",
  "mwMgr",
  "mkRuntime",
  "createFynModuleRuntime",
  "getAutoApply",
];

/** Identifiers in a `.d.ts`, with comments removed so prose does not leak in. */
function identifiersIn(file) {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  return text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
}

/**
 * Public declarations live in `lib/`, emitted by `compile-lib`. Missing files
 * mean the mangler would run against a partial boundary, so fail loudly rather
 * than ship a bundle with a renamed public API.
 */
function publicDeclarations() {
  return PUBLIC_MODULES.map((name) => {
    const file = path.resolve(here, "..", "lib", `${name}.d.ts`);
    if (!fs.existsSync(file)) {
      throw new Error(
        `reserved-names: missing ${file}. Run \`compile-lib\` before \`build-dist\` — ` +
          `property mangling needs the public declarations to know what to hold back.`,
      );
    }
    return file;
  });
}

/**
 * federation-js is external at runtime, so the kernel's calls into it (and the
 * container fields it reads, such as `$E`) must keep their original names.
 */
function federationDeclarations() {
  const dir = path.resolve(here, "..", "node_modules", "federation-js", "dist");
  if (!fs.existsSync(dir)) {
    throw new Error(`reserved-names: missing ${dir}. Install dependencies before building.`);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".d.ts"))
    .map((f) => path.join(dir, f));
}

export function reservedNames() {
  const names = new Set(EXTERNAL_CONTRACT);
  for (const file of [...publicDeclarations(), ...federationDeclarations()]) {
    for (const name of identifiersIn(file)) {
      names.add(name);
    }
  }
  return [...names].sort();
}
