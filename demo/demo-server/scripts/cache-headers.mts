import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { HASHED_CHUNK_RE } from "./shell-preload.mts";

/** Cloudflare Pages allows at most 100 header rules in a `_headers` file. */
const PAGES_HEADER_RULE_LIMIT = 100;

const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * For every file that is not content-addressed. `/shell` and the other HTML
 * pages already get this from Pages; the JS and JSON beside them do not.
 */
const REVALIDATE = "public, max-age=0, must-revalidate";

/** The package folders that hold federation output. */
const DIST_FOLDERS = ["dist", "dist-raw"];

/**
 * Files the browser loads by a fixed url: the loader runtime, entries, metadata,
 * and wasm. `wasm` because sqlite-wasm looks its binary up by a fixed name
 * (fynops-data's `sqlite3.wasm`); left out, Pages' default browser TTL could pair
 * a new worker with a stale binary for hours.
 */
const MUTABLE_FILE = /\.(js|json|wasm)$/;

/**
 * Every unhashed `.js`/`.json` file the site serves, as `_headers` url patterns.
 *
 * Inside package folders the pattern names the file under a `:pkg` placeholder,
 * so `/:pkg/dist/fynapp-entry.js` covers all 28 entries in one rule. Files at
 * the site root are named exactly.
 *
 * @param outputDir the built site root
 * @returns folder -> unhashed basenames found in it, and the root files
 */
function collectMutable(outputDir: string): { byFolder: Map<string, Set<string>>; root: string[] } {
    const byFolder = new Map<string, Set<string>>(DIST_FOLDERS.map((f) => [f, new Set<string>()]));
    const root: string[] = [];

    for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            if (MUTABLE_FILE.test(entry.name)) root.push(entry.name);
            continue;
        }
        for (const folder of DIST_FOLDERS) {
            const dir = path.join(outputDir, entry.name, folder);
            if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
            for (const file of readdirSync(dir)) {
                if (MUTABLE_FILE.test(file) && !HASHED_CHUNK_RE.test(file)) {
                    byFolder.get(folder)!.add(file);
                }
            }
        }
    }

    return { byFolder, root: root.sort() };
}

/**
 * A `//# sourceMappingURL=` comment on the last line of a chunk.
 *
 * Its presence is the tell that a chunk carries bytes rollup did not hash --
 * anchored to the end of the file so a `sourceMappingURL` string appearing
 * inside application code is not mistaken for one.
 */
const TRAILING_SOURCEMAP_COMMENT = /\n\/\/# sourceMappingURL=\S*[ \t]*\n?$/;

/**
 * Whether a chunk's bytes are exactly what its content hash covers.
 *
 * `immutable` is a promise that the bytes at a url will never change, and a
 * content hash in the filename is what makes that promise keepable -- change the
 * bytes, get a different name. Rollup breaks that in one specific way: it
 * computes the hash and only then appends the `//# sourceMappingURL=` comment.
 * A build that stops emitting source maps therefore changes every chunk's bytes
 * while every filename stays put, and any url already marked `immutable` keeps
 * serving the old body for up to a year -- the edge and the visitor's browser
 * both have no reason to ask again.
 *
 * That is not hypothetical: FYM-386 did exactly this, and 27 of 50 live bundles
 * went on serving the previous build's trailing comment after the deploy
 * (FYM-394). Rather than promise immutability for bytes we cannot vouch for,
 * a chunk carrying appended content keeps the revalidating default. Slower;
 * never a frozen lie.
 *
 * @param file - absolute path to the chunk
 * @returns true when nothing was appended after hashing
 */
function isSealed(file: string): boolean {
    try {
        return !TRAILING_SOURCEMAP_COMMENT.test(readFileSync(file, "utf8"));
    } catch {
        // Unreadable: do not promise anything about it.
        return false;
    }
}

/**
 * Every content-hashed chunk stem found under every package's `<folderName>`,
 * safe to mark immutable.
 *
 * Shared between `dist` and `dist-raw` (a Perf Lab suite app's pre-combine
 * snapshot, see notes/PERF-LAB-DESIGN.md): both hold plain rollup output with
 * the same hashed-chunk shape, so the same sealed/unsealed test applies to
 * either one, just rooted at a different folder name under each package.
 *
 * @param outputDir the built site root
 * @param folderName "dist" or "dist-raw"
 * @param warn called with a human-readable message per anomaly
 * @returns sealed chunk stems found under every package's `<folderName>`
 */
