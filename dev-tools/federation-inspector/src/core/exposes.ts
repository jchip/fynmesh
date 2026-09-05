/**
 * The three levels at which an expose can "be there", and the one place each is
 * named and counted.
 *
 * Three surfaces were answering three different questions and printing all
 * three under the word "loaded", so `fynapp-1` read `2/5 exposes loaded` on
 * Containers, `ex 1/5` on FynApps, and nothing at all in the snapshot behind
 * them. None of the three was wrong; they were different questions:
 *
 * - **declared** -- the name is a key of `Container.$E`. What the build
 *   published. This is the denominator everywhere.
 * - **loaded** -- the loader has a record for the expose's chunk past
 *   `registered`, i.e. the chunk was really fetched and run. A chunk gets here
 *   without anyone importing the expose by name, because a *sibling* expose
 *   imported it: `fynapp-1`'s `./main` pulls in the chunk behind `./App`, which
 *   is exactly why that container reads 2 and not 1.
 * - **imported** -- the FynMesh kernel put the expose on `fynApp.exposes`.
 *   Someone asked for it by name. Only a page with a kernel has this level at
 *   all, so it is absent rather than zero on a plain federation page.
 *
 * `imported` implies `loaded` implies... nothing about `declared`: the kernel
 * can hand back an expose the container never declared, which is an anomaly and
 * is kept out of the fractions and reported on its own.
 *
 * Views render these. They do not compute them -- a view that recomputes a
 * shared fact is how all three numbers got to disagree in the first place.
 */

import type { ContainerVersionNode, FynAppNode, LoadStage } from "./model.js";

/**
 * Does a stage mean the loader really has this module?
 *
 * `undefined` is "the resolver found no module for that chunk id", `registered`
 * is "the loader knows the id but holds no record". Neither is a copy.
 */
export function isLoadedStage(stage: LoadStage | undefined): boolean {
  return !!stage && stage !== "registered";
}

export interface ExposeLevels {
  /** names `Container.$E` declares */
  declared: string[];
  /** declared names the loader has the chunk for; absent when unknowable here */
  loaded?: string[];
  /** declared names the kernel imported; absent when no kernel row covers this */
  imported?: string[];
  /** imported but never declared -- an anomaly, deliberately not in the fractions */
  undeclared?: string[];
  /**
   * declared names with no chunk of their own, inlined into the container entry
   *
   * Not a fourth level -- a property of a declared name that decides what the
   * other levels can ever say about it. An inlined expose can never be in
   * `loaded`, and there is no chunk on the Containers tab to go and look for,
   * so a view that sends the reader there for one is pointing at nothing.
   *
   * **Absent** where it cannot be known: a FynApp with no container version row
   * has no `$E` behind it, and "none are inlined" would be a made-up answer.
   */
  inlined?: string[];
}

/**
 * A container version's exposes, by level.
 *
 * `imported` is absent unless the FynMesh pass marked this version, so a plain
 * federation container reports two levels and says nothing about the third.
 */
export function containerExposeLevels(v: ContainerVersionNode): ExposeLevels {
  const levels: ExposeLevels = {
    declared: v.exposes.map((e) => e.name),
    loaded: v.exposes.filter((e) => e.loaded).map((e) => e.name),
    inlined: inlinedExposes(v),
  };
  if (v.importsKnown) {
    levels.imported = v.exposes.filter((e) => e.imported).map((e) => e.name);
  }
  return levels;
}

/**
 * Exposes declared with no chunk of their own, inlined into the container entry.
 *
 * They can never be counted in `loaded` -- there is no chunk -- so the header
 * says "chunks loaded" and the tooltip says how many exposes were never going
 * to be in that numerator.
 *
 * The one derivation of the fact. Both `containerExposeLevels` and the FynMesh
 * join read it -- the join so the FynApps view can say "no chunk of its own"
 * about the same names the Containers view says it about, instead of promising
 * a chunk that was never emitted.
 */
export function inlinedExposes(v: ContainerVersionNode): string[] {
  return v.exposes.filter((e) => !e.chunkId).map((e) => e.name);
}

/**
 * A FynApp's exposes, by level.
 *
 * `loaded` is absent: a FynApp node carries no chunk stages, and reporting the
 * imported count under that name is the confusion this module exists to end.
 * `inlined` is present when the collector joined a container version, and is
 * that version's own answer rather than a second reading of `$E`.
 * `imported` is the declared ones only, so it is the same set the container
 * version reports; anything the kernel returned that the build never declared
 * comes back under `undeclared` instead of quietly inflating a fraction.
 *
 * `imported` is absent for an app that has left the registry, under the same
 * `inRegistry` test `markImported` uses on the container side. Its `exposes`
 * and its `$E` are both unreadable, so `0/0` there is not a small number, it is
 * a made-up one -- and it would be a made-up number sitting next to a container
 * row that correctly says nothing at all, which is the shape of the bug this
 * module exists to end.
 */
export function fynAppExposeLevels(app: FynAppNode): ExposeLevels {
  const declared = app.declaredExposes;
  // a container-side fact, so it survives the app leaving the registry
  const inlined = app.inlinedExposes;
  if (!app.inRegistry) {
    return inlined ? { declared, inlined } : { declared };
  }
  const levels: ExposeLevels = {
    declared,
    imported: app.importedExposes.filter((name) => declared.includes(name)),
  };
  if (inlined) {
    levels.inlined = inlined;
  }
  const undeclared = app.importedExposes.filter((name) => !declared.includes(name));
  if (undeclared.length) {
    levels.undeclared = undeclared;
  }
  return levels;
}
