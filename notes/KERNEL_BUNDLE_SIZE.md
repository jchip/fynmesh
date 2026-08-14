# Browser kernel bundle size

Measurements are for `core/kernel/dist/fynmesh-browser-kernel.min.js`.

| | raw |
|---|---|
| before | 36,716 |
| after | 26,663 |
| delta | **−10,053 (−27.4%)** |

Measure with a **clean** build (`xrun -s clean compile-lib build-dist`). Running
`rollup -c` alone reuses a stale `lib/*.d.ts` and under-reports: the reserved
list is derived from those declarations, so a stale one reserves fewer names
than the real build.

## Where the reduction came from

1. **Property-name mangling** (~4,000 B) — terser `mangle.properties` on the
   browser bundle. This is the dominant lever; everything else is small by
   comparison.
2. **Deduplication** (~1,400 B) — shared helpers for repeated shapes: middleware
   failure construction, FynApp lifecycle event emission, the FynUnit hook walk
   shared by shutdown/suspend/resume, the three identical dependency walks in
   `buildGraph`, the manifest cache-and-report path, and the FynBus request
   error prefix.
3. **`PreloadPriority` enum → frozen const object** (~110 B) — a TS `enum`
   compiles to a runtime IIFE no bundler can drop. As a plain object the reads
   inline and the table is tree-shaken. (`KernelErrorCode` in errors.ts was
   already converted for the same reason.)
4. Internal fields (`telemetry`, `MiddlewareManager`'s registry) moved to `#private`,
   which puts them in the manglable namespace.

## How the reserved list works — read before changing the build

`build/reserved-names.mjs` derives the terser `mangle.properties.reserved` list
rather than hand-maintaining it. A name is reserved when it appears in a public
type declaration: the kernel's own (`lib/*.d.ts` for the modules re-exported by
`src/index.ts`) or federation-js's (an external runtime dependency — the kernel
reads container fields like `$E` off it).

Two consequences:

- **`compile-lib` must run before `build-dist`.** The list is read from
  `lib/*.d.ts`. The `build` script is serial for this reason; the deriver throws
  if the declarations are missing rather than silently shipping a bundle with a
  renamed public API.
- **New public API is protected automatically** the moment it is declared. This
  matters because unit tests run against `src/`, never the bundle, so they
  cannot catch a mangled-away API. Verification has to be a real browser.

`EXTERNAL_CONTRACT` in that file lists what declarations cannot reveal: globals,
build-tooling-injected fields (`__FYNAPP_MANIFEST__`), and members reached
through `globalThis.fynMeshKernel` that `FynMeshKernel` does not declare —
notably `moduleLoader` and `middlewareManager`, which
`demo/fynapp-shell-mw/src/middleware/shell-layout.ts` reaches into. The other
five module fields (`manifestResolver`, `bootstrapCoordinator`,
`middlewareExecutor`, `fynAppRegistry`, `fynAppLifecycle`) are deliberately left
manglable; reaching for one from a host page is unsupported.

Quoted keys (`manifest["import-exposed"]`) need no entry — `keep_quoted: true`
reserves them, and it is the escape hatch for anything the declarations miss.

5. **`drop_console: true`** on the minified build only (~900 B). The diagnostics
   are not lost: `fynmesh-browser-kernel.dev.js` is built from the same sources
   with no terser at all (91 console calls survive there vs 0 in the min build),
   and the demo templates serve it unless `NODE_ENV=production`. Error codes and
   context objects are untouched and still reach telemetry transports.

6. **Shortened contract names** (~660 B). `telemetry`→`tel`, `captureError`→`capErr`,
   `appsLoaded`→`apps`, `autoApplyMiddlewares`→`autoApply`, `middlewareManager`→`mwMgr`,
   `moduleLoader`→`loader`, `createFynUnitRuntime`→`mkRuntime`, `manifestUrl`→`url`.
   A breaking API change, applied across the kernel, its tests, the demo FynApps
   and dev-tools in one pass.

7. **Closure factories instead of classes** for `ManifestResolver`,
   `MiddlewareManager` and `BootstrapCoordinator` (~790 B). Each is a function
   returning an object, cast to a constructor type so `new X(...)` still works
   and reads normally at call sites. Closure variables mangle to one character
   and single-use helpers get inlined; class members can do neither. Where state
   must stay externally visible it is a Map/Array declared once and also handed
   out on the returned object — one reference, two views — with accessors only
   for reassigned primitives.

## What can and cannot be renamed

`name` and `version` look like the biggest targets (97 and 52 uses, 752 B
between them) and **cannot be touched**. They are not merely kernel API: they
are federation container fields (`container.name`, `container.version`, owned by
federation-js) and manifest JSON keys emitted by `create-fynapp`.

Note the distinction that makes renaming viable at all. Property *mangling* of
the FynApp contract is impossible — FynApps are independently built federated
bundles, so a mangled kernel would require every FynApp to be minified with a
byte-identical terser `nameCache`, defeating independent deployment. *Renaming*
is fine: the new short name is stable and declared, so independently built
FynApps compile against it normally. It is a breaking change, not an
architectural one.

## Design direction

Tight and idiomatic over ceremonial. The passes that mattered most were not
minifier tricks but deleting Java-shaped code:

- **Dead accessors.** `getNodeMeta`, `getTimeout`, `getBootstrapState`,
  `getTargetMiddlewares` (a second implementation of `util.getTargetMiddlewares`),
  `getDeferredInvokes`, `getReadyMiddleware`, `hasScannedModule`,
  `markModuleScanned`, `markBootstrapped`, `clearCache`, `isDisposed` — all had
  zero callers in src, tests and demos.
- **Deprecated twins.** `useMiddlewareOnFynModule`, `createFynModuleRuntime`,
  `invokeFynModule`, and the `fynMod` field duplicated on every call context.
- **One context builder.** `parseMiddlewareString` hand-copied the seven-field
  literal that `createMiddlewareCallContext` already builds; it now passes an
  `info` override instead.
- **Partition, not index arithmetic.** `processReadyMiddleware` collected
  indices, spliced them back-to-front to keep the indices valid, then reversed
  the result to undo that — three passes to express one filter.
- **No closure array per batch.** `loadFynAppsByName` materialised a task
  closure per key before running them; workers now share a cursor over the batch
  directly.
- **Booleans as booleans.** `checkMiddlewareReady` returned `"ready"`/`"defer"`.

Keep `const`. Do not reach for `let` to save two characters.

## Declaring a test seam costs bytes

`FynBusRoot.channels`/`facades` and `FynBusFacade.state` exist only so the
stress tests can assert leak invariants. They are carried on the returned
objects but deliberately **not** declared in the interfaces: `fyn-bus` is a
public module, so anything in its `.d.ts` is reserved from mangling. Declaring
those three cost 87 B. The tests run against `src`, where the properties exist
regardless.

The same reasoning applies anywhere else a seam is exposed — declare it only if
something outside the bundle genuinely needs the name.
