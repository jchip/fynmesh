/**
 * The query language behind the single search box.
 *
 * One box rather than a row of dropdowns, because the filter state then has a
 * textual form: a facet chip writes into the same string a person can type,
 * an Issue row deep-links by setting it, and the whole UI state is one
 * copy-pasteable token. Bare words fuzzy-match the id and url; everything else
 * is `field:value`.
 *
 *   esm-react                  fuzzy over id + url
 *   container:fynapp-1         exact-ish, case-insensitive substring
 *   stage:errored              one of the LoadStage values
 *   kind:exposed               one of the ModuleKind values
 *   scope:fynmesh
 *   share:esm-react
 *   version:19
 *   bundle:true                arrived inside a combined file
 *   orphan:true                no deps and no dependents
 *   deps:>3   dependents:>=1   numeric comparison
 *   id:<exact id>              exact match, used by deep links
 *   url:<exact or substring>   exact match, or a case-insensitive substring
 *   -stage:executed            any term may be negated with a leading "-"
 *
 * Boolean fields (`bundle`, `orphan`, `error`) accept `true`/`yes`/`1`/`on`,
 * a bare `error:` with no value, and their falsy counterparts; anything else
 * is unparseable and matches nothing, rather than being read as false and
 * silently inverting the result.
 */

import type { ModuleNode, ShareScopeNode, ShareVersionNode } from "../core/model.js";

export interface Term {
  field?: string;
  value: string;
  negated: boolean;
  /** for numeric fields: the comparison operator */
  op?: ">" | ">=" | "<" | "<=" | "=";
  num?: number;
}

const NUMERIC_FIELDS = new Set(["deps", "dependents"]);

export function parseQuery(input: string): Term[] {
  const terms: Term[] = [];
  // quoted values keep their spaces; everything else splits on whitespace.
  // The value after "field:" is optional (but a field-less token still needs
  // one) so a bare "error:" parses as the field with an empty value, rather
  // than falling through to matching the literal text "error:".
  const re = /(-?)(?:([a-zA-Z]+):(?:"([^"]*)"|(\S+))?|"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const negated = m[1] === "-";
    const field = m[2]?.toLowerCase();
    const raw = m[3] ?? m[4] ?? m[5] ?? m[6] ?? "";
    if (!raw && !field) {
      continue;
    }

    if (field && NUMERIC_FIELDS.has(field)) {
      const cmp = /^(>=|<=|>|<|=)?\s*(\d+)$/.exec(raw);
      if (cmp) {
        terms.push({
          field,
          value: raw,
          negated,
          op: (cmp[1] as Term["op"]) ?? "=",
          num: Number(cmp[2]),
        });
        continue;
      }
    }
    terms.push({ field, value: raw, negated });
  }
  return terms;
}

/**
 * Subsequence match: "erd" matches "esm-react-dom".
 *
 * Chosen over a substring match because module ids are long, hyphenated and
 * hash-suffixed, and typing the middle of one is how you actually look for it.
 */
export function fuzzy(needle: string, haystack: string): boolean {
  if (!needle) {
    return true;
  }
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h.includes(n)) {
    return true;
  }
  let i = 0;
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) {
      i++;
    }
  }
  return i === n.length;
}

/**
 * Reads a boolean field's raw text.
 *
 * Returns `undefined` for anything unrecognised. Every boolean field call
 * site must treat that as "matches nothing" rather than falling back to
 * `false`, because `false` is itself a meaningful answer (e.g. `error:false`)
 * and collapsing "didn't parse" into it is exactly the inversion bug this
 * exists to prevent.
 */
function parseBool(raw: string): boolean | undefined {
  switch (raw) {
    case "":
    case "true":
    case "yes":
    case "1":
    case "on":
      return true;
    case "false":
    case "no":
    case "0":
    case "off":
      return false;
    default:
      return undefined;
  }
}

/**
 * The free-text match a bare word (or an unrecognised `field:`) falls back
 * to. Quoted phrases keep their spaces through `parseQuery`, but nothing in
 * this data ever contains a literal space, so matching the phrase whole
 * would never hit anything; splitting it on whitespace and requiring each
 * word to independently match id, url or an alias is what makes a quoted
 * multi-word search actually narrow the list instead of always coming up
 * empty.
 */
function freeTextMatch(m: ModuleNode, raw: string): boolean {
  const words = raw.split(/\s+/).filter(Boolean);
  return words.every(
    (w) => fuzzy(w, m.id) || (m.url ? fuzzy(w, m.url) : false) || m.aliases.some((a) => fuzzy(w, a))
  );
}

function compare(actual: number, op: Term["op"], expected: number): boolean {
  switch (op) {
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
    default:
      return actual === expected;
  }
}

