import process from "node:process";

/** The subset of the environment this module reads. */
export type BuildEnv = Record<string, string | undefined>;

/**
 * Whether a FynApp build should emit source maps.
 *
 * Development builds emit them. Production builds do not -- and the reason is
 * not just size. Emitting a map also stamps a `//# sourceMappingURL=` comment
 * into every chunk, and the demo site publish deliberately drops `.map` files
 * on the way out (see `build-demo-site.mts`). A production build that emitted
 * maps therefore ships JavaScript pointing at files that are not deployed, so
 * the fix has to be here, at generation, rather than a filter on the copy.
 *
 * `FYNMESH_SOURCEMAP` overrides the `NODE_ENV` default in both directions. `1`
 * puts maps back into a production build -- the case that matters is debugging
 * the minified demo site locally, where the production bundle is the artifact
 * under investigation. `0` takes them out of a development build.
 *
 * @param env - environment to read; defaults to the live process environment,
 *   read per call rather than frozen at import time so a build script can set
 *   the variable before invoking rollup.
 * @returns true if the build should emit source maps.
 */
export function shouldEmitSourceMap(env: BuildEnv = process.env): boolean {
  const override = env.FYNMESH_SOURCEMAP;
  if (override !== undefined && override !== "") {
    const off = override.toLowerCase();
    return off !== "0" && off !== "false";
  }
  return (env.NODE_ENV || "development") !== "production";
}
