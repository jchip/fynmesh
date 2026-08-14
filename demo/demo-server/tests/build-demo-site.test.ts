import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { findMissingLocalRefs } from "../scripts/build-demo-site.mts";

/**
 * findMissingLocalRefs is the guard from FYM-199. A page that references an
 * asset the build never copied does not fail loudly in production: Cloudflare
 * Pages answers the unknown path with its HTML 404 body, so the browser gets
 * `text/html` for a `.js` request and refuses it on MIME grounds. The page then
 * dies on an undefined global far from the real cause. These tests pin the
 * guard that turns that into a build failure.
 */
describe("findMissingLocalRefs", () => {
    let outputDir: string;

    /** Write a file into the fake output dir, creating parent dirs as needed. */
    const write = (relPath: string, contents = "") => {
        const full = path.join(outputDir, relPath);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, contents);
    };

    beforeEach(() => {
        outputDir = mkdtempSync(path.join(tmpdir(), "fynmesh-refs-"));
    });

    afterEach(() => {
        rmSync(outputDir, { recursive: true, force: true });
    });

    it("reports a referenced file absent from the output", () => {
        write("demo.html", `<script src="/lazy-loader.js"></script>`);

        expect(findMissingLocalRefs(outputDir, "/")).toEqual(["demo.html -> /lazy-loader.js"]);
    });

    it("passes when the referenced file is present", () => {
        write("demo.html", `<script src="/lazy-loader.js"></script>`);
        write("lazy-loader.js", "window.LazyLoader = class {};");

        expect(findMissingLocalRefs(outputDir, "/")).toEqual([]);
    });

    it("ignores external, data, mailto, and fragment refs", () => {
        write(
            "index.html",
            `<a href="https://github.com/jchip/fynmesh">repo</a>
             <a href="http://example.com/a.js">http</a>
             <script src="//cdn.example.com/b.js"></script>
             <a href="mailto:someone@example.com">mail</a>
             <a href="#top">anchor</a>
             <img src="data:image/png;base64,AAAA">`
        );

        expect(findMissingLocalRefs(outputDir, "/")).toEqual([]);
    });

    it("strips query strings and hashes before resolving", () => {
        write("demo.html", `<script src="/system.min.js?v=2#frag"></script>`);
        write("system.min.js");

        expect(findMissingLocalRefs(outputDir, "/")).toEqual([]);
    });

    it("resolves refs under a non-root pathPrefix", () => {
        write("demo.html", `<script src="/fynmesh/lazy-loader.js"></script>`);
        write("lazy-loader.js");

        expect(findMissingLocalRefs(outputDir, "/fynmesh/")).toEqual([]);
    });

    it("reports every missing ref across multiple pages", () => {
        write("demo.html", `<script src="/lazy-loader.js"></script>`);
        write("shell.html", `<link href="/spectre.css/dist/spectre.min.css">`);

        expect(findMissingLocalRefs(outputDir, "/").sort()).toEqual([
            "demo.html -> /lazy-loader.js",
            "shell.html -> /spectre.css/dist/spectre.min.css",
        ]);
    });

    it("resolves nested paths", () => {
        write("shell.html", `<link href="/fynapp-sidebar/dist/main-XZ7_ljnM.js">`);
        write("fynapp-sidebar/dist/main-XZ7_ljnM.js");

        expect(findMissingLocalRefs(outputDir, "/")).toEqual([]);
    });

    it("only reports each missing ref once per page", () => {
        write(
            "demo.html",
            `<script src="/lazy-loader.js"></script>
             <script src="/lazy-loader.js"></script>`
        );

        expect(findMissingLocalRefs(outputDir, "/")).toEqual(["demo.html -> /lazy-loader.js"]);
    });

    it("finds nothing when the output dir has no pages", () => {
        expect(findMissingLocalRefs(outputDir, "/")).toEqual([]);
    });
});
