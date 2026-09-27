import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { generateCacheHeaders } from "../scripts/cache-headers.mts";

/**
 * FYM-394. `immutable` promises the bytes at a url will never change, and the
 * content hash in a chunk's filename is what makes that promise keepable.
 * Rollup breaks it in one specific way: it hashes the chunk, then appends the
 * `//# sourceMappingURL=` comment. So a build that stops emitting maps changes
 * every chunk's bytes while every filename stays put, and a url already marked
 * immutable serves the old body for up to a year. That happened -- 27 of 50
 * live bundles kept serving the previous build's comment after FYM-386.
 *
 * These tests pin the rule that a chunk we cannot vouch for keeps the
 * revalidating default instead.
 */
describe("generateCacheHeaders", () => {
    let outputDir: string;
    const warnings: string[] = [];
    const warn = (m: string) => void warnings.push(m);

    /** Write a chunk into `<pkg>/<distName>/` (default `dist`). */
    const chunk = (
        pkg: string,
        name: string,
        body = "export const a = 1;\n",
        distName = "dist"
    ) => {
        const dist = path.join(outputDir, pkg, distName);
        mkdirSync(dist, { recursive: true });
        writeFileSync(path.join(dist, name), body);
    };

    const withMapComment = (name: string) =>
        `export const a = 1;\n//# sourceMappingURL=${name}.map\n`;

    beforeEach(() => {
        outputDir = mkdtempSync(path.join(tmpdir(), "fynmesh-headers-"));
        warnings.length = 0;
    });

    afterEach(() => {
        rmSync(outputDir, { recursive: true, force: true });
    });

    it("marks a sealed hashed chunk immutable", () => {
        chunk("fynapp-1", "main-0SABD0a0.js");

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).toContain("/:pkg/dist/main-*");
        expect(headers).toContain("Cache-Control: public, max-age=31536000, immutable");
        expect(warnings).toEqual([]);
    });

    it("refuses to freeze a chunk carrying a comment appended after its hash", () => {
        chunk("fynapp-1", "main-0SABD0a0.js", withMapComment("main-0SABD0a0.js"));

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("fynapp-1/dist/main-0SABD0a0.js");
        expect(warnings[0]).toContain("not marked immutable");
    });

    it("drops the stem everywhere, since one rule covers every package", () => {
        chunk("fynapp-1", "main-0SABD0a0.js");
        chunk("fynapp-6-react", "main-DWprtUVa.js", withMapComment("main-DWprtUVa.js"));
        chunk("fynapp-1", "App-CTLIHg5m.js");

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).not.toContain("/:pkg/dist/main-*");
        expect(headers).toContain("/:pkg/dist/App-*");
        expect(warnings.join("\n")).toContain("fynapp-6-react/dist/main-DWprtUVa.js");
    });

    it("does not mistake a sourceMappingURL string inside code for an appended comment", () => {
        chunk(
            "fynapp-1",
            "main-0SABD0a0.js",
            'export const re = "//# sourceMappingURL=" + name;\nexport const b = 2;\n'
        );

        expect(generateCacheHeaders(outputDir, warn)).toContain("/:pkg/dist/main-*");
        expect(warnings).toEqual([]);
    });

    it("still ignores files that are not content-hashed at all", () => {
        chunk("fynapp-1", "fynapp-entry.js");
        chunk("fynapp-1", "index.js");

        expect(generateCacheHeaders(outputDir, warn)).toBeNull();
        expect(warnings).toEqual([]);
    });

    it("returns null for an output dir that does not exist", () => {
        expect(generateCacheHeaders(path.join(outputDir, "nope"), warn)).toBeNull();
    });

    /**
     * Perf Lab suite apps ship a `dist-raw` pre-combine snapshot alongside
     * `dist` (see notes/PERF-LAB-DESIGN.md), so a warm reload in `raw` mode
     * needs its own hashed chunks cached immutably too.
     */
    it("marks a sealed hashed chunk under dist-raw immutable, as its own rule", () => {
        chunk("fynapp-analytics", "main-0SABD0a0.js", undefined, "dist-raw");

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).toContain("/:pkg/dist-raw/main-*");
        expect(headers).not.toContain("/:pkg/dist/main-*");
        expect(warnings).toEqual([]);
    });

    it("refuses to freeze a dist-raw chunk carrying a comment appended after its hash", () => {
        chunk("fynapp-analytics", "main-0SABD0a0.js", withMapComment("main-0SABD0a0.js"), "dist-raw");

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).toBeNull();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("fynapp-analytics/dist-raw/main-0SABD0a0.js");
        expect(warnings[0]).toContain("not marked immutable");
    });

    it("keeps dist and dist-raw rules independent for the same stem", () => {
        // dist has the combined build's member (sealed); dist-raw carries the
        // same stem unsealed -- each folder's rule stands on its own bytes.
        chunk("fynapp-analytics", "main-0SABD0a0.js");
        chunk("fynapp-analytics", "main-0SABD0a0.js", withMapComment("main-0SABD0a0.js"), "dist-raw");

        const headers = generateCacheHeaders(outputDir, warn);

        expect(headers).toContain("/:pkg/dist/main-*");
        expect(headers).not.toContain("/:pkg/dist-raw/main-*");
        expect(warnings.join("\n")).toContain("fynapp-analytics/dist-raw/main-0SABD0a0.js");
    });
});
