/**
 * Minimal semver range matching, for resolving which registered version of a
 * middleware satisfies the range a consumer asked for (FYM-321).
 *
 * federation-js already ships a complete implementation
 * (`federation-js/dist/semver.js`) and is already a kernel dependency, so this
 * looks like a wheel being reinvented. It is not: the browser kernel is built
 * as an IIFE by a rollup config with no resolver plugin, and the kernel has no
 * runtime import of federation-js at all today - it reads `globalThis.Federation`.
 * Adding that import makes rollup report "Unresolved dependencies" and emit a
 * bundle whose `satisfy` is an undefined global. Verified, not assumed. Pulling
 * `@rollup/plugin-node-resolve` into the browser build to obtain one comparator
 * would change how the entire bundle is assembled, which is not a change this
 * ticket should be making.
 *
 * So the scope here is deliberately the ranges that create-fynapp's `genId`
 * actually emits - a package.json dependency range - and nothing more.
 *
 * Supported: `*` / `x` / empty, exact versions, `^`, `~`, `>`, `>=`, `<`, `<=`,
 * `=`, space-separated conjunctions (`>=1.0.0 <2.0.0`), and `||` alternatives.
 * Partial versions (`^1`, `~1.2`) are supported.
 *
 * Not supported, and reported as such rather than guessed at: hyphen ranges
 * (`1.0.0 - 2.0.0`), and non-range dependency specs (`workspace:*`, `file:..`,
 * dist-tags, git URLs). `isSupportedRange` exists so a caller can tell "no
 * version satisfies this range" apart from "this was never a range", and say
 * which - guessing between the two is how the silent mis-resolution this module
 * was written to fix got missed in the first place.
 *
 * Prerelease handling is simple on purpose: a prerelease sorts below its
 * release, and prereleases compare part-by-part. The npm rule that a range
 * without a prerelease never matches one is NOT implemented - a middleware
 * host published at `2.0.0-beta.1` will satisfy `^2.0.0` here.
 */

/** A version broken into its comparable pieces. */
type ParsedVersion = {
  /** major, minor, patch - missing pieces are 0 */
  parts: [number, number, number];
  /** how many of the three were actually written, for `^1` / `~1.2` semantics */
  specified: number;
  /** prerelease tag without the leading `-`, empty when there is none */
  pre: string;
};

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

const parse = (version: string): ParsedVersion | undefined => {
  const m = VERSION_RE.exec(version.trim());
  if (!m) {
    return undefined;
  }
  const specified = m[3] !== undefined ? 3 : m[2] !== undefined ? 2 : 1;
  return {
    parts: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)],
    specified,
    pre: m[4] ?? "",
  };
};

/** Compare prerelease tags: no tag beats any tag, otherwise dot-part by dot-part. */
const comparePre = (a: string, b: string): number => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      // numeric identifiers always have lower precedence than alphanumeric
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};

const compareParsed = (a: ParsedVersion, b: ParsedVersion): number => {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) {
      return a.parts[i] < b.parts[i] ? -1 : 1;
    }
  }
  return comparePre(a.pre, b.pre);
};

/**
 * Order two version strings. Anything unparseable sorts below everything, so a
 * junk key in the version map can never win a "highest satisfying" contest.
 */
export const compareVersions = (a: string, b: string): number => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return compareParsed(pa, pb);
};

/** `*`, `x`, `X` and the empty string all mean "any version". */
const isWildcard = (range: string): boolean => {
  const r = range.trim();
  return r === "" || r === "*" || r === "x" || r === "X";
};

/** Upper bound (exclusive) implied by `^`. */
const caretLimit = (v: ParsedVersion): [number, number, number] => {
  if (v.parts[0] !== 0) return [v.parts[0] + 1, 0, 0];
  if (v.parts[1] !== 0 || v.specified < 2) return [0, v.parts[1] + 1, 0];
  return [0, 0, v.parts[2] + 1];
};

/** Upper bound (exclusive) implied by `~`. */
const tildeLimit = (v: ParsedVersion): [number, number, number] => {
  if (v.specified === 1) return [v.parts[0] + 1, 0, 0];
  return [v.parts[0], v.parts[1] + 1, 0];
};

