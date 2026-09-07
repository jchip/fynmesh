import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { findMissingLocalRefs, findMissingChunkRefs, prepareOutputDir } from "../scripts/build-demo-site.mts";

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

/**
 * prepareOutputDir is the guard from FYM-387. The publish flow builds into
 * `.temp/docs`, which is gitignored and therefore survives between runs, so a
 * build that does not clean first ships whatever the last one left -- 86 stale
 * `.map` files on the first live deploy. The catch is that the default
 * outputDir *is* the source `public/` directory, so the clean has to refuse
 * that one case rather than delete checked-in assets.
 */
describe("prepareOutputDir", () => {
    let root: string;
    let outputDir: string;
    let sourceDir: string;
    const logged: string[] = [];
    const log = (m: string) => void logged.push(m);

    beforeEach(() => {
        root = mkdtempSync(path.join(tmpdir(), "fynmesh-outdir-"));
        outputDir = path.join(root, "docs");
        sourceDir = path.join(root, "public");
        mkdirSync(sourceDir, { recursive: true });
        logged.length = 0;
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("removes stale files from a distinct build directory", () => {
        mkdirSync(path.join(outputDir, "fynapp-6-react", "dist"), { recursive: true });
        writeFileSync(path.join(outputDir, "main-oldhash.js.map"), "{}");
        writeFileSync(path.join(outputDir, "fynapp-6-react", "dist", "stale.js"), "");

        expect(prepareOutputDir(outputDir, sourceDir, log)).toBe(true);

        expect(existsSync(outputDir)).toBe(true);
        expect(readdirSync(outputDir)).toEqual([]);
    });

    it("creates the build directory when it does not exist yet", () => {
        expect(prepareOutputDir(outputDir, sourceDir, log)).toBe(true);

        expect(existsSync(outputDir)).toBe(true);
    });

    it("refuses to clean the source public directory", () => {
        writeFileSync(path.join(sourceDir, "favicon.ico"), "icon");

        expect(prepareOutputDir(sourceDir, sourceDir, log)).toBe(false);

        expect(readdirSync(sourceDir)).toEqual(["favicon.ico"]);
        expect(logged.join("\n")).toContain("Not cleaning");
    });

    it("compares directories after resolving, not by string", () => {
        writeFileSync(path.join(sourceDir, "favicon.ico"), "icon");
        const indirect = path.join(sourceDir, "..", "public");

        expect(prepareOutputDir(indirect, sourceDir, log)).toBe(false);

        expect(readdirSync(sourceDir)).toEqual(["favicon.ico"]);
    });
});

/**
 * findMissingChunkRefs is the FYM-392 half of the same guard. The chunks that
 * carry a FynApp are named only in its federation.json and fetched at runtime,
 * so findMissingLocalRefs -- which reads `src`/`href` out of the pages -- never
 * sees them. The subtlety is that a member chunk folded into a combined file is
 * legitimately absent from disk, so "the file is not there" is not the test;
 * "the runtime cannot reach it" is.
 */
describe("findMissingChunkRefs", () => {
    let outputDir: string;

    /** Write an app's dist: its federation.json plus whatever files exist. */
    const writeApp = (
        app: string,
        manifest: Record<string, unknown>,
        files: string[] = [],
        bundlesJson?: Record<string, string[]> | string
    ) => {
        const dist = path.join(outputDir, app, "dist");
        mkdirSync(dist, { recursive: true });
        writeFileSync(path.join(dist, "federation.json"), JSON.stringify(manifest));
        for (const f of files) writeFileSync(path.join(dist, f), "");
        if (bundlesJson !== undefined) {
            writeFileSync(
                path.join(dist, "federation.bundles.json"),
                typeof bundlesJson === "string" ? bundlesJson : JSON.stringify(bundlesJson)
            );
        }
    };

    const exposing = (chunk: string) => ({
        filename: "fynapp-entry.js",
        exposes: { "./main": { chunks: [chunk] } },
    });

    beforeEach(() => {
        outputDir = mkdtempSync(path.join(tmpdir(), "fynmesh-chunks-"));
    });

    afterEach(() => {
        rmSync(outputDir, { recursive: true, force: true });
    });

    it("reports an exposed chunk that never shipped", () => {
        writeApp("fynapp-6-react", exposing("main-DWprtUVa.js"), ["fynapp-entry.js"]);

        expect(findMissingChunkRefs(outputDir)).toEqual([
            "fynapp-6-react/dist/federation.json -> main-DWprtUVa.js (exposes ./main)",
        ]);
    });

    it("passes when the chunk is present", () => {
        writeApp("fynapp-6-react", exposing("main-DWprtUVa.js"), [
            "fynapp-entry.js",
            "main-DWprtUVa.js",
        ]);

        expect(findMissingChunkRefs(outputDir)).toEqual([]);
    });

    it("accepts a member chunk carried by a combined bundle that shipped", () => {
        writeApp(
            "fynapp-1",
            exposing("hello-B9dQ6FmL.js"),
            ["fynapp-entry.js", "combo-R7IaSAnm.js"],
            { "combo-R7IaSAnm.js": ["hello-B9dQ6FmL.js"] }
        );

        expect(findMissingChunkRefs(outputDir)).toEqual([]);
    });

    it("reports the carrier when the combined bundle itself is missing", () => {
        writeApp("fynapp-1", exposing("hello-B9dQ6FmL.js"), ["fynapp-entry.js"], {
            "combo-R7IaSAnm.js": ["hello-B9dQ6FmL.js"],
        });

        expect(findMissingChunkRefs(outputDir)).toEqual([
            "fynapp-1/dist/federation.json -> hello-B9dQ6FmL.js (exposes ./main)",
            "fynapp-1/dist/federation.json -> combo-R7IaSAnm.js (combined bundle)",
        ]);
    });

    it("reports a missing container entry", () => {
        writeApp("fynapp-6-react", { filename: "fynapp-entry.js", exposes: {} }, []);

        expect(findMissingChunkRefs(outputDir)).toEqual([
            "fynapp-6-react/dist/federation.json -> fynapp-entry.js (container entry)",
        ]);
    });

    it("checks shared chunks as well as exposed ones", () => {
        writeApp(
            "fynapp-react-19",
            {
                filename: "fynapp-entry.js",
                shared: { "esm-react": { chunks: ["react-CIkKfoRV.js"] } },
            },
            ["fynapp-entry.js"]
        );

        expect(findMissingChunkRefs(outputDir)).toEqual([
            "fynapp-react-19/dist/federation.json -> react-CIkKfoRV.js (shared esm-react)",
        ]);
    });

    it("falls back to the bundles field inside federation.json", () => {
        writeApp(
            "fynapp-1",
            {
                filename: "fynapp-entry.js",
                exposes: { "./main": { chunks: ["hello-B9dQ6FmL.js"] } },
                bundles: { "combo-R7IaSAnm.js": ["hello-B9dQ6FmL.js"] },
            },
            ["fynapp-entry.js", "combo-R7IaSAnm.js"]
        );

        expect(findMissingChunkRefs(outputDir)).toEqual([]);
    });

    it("reports an unreadable manifest instead of skipping it", () => {
        const dist = path.join(outputDir, "fynapp-1", "dist");
        mkdirSync(dist, { recursive: true });
        writeFileSync(path.join(dist, "federation.json"), "{");

        const missing = findMissingChunkRefs(outputDir);

        expect(missing).toHaveLength(1);
        expect(missing[0]).toContain("fynapp-1/dist/federation.json -> unreadable");
    });

    it("ignores directories that are not FynApp dists", () => {
        mkdirSync(path.join(outputDir, "federation-js", "dist"), { recursive: true });
        writeFileSync(path.join(outputDir, "index.html"), "");

        expect(findMissingChunkRefs(outputDir)).toEqual([]);
    });

    it("finds nothing when no app has been copied", () => {
        expect(findMissingChunkRefs(outputDir)).toEqual([]);
    });
});
