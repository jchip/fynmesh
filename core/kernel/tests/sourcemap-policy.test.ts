import { describe, it, expect } from "vitest";
// @ts-expect-error - plain .mjs build helper, no type declarations
import { shouldEmitSourceMap } from "../build/sourcemap-policy.mjs";

/**
 * FYM-391. The kernel bundles were four of the five files on the live demo site
 * still carrying a `//# sourceMappingURL=` comment for a `.map` the publish had
 * stripped. This pins the policy that removed them -- and pins the two cases
 * that must NOT change: an `npm publish` (NODE_ENV unset) still gets maps, and
 * FYNMESH_SOURCEMAP can put them back into a production build being debugged.
 */
describe("shouldEmitSourceMap", () => {
    it("emits maps for a development build", () => {
        expect(shouldEmitSourceMap({})).toBe(true);
        expect(shouldEmitSourceMap({ NODE_ENV: "development" })).toBe(true);
        expect(shouldEmitSourceMap({ NODE_ENV: "test" })).toBe(true);
    });

    it("keeps maps for an npm publish, which leaves NODE_ENV unset", () => {
        expect(shouldEmitSourceMap({ npm_lifecycle_event: "prepublishOnly" })).toBe(true);
    });

    it("skips maps for a production build", () => {
        expect(shouldEmitSourceMap({ NODE_ENV: "production" })).toBe(false);
    });

    it("puts maps back when FYNMESH_SOURCEMAP asks for them", () => {
        expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "1" })).toBe(true);
        expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "true" })).toBe(true);
    });

    it("takes maps away when FYNMESH_SOURCEMAP declines them", () => {
        expect(shouldEmitSourceMap({ FYNMESH_SOURCEMAP: "0" })).toBe(false);
        expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "false" })).toBe(false);
        expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "FALSE" })).toBe(false);
    });

    it("ignores an empty override and falls back to NODE_ENV", () => {
        expect(shouldEmitSourceMap({ NODE_ENV: "production", FYNMESH_SOURCEMAP: "" })).toBe(false);
        expect(shouldEmitSourceMap({ NODE_ENV: "development", FYNMESH_SOURCEMAP: "" })).toBe(true);
    });
});
