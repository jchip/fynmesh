/**
 * Shell preload hints, specifically their interaction with combined chunk files.
 *
 * A chunk folded into a combined file must be preloaded as that file. Getting
 * this wrong is silent and costly in both directions at once: the member is
 * downloaded and never used, and the combined file the runtime *does* fetch
 * arrives a round trip late — exactly the waterfall the hints exist to remove.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
    collectShellPreloadModules,
    collectShellBundleMaps,
} from "../scripts/shell-preload.mts";

let demoRoot: string;

/** a file whose text names the given chunks, the way real generated code does */
const entryNaming = (files: string[]) =>
    files.map((f) => `import "./${f}";\n`).join("");

/** the dist the helper below builds, for tests that write into it directly */
const distOf = () => path.join(demoRoot, "fynapp-sidebar", "dist");

/**
 * A demo root holding one FynApp's dist. `fynapp-sidebar` is used because it is
 * in SHELL_STARTUP_FYNAPPS with `chunks: "all"`.
 *
 * `bundles` lands in `federation.bundles.json`, where `federation-combine`
 * publishes it. `where: "federation.json"` puts it in that file's `bundles`
 * field instead, which is what a dist combined by an older version looks like.
 *
 * The entry names every chunk, because that is how a real one looks and how a
 * chunk is known to belong to this build at all — the container entry declares
 * its exposes, its shares and its bundle map by fileName. A test that needs a
 * chunk *not* named by the build writes over the entry itself.
 */
function fynapp(
    files: string[],
    bundles?: Record<string, string[]>,
    where: "federation.bundles.json" | "federation.json" = "federation.bundles.json"
) {
    demoRoot = mkdtempSync(path.join(tmpdir(), "preload-test-"));
    const dist = path.join(demoRoot, "fynapp-sidebar", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, "fynapp-entry.js"), entryNaming(files));
    for (const f of files) {
        writeFileSync(path.join(dist, f), "//chunk\n");
    }
    if (bundles && where === "federation.bundles.json") {
        writeFileSync(path.join(dist, where), JSON.stringify(bundles));
    }
    writeFileSync(
        path.join(dist, "federation.json"),
        JSON.stringify({
            name: "fynapp-sidebar",
            filename: "fynapp-entry.js",
            ...(bundles && where === "federation.json" ? { bundles } : {}),
        })
    );
}

const hints = () =>
    collectShellPreloadModules(demoRoot, "/", () => {}).filter((u) =>
        u.startsWith("/fynapp-sidebar/")
    );

afterEach(() => {
    demoRoot && rmSync(demoRoot, { recursive: true, force: true });
});

describe("collectShellPreloadModules with combined files", () => {
    it("preloads a chunk directly when nothing was combined", () => {
        fynapp(["main-AAAAAAAA.js", "other-BBBBBBBB.js"]);
        expect(hints()).toEqual([
            "/fynapp-sidebar/dist/fynapp-entry.js",
            "/fynapp-sidebar/dist/main-AAAAAAAA.js",
            "/fynapp-sidebar/dist/other-BBBBBBBB.js",
        ]);
    });

    it("preloads the combined file instead of its members", () => {
        fynapp(["main-AAAAAAAA.js", "other-BBBBBBBB.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js"],
        });
        const urls = hints();

        expect(urls).toContain("/fynapp-sidebar/dist/combo-CCCCCCCC.js");
        expect(urls).not.toContain("/fynapp-sidebar/dist/main-AAAAAAAA.js");
        expect(urls).not.toContain("/fynapp-sidebar/dist/other-BBBBBBBB.js");
    });

    it("names the combined file once, however many members it carries", () => {
        fynapp(["main-AAAAAAAA.js", "other-BBBBBBBB.js", "third-DDDDDDDD.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js", "third-DDDDDDDD.js"],
        });
        const urls = hints();
        expect(urls.filter((u) => u.includes("combo-CCCCCCCC.js"))).toHaveLength(1);
    });

    it("still preloads a chunk that was left out of the combined file", () => {
        fynapp(["main-AAAAAAAA.js", "alone-EEEEEEEE.js", "other-BBBBBBBB.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js"],
        });
        const urls = hints();
        expect(urls).toContain("/fynapp-sidebar/dist/alone-EEEEEEEE.js");
        expect(urls).toContain("/fynapp-sidebar/dist/combo-CCCCCCCC.js");
    });

    it("falls back to preloading chunks individually when the metadata is broken", () => {
        fynapp(["main-AAAAAAAA.js"]);
        writeFileSync(
            path.join(demoRoot, "fynapp-sidebar", "dist", "federation.json"),
            "{ not json"
        );
        const warnings: string[] = [];
        const urls = collectShellPreloadModules(demoRoot, "/", (m) => warnings.push(m));

        expect(urls).toContain("/fynapp-sidebar/dist/main-AAAAAAAA.js");
        expect(warnings.some((w) => w.includes("cannot read federation.json"))).toBe(true);
    });
});

/**
 * Which chunks in dist/ belong to *this* build.
 *
 * An incremental rollup build leaves the previous generation's content-hashed
 * files behind, and they still serve 200, so hinting one is silent waste rather
 * than an error — the sort of thing that ships unnoticed. What decides is
 * whether the build still refers to the file, starting from the entry, which it
 * rewrites every time.
 */
