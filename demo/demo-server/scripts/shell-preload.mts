import { existsSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

/**
 * Content-hashed chunk filename, e.g. `main-DRNxFQY3.js` -> stem `main`.
 * Rollup emits an 8-character hash. Files without this suffix (`fynapp-entry.js`,
 * `index.js`) are NOT content-addressed and must never be treated as immutable.
 */
const HASHED_CHUNK_RE = /^(.*)-[A-Za-z0-9_-]{8}\.js$/;

/** Which of a FynApp's dist chunks the shell actually pulls in during startup. */
type StartupChunks =
    /** Every content-hashed chunk in dist is fetched during startup. */
    | "all"
    /**
     * Only `fynapp-entry.js` is fetched at startup; the real payload loads on
     * demand. Preloading these would be a large regression, not a win.
     */
    | "none"
    /** Only chunks whose stem matches one of these names. */
    | string[];

interface ShellStartupFynApp {
    /** Package directory name under `demo/` (also the URL path segment). */
    dir: string;
    chunks: StartupChunks;
    /**
     * `low` marks a FynApp the shell loads at browser idle rather than on the
     * critical path. The hint still warms the cache, but behind everything
     * needed for first paint. Must stay in sync with `loadDeferredProviders`
     * in `templates/pages/shell.html` — a `low` hint for something the startup
     * chain still awaits would just slow that chain down.
     */
    priority?: "low";
}

/** One `<link rel="preload" as="script">` to emit. */
interface ShellPreloadHint {
    href: string;
    priority?: "low";
}

/**
 * The FynApps `templates/pages/shell.html` loads during startup, in load order.
 *
 * This list is deliberately explicit rather than "glob every chunk in dist".
 * `fynapp-ag-grid-lib` ships a ~1MB `ag-grid.production-*.js` chunk that is only
 * fetched when a grid FynApp is actually selected — preloading it would add
 * roughly 1MB to cold start. Any entry marked `"none"` is a provider whose
 * payload is intentionally deferred.
 *
 * Keep in sync with the loader in `templates/pages/shell.html`.
 */
const SHELL_STARTUP_FYNAPPS: ShellStartupFynApp[] = [
    // React 18 and its only consumer, `fynapp-x1-v1`, are not on the first-paint
    // path — everything the shell renders up front is React 19. Both load at
    // browser idle, so their hints are demoted rather than dropped: the bytes are
    // still wanted (`fynapp-2-react18` import-exposes `fynapp-x1@^1`), just not
    // ahead of the shell.
    { dir: "fynapp-react-18", chunks: "all", priority: "low" },
    { dir: "fynapp-react-19", chunks: "all" },
    // `useSharedCounter` is a lazy demo chunk, not part of startup.
    { dir: "fynapp-react-middleware", chunks: ["main", "react-context"] },
    { dir: "fynapp-design-tokens", chunks: "all" },
    { dir: "fynapp-x1-v1", chunks: "all", priority: "low" },
    { dir: "fynapp-x1-v2", chunks: "all" },
    // Entry only — the grid bundle loads on demand. See note above.
    { dir: "fynapp-ag-grid-lib", chunks: "none" },
    { dir: "fynapp-shell-mw", chunks: "all" },
    // Rendered into the shell immediately after the layout mounts.
    { dir: "fynapp-sidebar", chunks: "all" },
];

/**
 * The Perf Lab suite's startup set, for `/shell?perf=hints` only.
 *
 * Unlike the list above these are never written as static tags. The shell's
 * head script injects them in `hints` mode alone. Cloudflare turns every static
 * preload tag into an Early Hint for every request, so static tags would warm
 * the suite in `raw` and `combined` too and erase the comparison. Hints always
 * point at `dist/`, since `hints` mode runs the combined build.
 *
 * The suite loads by name, and the kernel walks its graph one entry at a time:
 * each manifest is read out of an entry, so the next entry isn't known until
 * the last one ran. Hinting every entry up front is what flattens that chain.
 *
 * Keep in sync with the suite's own loading: `fynapp-analytics` imports
 * `grid` and `renderer` from the charts app at startup, `export` on click, and
 * the reports app's chunks at idle.
 */
const ANALYTICS_STARTUP_FYNAPPS: ShellStartupFynApp[] = [
    { dir: "fynapp-analytics", chunks: "all" },
    { dir: "fynapp-analytics-lib", chunks: "all" },
    { dir: "fynapp-analytics-charts", chunks: ["grid", "renderer"] },
    // Entry only: the graph loads the container at startup, its chunks at idle.
    { dir: "fynapp-analytics-reports", chunks: "none" },
];

/** combined fileName -> the fileNames it carries, as the build emitted it */
type BundleMap = Record<string, string[]>;

/**
 * Which chunks a FynApp's build folded into combined files.
 *
 * `federation-combine` publishes this as `federation.bundles.json` — the map on
 * its own, which is what an app offers to whoever loads it. Read in preference
 * to anything else, because it is the only source a host can count on: a real
 * host fetches it from an app it did not build, and `federation.json` is
 * optional for a federation build.
 *
 * Falls back to `federation.json`'s `bundles` field for a dist combined before
 * that artifact existed. Not speculative generality: a host consumes apps built
 * by tooling it does not control, so it meets both.
 *
 * Empty for an app that was never combined, which is the ordinary case.
 *
 * @param distDir the app's dist directory
 * @param appDir the app directory name, for messages
 * @param warn called on unreadable metadata
 * @returns combined fileName -> the fileNames it carries
 */
function readBundles(
    distDir: string,
    appDir: string,
    warn: (message: string) => void
): BundleMap {
    const read = (file: string, pick: (json: any) => BundleMap): BundleMap | undefined => {
        const jsonPath = path.join(distDir, file);
        if (!existsSync(jsonPath)) return undefined;
        try {
            return pick(JSON.parse(readFileSync(jsonPath, "utf8"))) || {};
        } catch (err) {
            warn(`${appDir}: cannot read ${file} (${(err as Error).message}) — preloading chunks individually`);
            return {};
        }
    };

    return (
        read("federation.bundles.json", (json) => json) ??
        read("federation.json", (json) => json.bundles) ??
        {}
    );
}

/**
 * The same map inverted, because the question the preload pass asks is "given a
 * chunk, what should I actually preload?".
 *
 * @returns member fileName -> the combined file carrying it
 */
function carriersOf(bundles: BundleMap): Map<string, string> {
    const carrierOf = new Map<string, string>();
    for (const bundleFile in bundles) {
        for (const member of bundles[bundleFile]) {
            carrierOf.set(member, bundleFile);
        }
    }
    return carrierOf;
}

/**
 * A content-hashed chunk filename anywhere inside a file's text.
 *
 * The unanchored twin of {@link HASHED_CHUNK_RE}: chunks name each other in
 * import specifiers (`./main-Bq-b5w3U.js`), in the share table the container
 * entry declares, and in the `_B` bundle map `federation-combine` appends to
 * that entry. All three are plain string literals, so one pattern finds them
 * all without parsing anything.
 */
const CHUNK_REF_RE = /[A-Za-z0-9_.$-]+-[A-Za-z0-9_-]{8}\.js/g;

/**
 * The hashed chunks *this* build produced, as opposed to whatever is lying in
 * `dist/`.
 *
 * Rollup content-hashes chunk filenames, so an incremental build leaves the
 * previous generation behind: `main-C9XGg3Go.js` sitting next to the live
 * `main-Bq-b5w3U.js`. Both return 200, which is exactly why hinting the dead one
 * ships unnoticed — it costs a download nobody uses plus a browser "preloaded
 * but not used" warning, and the staleness warning further down never fires,
 * because that one only catches a chunk that is *missing*.
 *
 * A live chunk is one the build still refers to. `fynapp-entry.js` is rewritten
 * every build and names the chunks it reaches directly; those name the ones they
 * import; the closure over that is this build's output, and anything in `dist/`
 * outside it belongs to an earlier one.
 *
 * @param distDir the app's dist directory
 * @param files everything in that directory
 * @param appDir the app directory name, for messages
 * @param warn called once per leftover chunk
 * @returns the fileNames reachable from the entry
 */
function liveChunks(
    distDir: string,
    files: string[],
    appDir: string,
    warn: (message: string) => void
): Set<string> {
    const hashed = new Set(files.filter((f) => HASHED_CHUNK_RE.test(f)));
    const live = new Set<string>();
    const queue = ["fynapp-entry.js"];

    while (queue.length) {
        let text: string;
        try {
            text = readFileSync(path.join(distDir, queue.pop()!), "utf8");
        } catch {
            continue; // a named chunk that is not on disk is the other bug; skip it
        }
        for (const ref of text.match(CHUNK_REF_RE) || []) {
            if (hashed.has(ref) && !live.has(ref)) {
                live.add(ref);
                queue.push(ref);
            }
        }
    }

    for (const file of hashed) {
        if (!live.has(file)) {
            warn(
                `${appDir}: ${file} is not referenced by this build — left over ` +
                    `from an earlier one, so it is not being preloaded (clean dist/ to remove it)`
            );
        }
    }

    return live;
}

/**
 * Build the `<link rel="preload" as="script">` URL list for the shell page.
 *
 * Without these hints the shell's startup is a serial waterfall: each FynApp
 * costs a round trip for its ~500-byte `fynapp-entry.js` (which only declares
 * what to fetch next) before its chunks can even be requested. The hints let all
 * of it download in parallel off the initial HTML parse.
 *
 * Missing files are skipped with a warning rather than failing the build — a
 * stale hint is worse than a missing one, and template builds can legitimately
 * run before the FynApps have been built.
 *
 * @param demoRoot  directory containing the FynApp packages (the `demo/` dir)
 * @param pathPrefix deployment path prefix, e.g. `/`
 * @param warn      called with a human-readable message per skipped item
 * @param apps      the startup set to hint
 * @returns hints in load order, entry-first per FynApp
 */
function collectShellPreloadModules(
    demoRoot: string,
    pathPrefix: string,
    warn: (message: string) => void = () => {},
    apps: ShellStartupFynApp[] = SHELL_STARTUP_FYNAPPS
): ShellPreloadHint[] {
    const urls: ShellPreloadHint[] = [];
    const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;

    for (const app of apps) {
        const distDir = path.join(demoRoot, app.dir, "dist");
        if (!existsSync(distDir)) {
            warn(`skipping ${app.dir}: no dist/ (build it first)`);
            continue;
        }

        const files = readdirSync(distDir);
        const base = `${prefix}${app.dir}/dist/`;
        const bundles = carriersOf(readBundles(distDir, app.dir, warn));

        // The federation entry always comes first — it is what the kernel imports.
        if (files.includes("fynapp-entry.js")) {
            urls.push({ href: `${base}fynapp-entry.js`, priority: app.priority });
        } else {
            warn(`skipping ${app.dir}: no fynapp-entry.js`);
            continue;
        }

        if (app.chunks === "none") continue;

        const wanted = app.chunks === "all" ? null : new Set(app.chunks);
        const matched = new Set<string>();
        const live = liveChunks(distDir, files, app.dir, warn);

        for (const file of files.sort()) {
            const stem = file.match(HASHED_CHUNK_RE)?.[1];
            if (!stem) continue; // not content-hashed -> not a startup chunk
            if (!live.has(file)) continue; // an earlier build's leftover, already warned
            if (wanted && !wanted.has(stem)) continue;
            matched.add(stem);
            /*
             * A chunk folded into a combined file must be preloaded as that
             * file, never as itself: the runtime loads the combined file and
             * never requests the member, so preloading the member downloads
             * bytes nobody uses AND gives back the round trip the hint exists to
             * remove. Deduped, since several members share one file.
             */
            const carrier = bundles.get(file);
            const href = `${base}${carrier || file}`;
            if (!urls.some((hint) => hint.href === href)) {
                urls.push({ href, priority: app.priority });
            }
        }

        // A renamed chunk would silently drop out of the preload set, quietly
        // giving back the waterfall it was added to remove. Say so loudly.
        if (wanted) {
            for (const stem of wanted) {
                if (!matched.has(stem)) {
                    warn(`${app.dir}: no chunk matching "${stem}-<hash>.js" — preload list may be stale`);
                }
            }
        }
    }

    return urls;
}

/**
 * The combined-bundle maps for the shell to declare to the runtime.
 *
 * The runtime otherwise learns which file carries which module from a statement
 * `federation-combine` appends to each container entry, so it knows nothing
 * until that entry has run. Declaring the same maps in the page moves that
 * knowledge earlier — before any FynApp is loaded — which is what lets a
 * preload decision name the file that will really be fetched rather than a
 * member url the runtime never requests.
 *
 * Read through the same {@link readBundles} as the hints above, so the page
 * cannot declare a map that disagrees with what it preloads. Declaring a map the
 * entry later declares again is a no-op: both come from the same build.
 *
 * @param demoRoot  directory containing the FynApp packages (the `demo/` dir)
 * @param pathPrefix deployment path prefix, e.g. `/`
 * @param warn      called with a human-readable message per unreadable app
 * @param apps      the startup set to declare maps for
 * @returns dist base url and its map, for each startup FynApp that has one
 */
function collectShellBundleMaps(
    demoRoot: string,
    pathPrefix: string,
    warn: (message: string) => void = () => {},
    apps: ShellStartupFynApp[] = SHELL_STARTUP_FYNAPPS
): Array<{ base: string; bundles: BundleMap }> {
    const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;
    const maps: Array<{ base: string; bundles: BundleMap }> = [];

    for (const app of apps) {
        const distDir = path.join(demoRoot, app.dir, "dist");
        // A missing dist is already reported by the preload pass; stay quiet here.
        if (!existsSync(distDir)) continue;

        const bundles = readBundles(distDir, app.dir, warn);
        if (Object.keys(bundles).length > 0) {
            maps.push({ base: `${prefix}${app.dir}/dist/`, bundles });
        }
    }

    return maps;
}

/**
 * Everything `shell.html` needs for `?perf=hints`: the suite's hints and its
 * bundle maps. Empty when the suite has not been built, and the page then has
 * nothing to inject.
 *
 * @param demoRoot  directory containing the FynApp packages (the `demo/` dir)
 * @param pathPrefix deployment path prefix, e.g. `/`
 * @param warn      called with a human-readable message per skipped item
 */
function collectPerfLab(
    demoRoot: string,
    pathPrefix: string,
    warn: (message: string) => void = () => {}
): { hints: ShellPreloadHint[]; bundleMaps: Array<{ base: string; bundles: BundleMap }> } {
    return {
        hints: collectShellPreloadModules(demoRoot, pathPrefix, warn, ANALYTICS_STARTUP_FYNAPPS),
        bundleMaps: collectShellBundleMaps(demoRoot, pathPrefix, warn, ANALYTICS_STARTUP_FYNAPPS),
    };
}

/**
 * What `fynops.html` fetches before the shell can paint: React 19 and the
 * shell. Everything else loads by name on demand, so it is not hinted. The two
 * live in different trees (`demo/` and `apps/fynops/`), and `dir` is both the
 * directory under its root and the url segment, so each root is its own list.
 */
const FYNOPS_STARTUP: Array<{ root: string; apps: ShellStartupFynApp[] }> = [
    { root: "demo", apps: [{ dir: "fynapp-react-19", chunks: "all" }] },
    { root: "apps/fynops", apps: [{ dir: "fynops-shell", chunks: "all" }] },
];

/** The route an empty hash opens. Keep in sync with `DEFAULT_ROUTE` in fynops-shell's `routes.ts`. */
const FYNOPS_DEFAULT_ROUTE = "/shipments";

/**
 * What each FynOps route needs before its view can paint, beyond React and the
 * shell. Keys match `ROUTES` in fynops-shell's `routes.ts`.
 *
 * The shell loads a route's feature by name, and the kernel reads each manifest
 * out of an entry before it knows the next one. So without hints each level of
 * providers costs a round trip, and the large shared libraries wait until the
 * feature's code runs. The page hints only the route it opens on. Other routes
 * load on first visit.
 *
 * Each list is the feature plus the providers in its manifest's
 * `shared-providers`, and their own providers. Two things are left out on
 * purpose. `fynops-data`'s worker and `sqlite3.wasm` are fetched by the worker,
 * which never reuses a page preload. For the same reason `ops-map` hints only
 * `main`, not maplibre's worker chunk.
 */
const FYNOPS_ROUTE_STARTUP: Record<string, Array<{ root: string; apps: ShellStartupFynApp[] }>> = {
    "/shipments": [
        {
            root: "apps/fynops",
            apps: [
                { dir: "ops-shipments", chunks: "all" },
                { dir: "fynops-ui", chunks: "all" },
                { dir: "fynops-data", chunks: "all" },
                { dir: "fynops-grid-lib", chunks: "all" },
                // Entry only. The sparklines import echarts after the grid paints.
                { dir: "fynops-charts-lib", chunks: "none" },
            ],
        },
        // AG Grid community and its React binding, which fynops-grid-lib builds on.
        { root: "demo", apps: [{ dir: "fynapp-ag-grid-lib", chunks: "all" }] },
    ],
    "/map": [
        {
            root: "apps/fynops",
            apps: [
                { dir: "ops-map", chunks: ["main"] },
                { dir: "fynops-ui", chunks: "all" },
                { dir: "fynops-data", chunks: "all" },
            ],
        },
    ],
    "/analytics": [
        {
            root: "apps/fynops",
            apps: [
                { dir: "ops-analytics", chunks: "all" },
                { dir: "fynops-ui", chunks: "all" },
                { dir: "fynops-data", chunks: "all" },
                { dir: "fynops-charts-lib", chunks: "all" },
            ],
        },
    ],
};

/**
 * Hints and bundle maps for `fynops.html`, the same pair `shell.html` gets,
 * plus a hint list per route for the page's head script to pick from.
 *
 * Route hints are `low`, so a server that honors priority sends the static React
 * and shell hints first. Over HTTP/1.1, as with the dev proxy, they share the
 * bandwidth instead, and the nav paints about 100ms later on Fast 4G. A file
 * the static hints already name is left out of every route list.
 *
 * @param repoRoot  the monorepo root
 * @param pathPrefix deployment path prefix, e.g. `/`
 * @param warn      called with a human-readable message per skipped item
 */
function collectFynOps(
    repoRoot: string,
    pathPrefix: string,
    warn: (message: string) => void = () => {}
): {
    hints: ShellPreloadHint[];
    bundleMaps: Array<{ base: string; bundles: BundleMap }>;
    routeHints: Record<string, ShellPreloadHint[]>;
    defaultRoute: string;
} {
    const rooted = (list: Array<{ root: string; apps: ShellStartupFynApp[] }>) =>
        list.map(({ root, apps }) => ({ dir: path.join(repoRoot, root), apps }));
    const startup = rooted(FYNOPS_STARTUP);
    const hints = startup.flatMap(({ dir, apps }) => collectShellPreloadModules(dir, pathPrefix, warn, apps));
    const hinted = new Set(hints.map((hint) => hint.href));

    const routeHints: Record<string, ShellPreloadHint[]> = {};
    // Every route app's map is declared, since any of them can load later.
    const bundleMaps = startup.flatMap(({ dir, apps }) => collectShellBundleMaps(dir, pathPrefix, warn, apps));
    for (const [route, list] of Object.entries(FYNOPS_ROUTE_STARTUP)) {
        const seen = new Set(hinted);
        routeHints[route] = [];
        for (const { dir, apps } of rooted(list)) {
            for (const hint of collectShellPreloadModules(dir, pathPrefix, warn, apps)) {
                if (seen.has(hint.href)) continue;
                seen.add(hint.href);
                routeHints[route].push({ href: hint.href, priority: "low" });
            }
            for (const map of collectShellBundleMaps(dir, pathPrefix, warn, apps)) {
                if (!bundleMaps.some((m) => m.base === map.base)) bundleMaps.push(map);
            }
        }
    }

    return { hints, bundleMaps, routeHints, defaultRoute: FYNOPS_DEFAULT_ROUTE };
}

export {
    collectFynOps,
    collectPerfLab,
    collectShellPreloadModules,
    collectShellBundleMaps,
    readBundles,
    carriersOf,
    SHELL_STARTUP_FYNAPPS,
    ANALYTICS_STARTUP_FYNAPPS,
    FYNOPS_ROUTE_STARTUP,
    FYNOPS_DEFAULT_ROUTE,
    HASHED_CHUNK_RE,
};
export type { ShellPreloadHint, ShellStartupFynApp, BundleMap };
