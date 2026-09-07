import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { HASHED_CHUNK_RE } from "./shell-preload.mts";

/** Cloudflare Pages allows at most 100 header rules in a `_headers` file. */
const PAGES_HEADER_RULE_LIMIT = 100;

const IMMUTABLE = "public, max-age=31536000, immutable";

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
 * Generate the body of a Cloudflare Pages `_headers` file that marks
 * content-hashed chunks as immutable.
 *
 * Background: Pages' default for everything is
 * `public, max-age=14400, must-revalidate`. That is correct for mutable files
 * but wasteful for content-addressed ones — after four hours a returning
 * visitor revalidates every chunk (~58ms per 304), serialized behind the
 * loader, for zero changed bytes.
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
 * `<stem>-` prefix. Those, along with `federation.json`, `fynapp.manifest.json`
 * and `federation.bundles.json`, keep the revalidating default, which is
 * required: they are not content-addressed, so freezing them would break
 * deploys. A frozen bundle map is the worst of them — it would name carrier
 * files a later deploy no longer has.
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

    const stems = new Set<string>();
    /** stem -> the first chunk found carrying content rollup did not hash */
    const unsealed = new Map<string, string>();

    for (const pkg of readdirSync(outputDir)) {
        const distDir = path.join(outputDir, pkg, "dist");
        if (!existsSync(distDir) || !statSync(distDir).isDirectory()) continue;

        for (const entry of readdirSync(distDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                // A nested hashed chunk would not match `/:pkg/dist/<stem>-*`.
                // It keeps the default (safe), but flag it so the pattern can be
                // revisited if the build layout ever changes.
                const nested = readdirSync(path.join(distDir, entry.name));
                if (nested.some(f => HASHED_CHUNK_RE.test(f))) {
                    warn(`hashed chunks under ${pkg}/dist/${entry.name}/ are not covered by the immutable rules`);
                }
                continue;
            }
            const stem = entry.name.match(HASHED_CHUNK_RE)?.[1];
            if (!stem) continue;

            /*
             * One rule covers a stem across every package, so a single chunk
             * with appended content disqualifies the whole stem -- there is no
             * way to exempt one file from `/:pkg/dist/<stem>-*`.
             */
            if (isSealed(path.join(distDir, entry.name))) {
                stems.add(stem);
            } else if (!unsealed.has(stem)) {
                unsealed.set(stem, `${pkg}/dist/${entry.name}`);
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

    if (stems.size === 0) return null;

    if (stems.size > PAGES_HEADER_RULE_LIMIT) {
        warn(
            `${stems.size} chunk stems exceeds the Cloudflare Pages limit of ` +
            `${PAGES_HEADER_RULE_LIMIT} header rules — some chunks will not be cached immutably`
        );
    }

    const lines = [
        "# Generated by scripts/cache-headers.mts — do not edit by hand.",
        "#",
        "# Content-hashed chunks only. `fynapp-entry.js`, `index.js`,",
        "# `federation.json`, `fynapp.manifest.json` and `federation.bundles.json`",
        "# are intentionally absent: they are not content-addressed, so they must",
        "# keep revalidating or a deploy would not be picked up.",
        "#",
        "# Rules must stay disjoint — Pages joins duplicate header values with a",
        "# comma rather than letting the most specific rule win.",
        "#",
        "# A stem is listed only if every chunk carrying it is exactly the bytes its",
        "# hash covers. Rollup appends the sourceMappingURL comment AFTER hashing, so",
        "# a chunk carrying one keeps revalidating: its url is not really immutable.",
        "",
    ];

    for (const stem of [...stems].sort().slice(0, PAGES_HEADER_RULE_LIMIT)) {
        lines.push(`/:pkg/dist/${stem}-*`, `  Cache-Control: ${IMMUTABLE}`, "");
    }

    return lines.join("\n");
}

export { generateCacheHeaders, PAGES_HEADER_RULE_LIMIT };