describe("collectShellPreloadModules and stale dist chunks", () => {
    it("skips a chunk left behind by an earlier build, and says so", () => {
        fynapp(["main-AAAAAAAA.js"]);
        // the same stem from a previous build, never cleaned out
        writeFileSync(path.join(distOf(), "main-STALE111.js"), "//old\n");

        const warnings: string[] = [];
        const urls = collectShellPreloadModules(demoRoot, "/", (m) => warnings.push(m));

        expect(urls).toContain("/fynapp-sidebar/dist/main-AAAAAAAA.js");
        expect(urls).not.toContain("/fynapp-sidebar/dist/main-STALE111.js");
        expect(warnings.some((w) => w.includes("main-STALE111.js"))).toBe(true);
    });

    it("keeps a chunk that only another chunk names", () => {
        // rollup's second level: the entry names main, main imports deep. Judging
        // liveness from the entry alone would drop deep and give back a round trip.
        fynapp(["main-AAAAAAAA.js", "deep-DDDDDDDD.js"]);
        writeFileSync(path.join(distOf(), "fynapp-entry.js"), entryNaming(["main-AAAAAAAA.js"]));
        writeFileSync(path.join(distOf(), "main-AAAAAAAA.js"), entryNaming(["deep-DDDDDDDD.js"]));

        expect(hints()).toContain("/fynapp-sidebar/dist/deep-DDDDDDDD.js");
    });

    it("ignores a leftover sitting beside a combined file", () => {
        fynapp(["main-AAAAAAAA.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"],
        });
        // a member of an earlier build's combined file, whose carrier is long gone
        writeFileSync(path.join(distOf(), "main-STALE111.js"), "//old\n");

        const urls = hints();
        expect(urls).toEqual([
            "/fynapp-sidebar/dist/fynapp-entry.js",
            "/fynapp-sidebar/dist/combo-CCCCCCCC.js",
        ]);
    });
});

/**
 * The maps the page declares to the runtime. Same federation.json the hints are
 * read from, so a page cannot preload one file while telling the runtime
 * another: what is pinned down here is that they stay the same data, and that an
 * app with nothing combined contributes nothing to declare.
 */
describe("collectShellBundleMaps", () => {
    const maps = () => collectShellBundleMaps(demoRoot, "/", () => {});

    it("declares the map as the build emitted it, against the app's dist base", () => {
        fynapp(["main-AAAAAAAA.js", "other-BBBBBBBB.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js"],
        });

        expect(maps()).toEqual([
            {
                base: "/fynapp-sidebar/dist/",
                bundles: {
                    "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js"],
                },
            },
        ]);
    });

    it("declares nothing for an app that was never combined", () => {
        fynapp(["main-AAAAAAAA.js"]);

        expect(maps()).toEqual([]);
    });

    it("declares nothing when the metadata is broken, and says so", () => {
        fynapp(["main-AAAAAAAA.js"]);
        writeFileSync(
            path.join(demoRoot, "fynapp-sidebar", "dist", "federation.json"),
            "{ not json"
        );
        const warnings: string[] = [];

        expect(collectShellBundleMaps(demoRoot, "/", (m) => warnings.push(m))).toEqual([]);
        expect(warnings.some((w) => w.includes("cannot read federation.json"))).toBe(true);
    });

    it("carries the deployment path prefix into the base", () => {
        fynapp(["main-AAAAAAAA.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"],
        });

        expect(collectShellBundleMaps(demoRoot, "/fynmesh", () => {})[0].base).toBe(
            "/fynmesh/fynapp-sidebar/dist/"
        );
    });

    it("reads a dist combined before federation.bundles.json existed", () => {
        fynapp(
            ["main-AAAAAAAA.js", "combo-CCCCCCCC.js"],
            { "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"] },
            "federation.json"
        );

        expect(maps()).toEqual([
            {
                base: "/fynapp-sidebar/dist/",
                bundles: { "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"] },
            },
        ]);
        // and the hints follow the same record
        expect(hints()).toContain("/fynapp-sidebar/dist/combo-CCCCCCCC.js");
    });

    it("prefers the app-offered artifact over federation.json's older record", () => {
        fynapp(["main-AAAAAAAA.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"],
        });
        // a stale field left in federation.json naming a file that is long gone
        writeFileSync(
            path.join(demoRoot, "fynapp-sidebar", "dist", "federation.json"),
            JSON.stringify({
                name: "fynapp-sidebar",
                filename: "fynapp-entry.js",
                bundles: { "combo-STALE111.js": ["gone-XXXXXXXX.js"] },
            })
        );

        expect(maps()[0].bundles).toEqual({ "combo-CCCCCCCC.js": ["main-AAAAAAAA.js"] });
    });

    it("agrees with the preload hints about which file to fetch", () => {
        fynapp(["main-AAAAAAAA.js", "other-BBBBBBBB.js", "combo-CCCCCCCC.js"], {
            "combo-CCCCCCCC.js": ["main-AAAAAAAA.js", "other-BBBBBBBB.js"],
        });

        const [{ base, bundles }] = maps();
        const carriers = Object.keys(bundles).map((file) => base + file);
        const hinted = hints().filter((u) => !u.endsWith("fynapp-entry.js"));

        expect(hinted).toEqual(carriers);
    });
});
