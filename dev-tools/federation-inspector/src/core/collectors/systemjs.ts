/**
 * The SystemJS half of a snapshot.
 *
 * Everything here comes from the fork's documented Record Exposure API --
 * `System.records`, `System.aliases`, `System.registrations`,
 * `System.stageOf` -- and from the `LoadRecord` fields that API is there to
 * expose. Nothing is written back: the types file reserves single- and
 * double-letter record fields for the loader core, and an inspector that
 * mutated them would be changing the thing it claims to be observing.
 *
 * Two id spaces show up in a record's `id`, and both are kept verbatim:
 * a url for an ordinary module, and a federation specifier (`__mf_container_x`,
 * `./chunk-abc.js`) for anything federation addressed by name.
 */

import type { LoadStage, ModuleNode, ModuleRef } from "../model.js";
import { safeGet, attempt, isFn } from "../capability.js";

/** What a collector pass hands back, before federation enriches it. */
export interface SystemJsCollection {
  modules: Map<string, ModuleNode>;
  /** module id -> the record object, so federation can cross-reference */
  records: Map<string, any>;
  /**
   * Specifier -> the canonical module id it redirects to.
   *
   * federation deliberately files a chunk twice: the specifier
   * (`./main-abc.js`) carries only a url, and the url carries the
   * registration. That is its "one file, one address" rule -- the specifier is
   * a redirect, never a second place to take the code from. So the specifier
   * is not a module, and this index is how a caller holding one (an exposes
   * map, a share source) finds the module it points at.
   */
  specifiers: Map<string, string>;
  /** ids that only exist as registrations, never instantiated */
  registeredOnly: string[];
  recordCount: number;
  registrationCount: number;
  baseUrl?: string;
  errors: string[];
}

/**
 * Does this id name a location, rather than a name federation coined?
 *
 * Two id spaces share the map (see the file header): an absolute url, and a
 * federation specifier -- `./chunk-abc.js`, `__mf_container_x`. An id in the
 * first space *is* the module's url, and it has to be read that way by every
 * path that files a module -- a record-backed one in pass 1, a
 * registration-only one in `registerOnly` -- or the same file carries a url
 * under one route and none under the other, which is what FYM-373 was.
 */
function looksLikeUrl(id: string): boolean {
  return /^[a-z]+:\/\//i.test(id) || id.startsWith("/");
}

/**
 * Derive a stage without `System.stageOf`.
 *
 * Deliberately coarser than the loader's own: `stageOf` walks the dependency
 * graph to tell `awaiting-deps` from `executed`, and guessing at that from a
 * single record is exactly the mistake its documentation warns about. So this
 * reports `executed` for both and lets the capability note say why.
 */
function fallbackStage(rec: any): LoadStage {
  if (safeGet(rec, "f")) {
    return "errored";
  }
  if (safeGet(rec, "E")) {
    return "executing";
  }
  const e = safeGet(rec, "e");
  if (e === null || e === undefined) {
    // `e` is nulled before execution begins, so null means "executed or later"
    return safeGet(rec, "d") ? "executed" : "instantiating";
  }
  if (safeGet(rec, "d")) {
    return "linked";
  }
  if (safeGet(rec, "I")) {
    return "instantiating";
  }
  return "instantiated";
}

function stageOf(loader: any, rec: any, useLoader: boolean): LoadStage {
  if (useLoader) {
    const s = attempt(() => loader.stageOf(rec));
    if (typeof s === "string") {
      return s as LoadStage;
    }
  }
  return fallbackStage(rec);
}

function errorOf(rec: any): { message: string; stack?: string } | undefined {
  // `f` is the reliable flag: `er` may itself be falsy (`throw 0` is legal),
  // which is exactly why the loader carries both.
  if (!safeGet(rec, "f")) {
    return undefined;
  }
  const er = safeGet(rec, "er");
  if (er instanceof Error) {
    return { message: er.message, stack: er.stack };
  }
  if (er && typeof er === "object") {
    const m = safeGet<string>(er, "message");
    if (typeof m === "string") {
      const stack = safeGet<string>(er, "stack");
      return { message: m, stack: typeof stack === "string" ? stack : undefined };
    }
  }
  return { message: er === undefined ? "Unknown error" : String(er) };
}

/**
 * Export names, when the module has run.
 *
 * The namespace is a real Module Namespace object for an executed module, so
 * enumerating it is safe; for anything earlier it is a bare object still being
 * filled in and the answer would be misleading, so it is left off entirely.
 */
