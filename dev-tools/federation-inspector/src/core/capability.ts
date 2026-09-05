/**
 * Capability probing.
 *
 * The two runtimes this tool reads are moving targets in one specific way:
 * `federation-js` ships a terser-minified build that mangles some of its own
 * property names and not others, and which ones is not guessable from the
 * source: `only_annotated` is an allow-list, so `/*@__MANGLE_PROP__*\/` marks a
 * name for *removal*, and esbuild drops the comment on a `this.x = ...`
 * statement, so a good half of the annotations never reach terser at all.
 *
 * Measured by grepping the shipped `federation-js.min.js`: `$SS`, `$SC`, `$E`,
 * `$C`, `$B`, `options` and the `_mf*` methods are all present; `rvm`,
 * `versions` (the two maps `Container._S` builds), `getUrlForId`,
 * `getRegDefForId` and `_mfGetContainer` are gone.
 *
 * So a probe is not paranoia about a missing global -- it is the normal case
 * on a production page. Everything here answers "can I read this?" without
 * throwing, and records why not, so the UI can say which part of the picture
 * is missing instead of rendering a confusingly empty table.
 */

import type { Capability } from "./model.js";
import { emptyCapability } from "./model.js";

/** Read a property without letting a hostile or exotic getter escape. */
export function safeGet<T = unknown>(obj: unknown, key: string): T | undefined {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj !== "function") {
      return undefined;
    }
  }
  try {
    return (obj as Record<string, T>)[key];
  } catch {
    return undefined;
  }
}

/** Run a probe, swallowing anything it throws. */
export function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function isFn(v: unknown): v is (...args: any[]) => any {
  return typeof v === "function";
}

/** A `Map`-shaped thing, which is what the fork's exposure API returns. */
export function isMapLike(v: unknown): boolean {
  return !!v && isFn(safeGet(v, "get")) && isFn(safeGet(v, "has"));
}

export interface Probes {
  loader: any;
  federation: any;
  capability: Capability;
}

/**
 * Work out what we are looking at.
 *
 * `loader` defaults to `globalThis.System` and `federation` to
 * `globalThis.Federation`, which is where `federation-js` installs itself
 * (`_global.Federation = new FederationJS()` at the foot of its entry).
 */
export function probe(loader?: unknown, federation?: unknown): Probes {
  const g = globalThis as any;
  const S = loader ?? g.System;
  const F = federation ?? g.Federation;
  const cap = emptyCapability();

  if (!S) {
    cap.notes.push(
      "No SystemJS loader found (globalThis.System is undefined). Nothing to inspect."
    );
    return { loader: undefined, federation: F, capability: cap };
  }

  cap.records = isMapLike(safeGet(S, "records"));
  cap.registrations = isMapLike(safeGet(S, "registrations"));
  cap.aliases = isMapLike(safeGet(S, "aliases"));
  cap.stageOf = isFn(safeGet(S, "stageOf"));

  if (!cap.records) {
    cap.notes.push(
      "System.records is missing: this looks like stock SystemJS rather than " +
        "@fynmesh/systemjs, so module records cannot be read. Only ids the " +
        "registry exposes will be listed."
    );
  }
  if (!cap.registrations) {
    cap.notes.push(
      "System.registrations is missing: container versions and pending " +
        "registrations are unavailable."
    );
  }
  if (!cap.stageOf) {
    cap.notes.push(
      "System.stageOf is missing: load stages are derived locally and may " +
        "not distinguish awaiting-deps from executed."
    );
  }

  cap.federation = !!F;
  if (!F) {
    cap.notes.push(
      "No Federation runtime found: showing this page as a plain SystemJS " +
        "module registry."
    );
    return { loader: S, federation: undefined, capability: cap };
  }

  const shareStore = safeGet(F, "$SS");
  cap.shareStore = !!shareStore && typeof shareStore === "object";
  if (!cap.shareStore) {
    cap.notes.push(
      "Federation.$SS is unreadable: share scopes, versions and providers " +
        "cannot be listed. This is expected if federation-js was built with " +
        "different mangling than the shipped one."
    );
  }

  cap.bundleMap = isFn(safeGet(F, "bundleUrlFor"));
  if (!cap.bundleMap) {
    cap.notes.push(
      "Federation.bundleUrlFor is missing: combined-bundle membership is unknown."
    );
  }

  // $SC / $E / manifest live on Container instances, not on the runtime, so
  // they are confirmed by the federation collector once it has one in hand.
  return { loader: S, federation: F, capability: cap };
}