const asBound = (parts: [number, number, number]): ParsedVersion => ({
  parts,
  specified: 3,
  pre: "",
});

const PLACEHOLDER_RE = /^(x|X|\*)$/;

/**
 * Turn `1.x` into `1` and `1.2.X` into `1.2`, so an `x` placeholder is handled
 * as the partial version it means. A bare `x` becomes `*`.
 */
const normalizeOperand = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return trimmed;
  }
  // keep any prerelease/build suffix attached to the numeric core
  const [core, ...suffix] = trimmed.split(/(?=[-+])/);
  const segments = core.split(".");
  const kept: string[] = [];
  for (const segment of segments) {
    if (PLACEHOLDER_RE.test(segment)) {
      break;
    }
    kept.push(segment);
  }
  if (kept.length === 0) {
    return "*";
  }
  return kept.length === segments.length ? kept.join(".") + suffix.join("") : kept.join(".");
};

const COMPARATOR_RE = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/;

/**
 * Test one comparator (`^1.2.3`, `>=2.0.0`, `1.0.0`, …) against a version.
 * Returns undefined when the comparator is not one this module understands.
 */
const satisfiesComparator = (v: ParsedVersion, comparator: string): boolean | undefined => {
  const raw = comparator.trim();
  if (isWildcard(raw)) {
    return true;
  }

  const m = COMPARATOR_RE.exec(raw);
  if (!m) {
    return undefined;
  }
  const op = m[1] ?? "=";
  const operandStr = normalizeOperand(m[2]);
  if (isWildcard(operandStr)) {
    // `^x`, `~*`, `x` - all of them mean "any version"
    return true;
  }
  const operand = parse(operandStr);
  if (!operand) {
    return undefined;
  }

  switch (op) {
    case "^":
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(caretLimit(operand))) < 0;
    case "~":
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(tildeLimit(operand))) < 0;
    case ">":
      return compareParsed(v, operand) > 0;
    case ">=":
      return compareParsed(v, operand) >= 0;
    case "<":
      return compareParsed(v, operand) < 0;
    case "<=":
      return compareParsed(v, operand) <= 0;
    default: {
      // a bare partial version is a range: `1.2` means >=1.2.0 <1.3.0
      if (operand.specified === 3) {
        return compareParsed(v, operand) === 0;
      }
      const upper: [number, number, number] =
        operand.specified === 1
          ? [operand.parts[0] + 1, 0, 0]
          : [operand.parts[0], operand.parts[1] + 1, 0];
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(upper)) < 0;
    }
  }
};

/** Split `a || b` into alternatives, each a list of ANDed comparators. */
const alternatives = (range: string): string[][] =>
  range
    .split("||")
    .map((alt) => alt.trim().split(/\s+/).filter(Boolean))
    .map((parts) => (parts.length === 0 ? ["*"] : parts));

/**
 * Is `range` something this module can evaluate?
 *
 * Conservative by design: a `workspace:*`, a `file:` spec, a dist-tag or a
 * hyphen range answers false, so the caller reports "not a range I understand"
 * instead of "nothing satisfies it".
 */
export const isSupportedRange = (range: string): boolean => {
  if (typeof range !== "string") {
    return false;
  }
  if (isWildcard(range)) {
    return true;
  }
  const probe = parse("0.0.0")!;
  return alternatives(range).every((alt) =>
    alt.every((comparator) => satisfiesComparator(probe, comparator) !== undefined)
  );
};

/** Does `version` satisfy `range`? False for anything unparseable on either side. */
export const satisfiesRange = (version: string, range: string): boolean => {
  const v = parse(version);
  if (!v) {
    return false;
  }
  if (isWildcard(range)) {
    return true;
  }
  return alternatives(range).some((alt) =>
    alt.every((comparator) => satisfiesComparator(v, comparator) === true)
  );
};

/**
 * The highest of `versions` that satisfies `range`, or undefined when none does.
 */
export const maxSatisfying = (versions: string[], range: string): string | undefined => {
  let best: string | undefined;
  for (const version of versions) {
    if (satisfiesRange(version, range) && (best === undefined || compareVersions(version, best) > 0)) {
      best = version;
    }
  }
  return best;
};