function exportsOf(rec: any, stage: LoadStage): string[] | undefined {
  if (stage !== "executed") {
    return undefined;
  }
  const ns = safeGet(rec, "n");
  if (!ns || typeof ns !== "object") {
    return undefined;
  }
  return attempt(() => Object.keys(ns as object).sort());
}

/**
 * The loader's base url, read through its resolve rather than its private key.
 *
 * `[BASE_URL_KEY]` is a runtime-conditional symbol and not part of the exposed
 * contract; resolving "./" is the supported way to ask the same question.
 */
function baseUrlOf(loader: any): string | undefined {
  return attempt(() => loader.resolve("./"));
}

/**
 * Build the module table from one loader.
 *
 * Two passes, because dependents are the inverse of `deps` and cannot be known
 * until every record has contributed its own dependency list.
 */
export function collectSystemJs(
  loader: any,
  loaderIndex: number,
  cap: { records: boolean; registrations: boolean; aliases: boolean; stageOf: boolean }
): SystemJsCollection {
  const modules = new Map<string, ModuleNode>();
  const records = new Map<string, any>();
  const specifiers = new Map<string, string>();
  const registeredOnly: string[] = [];
  const errors: string[] = [];
  let seq = 0;

  // --- aliases, inverted: id -> the bare names pointing at it ------------
  const aliasesById = new Map<string, string[]>();
  let aliasCount = 0;
  if (cap.aliases) {
    attempt(() => {
      for (const [name, id] of loader.aliases) {
        aliasCount++;
        const list = aliasesById.get(id);
        if (list) {
          list.push(name);
        } else {
          aliasesById.set(id, [name]);
        }
      }
    });
  }

  // --- pass 1: one node per live record ---------------------------------
  let recordCount = 0;
  if (cap.records) {
    const iterated = attempt(() => {
      for (const [id, rec] of loader.records) {
        recordCount++;
        records.set(id, rec);
        const stage = stageOf(loader, rec, cap.stageOf);
        modules.set(id, {
          id,
          url: looksLikeUrl(id) ? id : undefined,
          kind: "unknown",
          stage,
          aliases: aliasesById.get(id) ?? [],
          deps: [],
          dependents: [],
          exports: exportsOf(rec, stage),
          error: errorOf(rec),
          loader: loaderIndex,
          seq: seq++,
        });
      }
      return true;
    });
    if (!iterated) {
      errors.push("System.records could not be iterated");
    }
  }

  // --- pass 2: dependency edges -----------------------------------------
  // `d` holds dependency *records*, not ids, and is only populated once the
  // load is linked -- so an unlinked module legitimately has no edges yet.
  for (const [id, rec] of records) {
    const node = modules.get(id)!;
    const deps = safeGet<any[]>(rec, "d");
    if (!Array.isArray(deps)) {
      continue;
    }
    for (const depRec of deps) {
      const depId = safeGet<string>(depRec, "id");
      if (typeof depId !== "string") {
        continue;
      }
      node.deps.push({ id: depId, missing: !modules.has(depId) || undefined });
    }
  }
  // invert
  for (const node of modules.values()) {
    for (const dep of node.deps) {
      const target = modules.get(dep.id);
      if (target) {
        target.dependents.push({ id: node.id });
      }
    }
  }

  // --- registrations: ids the loader knows about, instantiated or not ----
  //
  // Known to the loader, but never instantiated. Worth showing: a remote still
  // in flight, or a registration nothing ever consumed, both look like this and
  // both are things you go looking for.
  const registerOnly = (id: string, registration: ModuleNode["registration"]) => {
    registeredOnly.push(id);
    const node: ModuleNode = {
      id,
      // The entry is asked first -- a specifier's entry is the only thing that
      // knows its url -- and the id answers when it did not: federation's
      // url-keyed half deliberately carries no url of its own, so a lone one
      // (no specifier partner to supply it) would otherwise be the only module
      // in the snapshot whose id is a url and whose `url` is absent.
      url: registration?.url ?? (looksLikeUrl(id) ? id : undefined),
      kind: "unknown",
      stage: "registered",
      aliases: aliasesById.get(id) ?? [],
      deps: [],
      dependents: [],
      registration,
      loader: loaderIndex,
      seq: seq++,
    };
    modules.set(id, node);
    return node;
  };

  let registrationCount = 0;
  if (cap.registrations) {
    const regs = loader.registrations;
    const ok = attempt(() => {
      // Taken up front so the redirect branch below can ask whether a url is
      // itself a registered name -- the half of the pair that has no record
      // yet, and may not have been reached by this loop.
      const names: string[] = [...regs.keys()];
      const registered = new Set(names);

      for (const name of names) {
        registrationCount++;
        const qualifiers: string[] = attempt(() => regs.qualifiersOf(name)) ?? [];
        const entry = attempt(() => regs.get(name));
        const url = entry ? safeGet<string>(entry, "url") : undefined;
        const taken = entry ? !!safeGet(entry, "taken") : false;
        const pending = entry ? !!safeGet(entry, "registration") : false;

        const existing = modules.get(name);
        if (existing) {
          /*
           * The registration is read from the key that can hold one.
           *
           * A url-keyed entry deliberately carries no url of its own (only the
           * specifier entry enters federation's reverse index), so overwriting
           * a url already recovered from the specifier half would drop the one
           * fact this key never had. `pending` and `taken` are not merged and
           * not averaged: the url half writes them through here, and the
           * specifier half only ever seeds a row that has none, so for a pair
           * the half that can hold code is the half that answers -- whichever
           * order the loader hands the two keys over in.
           */
          existing.registration = {
            qualifiers,
            url: url ?? existing.registration?.url,
            taken,
            pending,
          };
          if (!existing.url && url) {
            existing.url = url;
          }
          continue;
        }

        /*
         * A redirect, not a module.
         *
         * When this name carries a url, the two are one module: federation
         * registers the specifier with a url and no registration, and the url
         * with the registration, precisely so that the module has exactly ONE
         * address -- and that address is the url ("there is exactly one id for
         * the member", combined-module-bundles.md 5.3). Making a row for each
         * would show every code-split chunk twice and -- worse -- would trip
         * the duplicate-address diagnostic on a page where nothing is wrong.
         *
         * So the specifier becomes an alias of the module it points at, and
         * the index records the mapping for callers holding a specifier.
         *
         * The target does not have to be a live record. A combined-bundle
         * member nobody has imported is the resting state of that pair: the
         * url side holds the registration and no record exists yet. It is
         * still one module, and it is already reachable under the id it will
         * keep once something instantiates it, so it is filed there now rather
         * than under an address that would change out from under a reader.
         * Folding is limited to a specifier holding no registration of its
         * own, which is federation's fingerprint for the redirect half; a name
         * that carries real code is never merged away.
         */
        if (url && url !== name && (modules.has(url) || (!pending && registered.has(url)))) {
          const target =
            modules.get(url) ??
            registerOnly(url, {
              // seeded from the redirect half; the url's own key overwrites it
              // with the registration facts when this loop reaches it
              qualifiers,
              url,
              taken,
              pending,
            });
          specifiers.set(name, url);
          if (!target.aliases.includes(name)) {
            target.aliases.push(name);
          }
          if (!target.url) {
            target.url = url;
          }
          if (!target.registration) {
            target.registration = { qualifiers, url, taken, pending };
          }
          continue;
        }

        registerOnly(name, { qualifiers, url, taken, pending });
      }
      return true;
    });
    if (!ok) {
      errors.push("System.registrations could not be iterated");
    }
  }

  // A url may also be registered under a qualified (versioned) slot that
  // `keys()` does not enumerate -- `keys()` is unqualified names only. Fill
  // those in from the qualifiers we already have.
  if (cap.registrations) {
    const regs = loader.registrations;
    for (const node of modules.values()) {
      const quals = node.registration?.qualifiers;
      if (!quals || quals.length === 0 || node.url) {
        continue;
      }
      for (const q of quals) {
        const entry = attempt(() => regs.get(node.id, q));
        const url = entry ? safeGet<string>(entry, "url") : undefined;
        if (url) {
          node.url = url;
          break;
        }
      }
    }
  }

  void aliasCount;

  return {
    modules,
    records,
    specifiers,
    registeredOnly,
    recordCount,
    registrationCount,
    baseUrl: isFn(safeGet(loader, "resolve")) ? baseUrlOf(loader) : undefined,
    errors,
  };
}

/** Re-derive `dependents` after federation has added or removed nodes. */
export function reindexDependents(modules: Map<string, ModuleNode>): void {
  for (const node of modules.values()) {
    node.dependents = [];
  }
  for (const node of modules.values()) {
    for (const dep of node.deps) {
      const target = modules.get(dep.id);
      dep.missing = target ? undefined : true;
      if (target) {
        target.dependents.push({ id: node.id } as ModuleRef);
      }
    }
  }
}