function collectSealedStems(
    outputDir: string,
    folderName: string,
    warn: (message: string) => void
): Set<string> {
    const stems = new Set<string>();
    /** stem -> the first chunk found carrying content rollup did not hash */
    const unsealed = new Map<string, string>();

    for (const pkg of readdirSync(outputDir)) {
        const distDir = path.join(outputDir, pkg, folderName);
        if (!existsSync(distDir) || !statSync(distDir).isDirectory()) continue;

        for (const entry of readdirSync(distDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                // A nested hashed chunk would not match `/:pkg/<folderName>/<stem>-*`.
                // It keeps the default (safe), but flag it so the pattern can be
                // revisited if the build layout ever changes.
                const nested = readdirSync(path.join(distDir, entry.name));
                if (nested.some(f => HASHED_CHUNK_RE.test(f))) {
                    warn(`hashed chunks under ${pkg}/${folderName}/${entry.name}/ are not covered by the immutable rules`);
                }
                continue;
            }
            const stem = entry.name.match(HASHED_CHUNK_RE)?.[1];
            if (!stem) continue;

            /*
             * One rule covers a stem across every package, so a single chunk
             * with appended content disqualifies the whole stem -- there is no
             * way to exempt one file from `/:pkg/<folderName>/<stem>-*`.
             */
            if (isSealed(path.join(distDir, entry.name))) {
                stems.add(stem);
            } else if (!unsealed.has(stem)) {
                unsealed.set(stem, `${pkg}/${folderName}/${entry.name}`);
            }
        }
    }

    for (const [stem, file] of unsealed) {
        stems.delete(stem);
        warn(
            `${file} carries a sourceMappingURL comment appended after its content hash, ` +
            `so "${stem}-*" is not marked immutable — the url could serve stale bytes ` +
            `for a year if the comment is ever removed (FYM-394)`
        );
    }

    return stems;
}

/**
 * Generate the body of a Cloudflare Pages `_headers` file that marks
 * content-hashed chunks as immutable and everything else unhashed as
 * revalidate-every-time.
 *
 * Background: static assets reach the browser as
 * `public, max-age=14400, must-revalidate`, and that is wrong both ways. The
 * four hours come from the zone's Browser Cache TTL, which raises any lower
 * `max-age` on file types Cloudflare caches (`.js`, images), whatever `_headers`
 * says. `.json` and HTML are not cached there and keep this file's value. So the
 * {@link REVALIDATE} rules only reach `.js` once Browser Cache TTL is set to
 * "Respect Existing Headers" in the dashboard. The immutable rules are longer
 * than four hours, so they apply either way. For
 * content-addressed chunks it is wasteful: after four hours a returning visitor
 * revalidates every chunk (~58ms per 304), serialized behind the loader, for
 * zero changed bytes. For unhashed files it is stale: `must-revalidate` only
 * applies once the four hours are up, so until then a returning visitor runs
 * the entries and loader of the previous deploy without asking. An old
 * `fynapp-entry.js` names the old chunks, so the visitor gets old code, or a
 * broken page once those chunks are gone. The Perf Lab first surfaced it: a
 * browser that had loaded `/shell` before the deploy kept the old shell and
 * never showed the lab. Those files get {@link REVALIDATE}: one 304 per load,
 * never a stale deploy.
 *
 * Two constraints from the Pages `_headers` spec drive the shape of the output:
 *
 * 1. "An incoming request which matches multiple rules' URL patterns will
 *    inherit all rules' headers", and a header set twice has its values
 *    "joined with a comma separator". So two rules both setting `Cache-Control`
 *    would emit `max-age=31536000, immutable, max-age=14400, must-revalidate`
 *    — ambiguous, and browser handling of duplicate directives is not
 *    well-defined. The rules therefore MUST be disjoint; there is no
 *    "most specific wins" to fall back on.
 * 2. Only a single splat (`*`) is allowed per pattern, and there is no negation.
 *
 * So instead of a broad `/:pkg/dist/*` rule plus exceptions, this emits one rule
 * per distinct chunk *stem*: `/:pkg/dist/main-*`. That is one placeholder plus
 * one splat (legal), and it cannot match the two non-hashed JS filenames the
 * build produces — `fynapp-entry.js` and `index.js` — because neither contains a
 * `<stem>-` prefix. Those, along with `federation.json`, `fynapp.manifest.json`,
 * `federation.bundles.json` and the loader runtime, get their own exact-name
 * rules instead. They are not content-addressed, so freezing them would break
 * deploys. A frozen bundle map is the worst of them — it would name carrier
 * files a later deploy no longer has. A stem rule that would also match one of
 * those names is dropped, so the two sets of rules stay disjoint.
 *
 * The same rule shape is emitted again for `/:pkg/dist-raw/<stem>-*`, a Perf
 * Lab suite app's pre-combine snapshot (see notes/PERF-LAB-DESIGN.md) — a warm
 * reload of `raw` mode needs its hashed chunks cached the same way `dist`'s
 * are. `:pkg` is a Pages placeholder that matches any package directory name,
 * so one rule per stem already covers every package; `dist-raw` just needs its
 * own set of rules alongside `dist`'s, counted against the same rule limit.
 *
 * An unrecognised stem simply falls through to the default. That fails safe
 * (slower, never stale), and since this is regenerated from the real build
 * output on every deploy it stays in sync on its own.
 *
 * @param outputDir the built site root (the directory `_headers` is written to)
 * @param warn      called with a human-readable message per anomaly
 * @returns the file contents, or null if there is nothing to emit
 */