function matchTerm(m: ModuleNode, term: Term): boolean {
  const v = term.value.toLowerCase();

  switch (term.field) {
    case undefined:
      return freeTextMatch(m, v);
    case "id":
      return m.id === term.value;
    case "url":
      return m.url === term.value || (m.url ? m.url.toLowerCase().includes(v) : false);
    case "container":
      return !!m.container && m.container.name.toLowerCase().includes(v);
    case "stage":
      return m.stage === v;
    case "kind":
      return m.kind === v;
    case "scope":
      return (m.scope ?? "").toLowerCase().includes(v);
    case "share":
      return (m.shareKey ?? "").toLowerCase().includes(v);
    case "version":
      return (
        (m.version ?? "").startsWith(term.value) ||
        (m.container?.version ?? "").startsWith(term.value)
      );
    case "bundle": {
      const wanted = parseBool(v);
      return wanted === undefined ? false : wanted === !!m.bundle;
    }
    case "orphan": {
      const wanted = parseBool(v);
      return wanted === undefined
        ? false
        : wanted === (m.deps.length === 0 && m.dependents.length === 0);
    }
    case "error": {
      const wanted = parseBool(v);
      return wanted === undefined ? false : wanted === !!m.error;
    }
    case "alias":
      return m.aliases.some((a) => a.toLowerCase().includes(v));
    case "deps":
      // an unparseable comparison (deps:abc) leaves op unset; treating that
      // as "= 0" would answer a question nobody asked, so it matches nothing
      return term.op !== undefined && compare(m.deps.length, term.op, term.num ?? 0);
    case "dependents":
      return term.op !== undefined && compare(m.dependents.length, term.op, term.num ?? 0);
    case "loader":
      return String(m.loader) === v;
    default:
      // an unknown field is treated as free text rather than matching nothing
      // (a typo narrows the list instead of emptying it): drop the field name
      // and reuse the same bare-word match id/url/aliases get, rather than
      // reassembling "field:value" and matching that literal string against
      // the id -- which, with the colon back in, could never actually hit
      return freeTextMatch(m, v);
  }
}

export function matches(m: ModuleNode, terms: Term[]): boolean {
  for (const term of terms) {
    const hit = matchTerm(m, term);
    if (term.negated ? hit : !hit) {
      return false;
    }
  }
  return true;
}

export function filterModules(modules: ModuleNode[], query: string): ModuleNode[] {
  const terms = parseQuery(query);
  if (!terms.length) {
    return modules;
  }
  return modules.filter((m) => matches(m, terms));
}

/**
 * Add or replace a single facet in an existing query.
 *
 * Facet chips are toggles over the same string a person types, so clicking
 * "errored" twice has to remove it again rather than appending a second copy.
 */
/**
 * The Shares tab's filter.
 *
 * Mostly a plain substring against the key and scope name: a person typing
 * "esm-react" in that tab means the share, not a module id, so the module
 * grammar above does not apply. `container:` is the exception -- it is the
 * facet the other tabs write when you click a container chip, and it has an
 * obvious meaning here ("what does this container share?"), so arriving from
 * Modules or Containers with one in the query narrows this tab instead of
 * emptying it.
 *
 * Returns fresh objects; the snapshot is never mutated.
 */
export function filterScopes(scopes: ShareScopeNode[], query: string): ShareScopeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return scopes;
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const wanted = terms
    .filter((t) => t.startsWith("container:"))
    .map((t) => t.slice("container:".length))
    .filter(Boolean);
  const needle = terms
    .filter((t) => !t.startsWith("container:"))
    .join(" ")
    .replace(/^share:/, "");

  const involves = (v: ShareVersionNode) =>
    wanted.every(
      (c) =>
        v.sources.some((s) => s.container.toLowerCase().includes(c)) ||
        v.consumers.some((s) => s.container.toLowerCase().includes(c))
    );

  return scopes
    .map((s) => ({
      ...s,
      keys: s.keys
        .filter((k) => k.key.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle))
        // a container narrows to the versions it actually touches, and drops
        // the key when it touches none. `loadedCount` is recounted with it, or
        // the header reads "1 version . 2 loaded".
        .map((k) => {
          if (!wanted.length) {
            return k;
          }
          const versions = k.versions.filter(involves);
          return { ...k, versions, loadedCount: versions.filter((v) => v.loaded).length };
        })
        // only a facet can empty a key's version list; an unfiltered key with
        // no versions is a real thing to show, not something to hide
        .filter((k) => !wanted.length || k.versions.length),
    }))
    .filter((s) => s.keys.length);
}

/**
 * What state one facet (a specific field=value pair) is currently in.
 *
 * Exported so the UI can render a chip's pressed/negated state without
 * re-deriving it with its own copy of this lookup -- `toggleFacet` and the
 * chip rendering have to agree on what "on" and "negated" mean, or a chip
 * can show pressed for a facet the query doesn't actually select.
 */
export function facetState(query: string, field: string, value: string): "on" | "negated" | "off" {
  const match = parseQuery(query).find((t) => t.field === field && t.value === value);
  if (!match) {
    return "off";
  }
  return match.negated ? "negated" : "on";
}

export function toggleFacet(query: string, field: string, value: string): string {
  const token = `${field}:${value}`;
  // on or negated, clicking the facet again clears it -- a negated facet
  // that only flipped back to positive could never be turned off, since
  // "positive" is also where clicking an absent facet lands you
  const present = facetState(query, field, value) !== "off";

  if (present) {
    return query
      .replace(new RegExp(`(^|\\s)-?${escapeRe(token)}(?=\\s|$)`, "i"), "$1")
      .trim()
      .replace(/\s+/g, " ");
  }
  // replace any other value for the same single-valued field
  const stripped = query
    .replace(new RegExp(`(^|\\s)-?${escapeRe(field)}:\\S+(?=\\s|$)`, "gi"), "$1")
    .trim();
  return (stripped ? stripped + " " : "") + token;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
