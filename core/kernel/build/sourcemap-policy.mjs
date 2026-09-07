/**
 * Whether a kernel bundle should carry a source map.
 *
 * Emitting a map also stamps a `//# sourceMappingURL=` comment into the bundle,
 * and the demo site publish deliberately drops `.map` files on the way out (see
 * demo/demo-server/scripts/build-demo-site.mts). A production build that emitted
 * maps therefore ships JavaScript pointing at files that are not deployed --
 * FYM-391, where four kernel bundles and system.min.js were the last five files
 * on the live site still doing that.
 *
 * This restates create-fynapp's `shouldEmitSourceMap` rather than importing it.
 * create-fynapp devDepends on `@fynmesh/kernel`, so a dependency in the other
 * direction would close a cycle in the fynpo build order. Keep the two in step.
 *
 * An `npm publish` runs `prepublishOnly` with `NODE_ENV` unset, so the published
 * package keeps its maps exactly as it does today; only a `NODE_ENV=production`
 * build (which is what `fyn build-prod` and `fyn publish-demo` run) drops them.
 *
 * @param {Record<string, string | undefined>} [env] - environment to read;
 *   defaults to the live process environment, read per call rather than frozen
 *   at import time.
 * @returns {boolean} true if the build should emit source maps.
 */
export function shouldEmitSourceMap(env = process.env) {
  const override = env.FYNMESH_SOURCEMAP;
  if (override !== undefined && override !== "") {
    const off = override.toLowerCase();
    return off !== "0" && off !== "false";
  }
  return (env.NODE_ENV || "development") !== "production";
}