function generateCacheHeaders(
    outputDir: string,
    warn: (message: string) => void = () => {}
): string | null {
    if (!existsSync(outputDir)) return null;

    const stems = collectSealedStems(outputDir, "dist", warn);
    const rawStems = collectSealedStems(outputDir, "dist-raw", warn);
    const mutable = collectMutable(outputDir);
    const mutableCount = mutable.root.length + [...mutable.byFolder.values()].reduce((n, s) => n + s.size, 0);

    if (stems.size === 0 && rawStems.size === 0 && mutableCount === 0) return null;

    /*
     * Pages joins the values of every rule a url matches, so a stem rule that
     * also matched a mutable name would send both headers. Drop the stem: the
     * chunks keep the default, which is slow but never stale.
     */
    const disjoint = (folder: string, folderStems: Set<string>): string[] =>
        [...folderStems].sort().filter((stem) => {
            const clash = [...mutable.byFolder.get(folder)!].find((f) => f.startsWith(`${stem}-`));
            if (clash) warn(`"${stem}-*" would also match ${folder}/${clash}, so it is not marked immutable`);
            return !clash;
        });

    const revalidateRules = [
        ...DIST_FOLDERS.flatMap((folder) =>
            [...mutable.byFolder.get(folder)!].sort().map((file) => `/:pkg/${folder}/${file}`)
        ),
        ...mutable.root.map((file) => `/${file}`),
    ];
    const immutableRules = [
        ...disjoint("dist", stems).map((stem) => `/:pkg/dist/${stem}-*`),
        ...disjoint("dist-raw", rawStems).map((stem) => `/:pkg/dist-raw/${stem}-*`),
    ];

    const total = revalidateRules.length + immutableRules.length;
    if (total > PAGES_HEADER_RULE_LIMIT) {
        warn(
            `${total} header rules exceeds the Cloudflare Pages limit of ` +
            `${PAGES_HEADER_RULE_LIMIT} — some chunks will not be cached immutably`
        );
    }

    const lines = [
        "# Generated by scripts/cache-headers.mts — do not edit by hand.",
        "#",
        "# Unhashed files first: entries, `index.js`, federation metadata and the",
        "# loader runtime. They are not content-addressed, so they revalidate on",
        "# every load or a deploy would not be picked up for four hours.",
        "#",
        "# Then content-hashed chunks, which are immutable.",
        "#",
        "# Rules must stay disjoint — Pages joins duplicate header values with a",
        "# comma rather than letting the most specific rule win.",
        "#",
        "# A stem is listed only if every chunk carrying it is exactly the bytes its",
        "# hash covers. Rollup appends the sourceMappingURL comment AFTER hashing, so",
        "# a chunk carrying one keeps revalidating: its url is not really immutable.",
        "#",
        "# dist-raw rules are a Perf Lab suite app's pre-combine snapshot; see",
        "# notes/PERF-LAB-DESIGN.md.",
        "",
    ];

    // Revalidate rules are never the ones cut: a missing one ships a stale deploy.
    for (const rule of revalidateRules) {
        lines.push(rule, `  Cache-Control: ${REVALIDATE}`, "");
    }
    for (const rule of immutableRules.slice(0, Math.max(0, PAGES_HEADER_RULE_LIMIT - revalidateRules.length))) {
        lines.push(rule, `  Cache-Control: ${IMMUTABLE}`, "");
    }

    return lines.join("\n");
}

export { generateCacheHeaders, PAGES_HEADER_RULE_LIMIT };
