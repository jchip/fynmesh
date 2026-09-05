/**
 * A small semver range matcher.
 *
 * Why not reuse federation's: `federation-js` has its own `semver.ts` and it,
 * not this, is what actually decides which version federation resolves to --
 * but it is internal to that bundle's IIFE and unreachable at runtime. So the
 * inspector carries its own, and every answer derived from it is a *report of
 * what should have matched*, not a replay of what federation did. Where the
 * two could disagree is on exotic ranges; the common forms a build emits
 * (`^x.y.z`, `~x.y`, comparator pairs, `||` unions, `x`/`*` wildcards) are
 * covered and agree with node-semver.
 *
 * Deliberately not supported, because no rollup-federation build emits them:
 * hyphen ranges (`1.2.3 - 2.0.0`) are handled, but pre-release ordering
 * follows the simple rule below rather than node-semver's full
 * "includePrerelease" semantics.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** dot-separated pre-release identifiers, empty for a release */
  pre: Array<string | number>;
}

const VERSION_RE = /^[v=\s]*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?\s*$/;

export function parseVersion(v: string): ParsedVersion | undefined {
  const m = VERSION_RE.exec(v);
  if (!m) {
    return undefined;
  }
  return {
    major: Number(m[1]),
    minor: m[2] === undefined ? 0 : Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    pre: m[4]
      ? m[4].split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p))
      : [],
  };
}

/** -1, 0 or 1, with a pre-release sorting below its release. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.pre.length === 0 && b.pre.length === 0) return 0;
  if (a.pre.length === 0) return 1;
  if (b.pre.length === 0) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = typeof x === "number";
    const ny = typeof y === "number";
    if (nx && ny) return (x as number) < (y as number) ? -1 : 1;
    if (nx) return -1;
    if (ny) return 1;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

/** Compare two version strings; unparseable sorts last. */
export function compareVersionStrings(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa && !pb) return a.localeCompare(b);
  if (!pa) return 1;
  if (!pb) return -1;
  return compareVersions(pa, pb);
}

type Op = ">" | ">=" | "<" | "<=" | "=";
type Comparator = { op: Op; v: ParsedVersion } | { op: "*" };

/** Expand one range atom (`^1.2.3`, `~1.2`, `1.x`, `>=1`) to comparators. */
function expandAtom(atom: string): Comparator[] | undefined {
  const a = atom.trim();
  if (a === "" || a === "*" || a === "x" || a === "X" || a === "latest") {
    return [{ op: "*" }];
  }

  const opMatch = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(a);
  if (!opMatch) {
    return undefined;
  }
  const op = (opMatch[1] ?? "=") as Op | "^" | "~";
  const rest = opMatch[2].trim();

  // wildcard forms: 1.x, 1.2.x, 1, 1.2 -- these are ranges, not points
  const wild = /^(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?$/.exec(rest);
  const isWild =
    wild &&
    (wild[2] === undefined ||
      wild[2] === "x" ||
      wild[2] === "X" ||
      wild[2] === "*" ||
      wild[3] === undefined ||
      wild[3] === "x" ||
      wild[3] === "X" ||
      wild[3] === "*");

  const parsed = parseVersion(rest.replace(/[xX*]/g, "0"));
  if (!parsed) {
    return undefined;
  }

  if (op === "^") {
    // caret: up to the next non-zero leading segment
    const upper: ParsedVersion =
      parsed.major !== 0
        ? { major: parsed.major + 1, minor: 0, patch: 0, pre: [] }
        : parsed.minor !== 0
          ? { major: 0, minor: parsed.minor + 1, patch: 0, pre: [] }
          : { major: 0, minor: 0, patch: parsed.patch + 1, pre: [] };
    return [
      { op: ">=", v: parsed },
      { op: "<", v: upper },
    ];
  }

  if (op === "~") {
    // tilde: patch-level when a minor was given, minor-level otherwise
    const gaveMinor = /^\d+\.\d+/.test(rest);
    const upper: ParsedVersion = gaveMinor
      ? { major: parsed.major, minor: parsed.minor + 1, patch: 0, pre: [] }
      : { major: parsed.major + 1, minor: 0, patch: 0, pre: [] };
    return [
      { op: ">=", v: parsed },
      { op: "<", v: upper },
    ];
  }

  if (op === "=" && isWild && wild) {
    const gaveMinor = wild[2] !== undefined && /^\d+$/.test(wild[2]);
    const upper: ParsedVersion = gaveMinor
      ? { major: parsed.major, minor: parsed.minor + 1, patch: 0, pre: [] }
      : { major: parsed.major + 1, minor: 0, patch: 0, pre: [] };
    // an exact 1.2.3 falls through to a point match; only wildcards get here
    if (wild[3] === undefined || !/^\d+$/.test(wild[3]) || !gaveMinor) {
      return [
        { op: ">=", v: parsed },
        { op: "<", v: upper },
      ];
    }
  }

  return [{ op: op as Op, v: parsed }];
}

function testComparator(v: ParsedVersion, c: Comparator): boolean {
  if (c.op === "*") {
    return true;
  }
  const cmp = compareVersions(v, c.v);
  switch (c.op) {
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case "=":
      return cmp === 0;
    default:
      return false;
  }
}

/**
 * Does `version` satisfy `range`?
 *
 * Returns `undefined` -- not `false` -- when the range or version cannot be
 * parsed, so a caller can tell "does not match" apart from "cannot say". That
 * distinction matters: reporting an unparseable range as a violation would
 * manufacture issues out of the inspector's own limitations.
 */
export function satisfies(version: string, range: string): boolean | undefined {
  const v = parseVersion(version);
  if (!v) {
    return undefined;
  }
  const r = range.trim();
  if (r === "" || r === "*" || r === "x" || r === "latest") {
    return true;
  }

  for (const union of r.split("||")) {
    // hyphen range: "1.2.3 - 2.0.0"
    const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(union);
    const atoms = hyphen
      ? [">=" + hyphen[1], "<=" + hyphen[2]]
      : union.trim().split(/\s+/).filter(Boolean);

    let all = true;
    let parseable = true;
    for (const atom of atoms) {
      const comparators = expandAtom(atom);
      if (!comparators) {
        parseable = false;
        break;
      }
      if (!comparators.every((c) => testComparator(v, c))) {
        all = false;
        break;
      }
    }
    if (!parseable) {
      return undefined;
    }
    if (all && atoms.length > 0) {
      return true;
    }
  }
  return false;
}

/** Highest version in `versions` satisfying `range`, or undefined. */
export function maxSatisfying(
  versions: string[],
  range: string
): string | undefined {
  let best: string | undefined;
  for (const v of versions) {
    if (satisfies(v, range) === true) {
      if (!best || compareVersionStrings(v, best) > 0) {
        best = v;
      }
    }
  }
  return best;
}
