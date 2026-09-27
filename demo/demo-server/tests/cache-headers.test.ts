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

    /**
     * Pages' asset default is `max-age=14400, must-revalidate`, and
     * `must-revalidate` only applies once those four hours are up. So without
     * a rule, a returning visitor runs the previous deploy's entries and loader
     * for four hours. The Perf Lab first surfaced it: a browser that had loaded
     * `/shell` before the deploy kept the old shell and never showed the lab.
     */
    it("makes files that are not content-hashed revalidate on every load", () => {
        chunk("fynapp-1", "fynapp-entry.js");
        chunk("fynapp-1", "index.js");
        chunk("fynapp-1", "federation.json", "{}");

        const headers = generateCacheHeaders(outputDir, warn)!;

        for (const rule of ["/:pkg/dist/fynapp-entry.js", "/:pkg/dist/index.js", "/:pkg/dist/federation.json"]) {
            expect(headers).toContain(`${rule}\n  Cache-Control: public, max-age=0, must-revalidate`);
        }
        expect(headers).not.toContain("immutable\n");
        expect(warnings).toEqual([]);
    });

    it("covers the loader runtime at the site root and under dist-raw", () => {
        writeFileSync(path.join(outputDir, "system.min.js"), "");
        chunk("kernel", "fynmesh-browser-kernel.min.js");
        chunk("fynapp-analytics", "fynapp-entry.js", undefined, "dist-raw");

        const headers = generateCacheHeaders(outputDir, warn)!;

        expect(headers).toContain("/system.min.js\n  Cache-Control: public, max-age=0, must-revalidate");
        expect(headers).toContain("/:pkg/dist/fynmesh-browser-kernel.min.js\n  Cache-Control: public, max-age=0");
        expect(headers).toContain("/:pkg/dist-raw/fynapp-entry.js\n  Cache-Control: public, max-age=0");
    });

    it("drops a stem rule that would also match an unhashed file, so no url gets both headers", () => {
        chunk("fynapp-1", "fynapp-entry.js");
        chunk("fynapp-1", "fynapp-AAAAAAAA.js");

        const headers = generateCacheHeaders(outputDir, warn)!;

        expect(headers).toContain("/:pkg/dist/fynapp-entry.js");
        expect(headers).not.toContain("/:pkg/dist/fynapp-*");
        expect(warnings.join("\n")).toContain("would also match dist/fynapp-entry.js");
    });

    it("never cuts a revalidate rule to fit the Pages rule limit", () => {
        chunk("fynapp-1", "fynapp-entry.js");
        for (let i = 0; i < 120; i++) chunk("fynapp-1", `c${i}-AAAAAAAA.js`);

        const headers = generateCacheHeaders(outputDir, warn)!;

        expect(headers).toContain("/:pkg/dist/fynapp-entry.js");
        expect(headers.match(/^\/:pkg\//gm)).toHaveLength(100);
        expect(warnings.join("\n")).toContain("exceeds the Cloudflare Pages limit");
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
