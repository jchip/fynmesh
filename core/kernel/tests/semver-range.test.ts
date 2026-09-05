import { describe, it, expect } from "vitest";
import { compareVersions, isSupportedRange, satisfiesRange, maxSatisfying } from "../src/semver-range";

/**
 * FYM-321 - the range matcher behind middleware version resolution.
 *
 * Scope is deliberately the ranges create-fynapp's `genId` emits (a package.json
 * dependency range) and no more; see the module header for why federation-js's
 * implementation could not be used from the browser bundle.
 */
describe("semver-range", () => {
  describe("compareVersions", () => {
    it("orders by major, minor, then patch", () => {
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
      expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
      expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    });

    it("sorts a prerelease below its release", () => {
      expect(compareVersions("2.0.0-beta.1", "2.0.0")).toBe(-1);
      expect(compareVersions("2.0.0-beta.2", "2.0.0-beta.10")).toBe(-1);
      expect(compareVersions("2.0.0-alpha", "2.0.0-beta")).toBe(-1);
    });

    it("sorts anything unparseable below everything, so junk cannot win", () => {
      expect(compareVersions("not-a-version", "0.0.1")).toBe(-1);
      expect(compareVersions("0.0.1", "not-a-version")).toBe(1);
    });
  });

  describe("isSupportedRange", () => {
    it("accepts the range shapes a package.json dependency uses", () => {
      for (const range of ["*", "", "1.2.3", "^1.2.3", "~1.2", "^1", ">=1.0.0 <2.0.0", "1.x", "^1.0.0 || ^2.0.0"]) {
        expect(isSupportedRange(range), range).toBe(true);
      }
    });

    it("rejects specs that are not ranges, rather than treating them as unsatisfiable", () => {
      // the distinction is the point: "not a range" and "no version matches"
      // are different diagnostics for whoever is reading the console
      for (const spec of ["workspace:*", "file:../x", "latest", "git+https://x/y.git", "1.0.0 - 2.0.0"]) {
        expect(isSupportedRange(spec), spec).toBe(false);
      }
    });
  });

  describe("satisfiesRange", () => {
    it("matches caret ranges", () => {
      expect(satisfiesRange("1.5.0", "^1.2.3")).toBe(true);
      expect(satisfiesRange("1.2.2", "^1.2.3")).toBe(false);
      expect(satisfiesRange("2.0.0", "^1.2.3")).toBe(false);
    });

    it("treats caret on 0.x as minor-locked, per semver", () => {
      expect(satisfiesRange("0.2.9", "^0.2.3")).toBe(true);
      expect(satisfiesRange("0.3.0", "^0.2.3")).toBe(false);
      expect(satisfiesRange("0.0.4", "^0.0.3")).toBe(false);
    });

    it("matches tilde ranges", () => {
      expect(satisfiesRange("1.2.9", "~1.2.3")).toBe(true);
      expect(satisfiesRange("1.3.0", "~1.2.3")).toBe(false);
    });

    it("matches comparators, conjunctions and alternatives", () => {
      expect(satisfiesRange("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
      expect(satisfiesRange("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
      expect(satisfiesRange("2.1.0", "^1.0.0 || ^2.0.0")).toBe(true);
    });

    it("treats a partial version as the range it implies", () => {
      expect(satisfiesRange("1.9.9", "1")).toBe(true);
      expect(satisfiesRange("2.0.0", "1")).toBe(false);
      expect(satisfiesRange("1.2.9", "1.2")).toBe(true);
      expect(satisfiesRange("1.3.0", "1.2")).toBe(false);
    });

    it("matches everything for a wildcard, and nothing for junk", () => {
      expect(satisfiesRange("9.9.9", "*")).toBe(true);
      expect(satisfiesRange("9.9.9", "")).toBe(true);
      expect(satisfiesRange("not-a-version", "*")).toBe(false);
      expect(satisfiesRange("1.0.0", "workspace:*")).toBe(false);
    });
  });

  describe("maxSatisfying", () => {
    it("returns the highest match, not the first", () => {
      expect(maxSatisfying(["1.0.0", "1.2.3", "1.1.0"], "^1.0.0")).toBe("1.2.3");
    });

    it("returns undefined when nothing matches", () => {
      expect(maxSatisfying(["1.0.0", "2.0.0"], "^3.0.0")).toBeUndefined();
      expect(maxSatisfying([], "^1.0.0")).toBeUndefined();
    });
  });
});
