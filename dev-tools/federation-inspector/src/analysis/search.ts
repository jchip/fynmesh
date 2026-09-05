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
 *   url:<exact url>
 *   -stage:executed            any term may be negated with a leading "-"
 */

import type { ModuleNode } from "../core/model.js";

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
  // quoted values keep their spaces; everything else splits on whitespace
  const re = /(-?)(?:([a-zA-Z]+):)?(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const negated = m[1] === "-";
    const field = m[2]?.toLowerCase();
    const raw = m[3] ?? m[4] ?? "";
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
      return fuzzy(v, m.id) || (m.url ? fuzzy(v, m.url) : false) ||
        m.aliases.some((a) => fuzzy(v, a));
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
    case "bundle":
      return v === "true" || v === "1" ? !!m.bundle : !m.bundle;
    case "orphan":
      return (v === "true" || v === "1") === (m.deps.length === 0 && m.dependents.length === 0);
    case "error":
      return (v === "true" || v === "1") === !!m.error;
    case "alias":
      return m.aliases.some((a) => a.toLowerCase().includes(v));
    case "deps":
      return compare(m.deps.length, term.op, term.num ?? 0);
    case "dependents":
      return compare(m.dependents.length, term.op, term.num ?? 0);
    case "loader":
      return String(m.loader) === v;
    default:
      // an unknown field is treated as free text rather than matching nothing,
      // so a typo narrows the list instead of emptying it
      return fuzzy(term.field + ":" + v, m.id);
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
export function toggleFacet(query: string, field: string, value: string): string {
  const token = `${field}:${value}`;
  const terms = parseQuery(query);
  const has = terms.some((t) => t.field === field && t.value === value && !t.negated);

  if (has) {
    return query
      .replace(new RegExp(`(^|\\s)${escapeRe(token)}(?=\\s|$)`, "i"), "$1")
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
