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
    { dir: "fynapp-react-18", chunks: "all" },
    { dir: "fynapp-react-19", chunks: "all" },
    // `useSharedCounter` is a lazy demo chunk, not part of startup.
    { dir: "fynapp-react-middleware", chunks: ["main", "react-context"] },
    { dir: "fynapp-design-tokens", chunks: "all" },
    { dir: "fynapp-x1-v1", chunks: "all" },
    { dir: "fynapp-x1-v2", chunks: "all" },
    // Entry only — the grid bundle loads on demand. See note above.
    { dir: "fynapp-ag-grid-lib", chunks: "none" },
    { dir: "fynapp-shell-mw", chunks: "all" },
    // Rendered into the shell immediately after the layout mounts.
    { dir: "fynapp-sidebar", chunks: "all" },
];

/**
 * Which chunks a FynApp's build folded into combined files.
 *
 * `federation-combine` records this in `federation.json` as `bundles`, mapping a
 * combined fileName to the chunk fileNames inside it. Inverted here, because the
 * question this file asks is "given a chunk, what should I actually preload?".
 *
 * Absent for an app that was never combined, which is the ordinary case.
 *
 * @param distDir the app's dist directory
 * @param appDir the app directory name, for messages
 * @param warn called on unreadable metadata
 * @returns member fileName -> the combined file carrying it
 */
function readBundleMap(
    distDir: string,
    appDir: string,
    warn: (message: string) => void
): Map<string, string> {
    const carrierOf = new Map<string, string>();
    const jsonPath = path.join(distDir, "federation.json");
    if (!existsSync(jsonPath)) return carrierOf;
    try {
        const bundles = JSON.parse(readFileSync(jsonPath, "utf8")).bundles;
        for (const bundleFile in bundles || {}) {
            for (const member of bundles[bundleFile]) {
                carrierOf.set(member, bundleFile);
            }
        }
    } catch (err) {
        warn(`${appDir}: cannot read federation.json (${(err as Error).message}) — preloading chunks individually`);
    }
    return carrierOf;
}

/**
 * Build the `<link rel="modulepreload">` URL list for the shell page.
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
 * @returns absolute URL paths, in load order, entry-first per FynApp
 */
function collectShellPreloadModules(
    demoRoot: string,
    pathPrefix: string,
    warn: (message: string) => void = () => {}
): string[] {
    const urls: string[] = [];
    const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;

    for (const app of SHELL_STARTUP_FYNAPPS) {
        const distDir = path.join(demoRoot, app.dir, "dist");
        if (!existsSync(distDir)) {
            warn(`skipping ${app.dir}: no dist/ (build it first)`);
            continue;
        }

        const files = readdirSync(distDir);
        const base = `${prefix}${app.dir}/dist/`;
        const bundles = readBundleMap(distDir, app.dir, warn);

        // The federation entry always comes first — it is what the kernel imports.
        if (files.includes("fynapp-entry.js")) {
            urls.push(`${base}fynapp-entry.js`);
        } else {
            warn(`skipping ${app.dir}: no fynapp-entry.js`);
            continue;
        }

        if (app.chunks === "none") continue;

        const wanted = app.chunks === "all" ? null : new Set(app.chunks);
        const matched = new Set<string>();

        for (const file of files.sort()) {
            const stem = file.match(HASHED_CHUNK_RE)?.[1];
            if (!stem) continue; // not content-hashed -> not a startup chunk
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
            if (!urls.includes(href)) {
                urls.push(href);
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

export { collectShellPreloadModules, SHELL_STARTUP_FYNAPPS, HASHED_CHUNK_RE };
