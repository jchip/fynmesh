/**
 * Share resolution: joining what containers asked for to what they got.
 *
 * The share store records what was *provided* -- versions, and which container
 * supplied each. Each container separately records what it *requested*, as a
 * semver range in its share config. Neither side references the other, so the
 * question every federation bug starts with -- "who asked for what, and did
 * they get it" -- has no single place to read it from. This computes the join
 * and writes it back into the snapshot: consumers onto each share version, a
 * `resolved` block onto each container's declarations.
 *
 * This mutates the snapshot in place, which is safe because a snapshot is
 * freshly built per collect and is never shared between collects.
 */

import type {
  ContainerNode,
  ShareDecl,
  ShareScopeNode,
  ShareVersionNode,
  Snapshot,
} from "../core/model.js";
import { maxSatisfying, satisfies, compareVersionStrings } from "./semver.js";

/**
 * Which version a container asking for `range` in `scope/key` ends up on.
 *
 * Mirrors federation's own policy as documented on `AddShareOptions`:
 *
 * - a **singleton** collapses the scope to one copy, and every consumer gets
 *   it even when its own range excludes it (federation warns, and so do we);
 * - otherwise the highest *loaded* version satisfying the range wins, because
 *   a copy that exists is preferred to one that would have to be fetched;
 * - failing that, the highest declared version satisfying the range;
 * - failing that, nothing, and the mismatch is the answer.
 */
function resolveFor(
  key: { versions: ShareVersionNode[]; singleton: boolean },
  range: string | undefined
): { version?: string; url?: string; satisfies: boolean; reason?: string } {
  const loaded = key.versions.filter((v) => v.loaded || v.url);
  const all = key.versions;

  if (key.singleton) {
    // one copy for the whole scope: whichever is actually in play
    const chosen =
      loaded.slice().sort((a, b) => compareVersionStrings(b.version, a.version))[0] ??
      all[0];
    if (!chosen) {
      return { satisfies: false, reason: "singleton declared but no copy provided" };
    }
    const ok = range ? satisfies(chosen.version, range) : true;
    return {
      version: chosen.version,
      url: chosen.url,
      satisfies: ok !== false,
      reason:
        ok === false
          ? `singleton resolves to ${chosen.version}, which does not satisfy ${range}`
          : ok === undefined
            ? `range ${range} could not be parsed`
            : undefined,
    };
  }

  if (!range) {
    const chosen = loaded[0] ?? all[0];
    return chosen
      ? { version: chosen.version, url: chosen.url, satisfies: true }
      : { satisfies: false, reason: "no version provided" };
  }

  const pickFrom = (list: ShareVersionNode[]) => {
    const best = maxSatisfying(list.map((v) => v.version), range);
    return best ? list.find((v) => v.version === best) : undefined;
  };

  const chosen = pickFrom(loaded) ?? pickFrom(all);
  if (chosen) {
    return { version: chosen.version, url: chosen.url, satisfies: true };
  }

  const available = all.map((v) => v.version).join(", ") || "none";
  return {
    satisfies: false,
    reason: `nothing satisfies ${range} (available: ${available})`,
  };
}

function findKey(
  scopes: ShareScopeNode[],
  scopeName: string,
  key: string
): ShareScopeNode["keys"][number] | undefined {
  const scope =
    scopes.find((s) => s.name === scopeName) ??
    // a container may declare a scope the store never materialised
    undefined;
  return scope?.keys.find((k) => k.key === key);
}

/**
 * Join declarations to the share store, in place.
 *
 * Two passes and not one, because singleton-ness is a property of the *key*
 * that any single container can assert, and resolution depends on it -- so
 * every declaration has to be seen before any of them can be resolved.
 */
export function resolveShares(snapshot: Snapshot): void {
  const { scopes, containers } = snapshot;

  // pass 1: singleton flags, from whoever asserted them
  for (const c of containers) {
    for (const v of c.versions) {
      for (const decl of v.consumes) {
        if (!decl.singleton) {
          continue;
        }
        const target = findKey(scopes, decl.shareScope, decl.key);
        if (target) {
          target.singleton = true;
        }
      }
    }
  }

  // pass 2: resolve each declaration, and record it as a consumer
  for (const c of containers) {
    for (const v of c.versions) {
      const apply = (decl: ShareDecl) => {
        const target = findKey(scopes, decl.shareScope, decl.key);
        if (!target) {
          decl.resolved = {
            satisfies: false,
            reason: `share scope "${decl.shareScope}" has no key "${decl.key}"`,
          };
          return;
        }
        decl.resolved = resolveFor(target, decl.requestedRange);

        const versionNode = decl.resolved.version
          ? target.versions.find((x) => x.version === decl.resolved!.version)
          : undefined;
        if (versionNode) {
          const already = versionNode.consumers.some(
            (x) => x.container === c.name && x.containerVersion === v.version
          );
          if (!already) {
            versionNode.consumers.push({
              container: c.name,
              containerVersion: v.version,
              range: decl.requestedRange,
              satisfied: decl.resolved.satisfies,
            });
          }
        }
      };

      for (const decl of v.consumes) {
        apply(decl);
      }
      // `provides` entries are copies of the same declarations; keep their
      // resolved block in step so either view can be read on its own
      for (const decl of v.provides) {
        const twin = v.consumes.find(
          (x) => x.key === decl.key && x.shareScope === decl.shareScope
        );
        decl.resolved = twin?.resolved;
      }
    }
  }
}

/** Containers that consume a given share key, across every version. */
export function consumersOf(
  containers: ContainerNode[],
  scopeName: string,
  key: string
): Array<{ container: string; version: string; decl: ShareDecl }> {
  const result: Array<{ container: string; version: string; decl: ShareDecl }> = [];
  for (const c of containers) {
    for (const v of c.versions) {
      for (const decl of v.consumes) {
        if (decl.key === key && decl.shareScope === scopeName) {
          result.push({ container: c.name, version: v.version, decl });
        }
      }
    }
  }
  return result;
}
