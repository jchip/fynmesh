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

/**
 * A demo root holding one FynApp's dist. `fynapp-sidebar` is used because it is
 * in SHELL_STARTUP_FYNAPPS with `chunks: "all"`.
 */
function fynapp(files: string[], bundles?: Record<string, string[]>) {
    demoRoot = mkdtempSync(path.join(tmpdir(), "preload-test-"));
    const dist = path.join(demoRoot, "fynapp-sidebar", "dist");
    mkdirSync(dist, { recursive: true });
    writeFileSync(path.join(dist, "fynapp-entry.js"), "//entry\n");
    for (const f of files) {
        writeFileSync(path.join(dist, f), "//chunk\n");
    }
    writeFileSync(
        path.join(dist, "federation.json"),
        JSON.stringify({ name: "fynapp-sidebar", filename: "fynapp-entry.js", ...(bundles ? { bundles } : {}) })
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
