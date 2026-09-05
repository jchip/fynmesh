/**
 * Snapshot assembly.
 *
 * One pass over one or more loaders, producing the plain-JSON `Snapshot` the
 * rest of the tool is written against. Failure of any individual probe is
 * data, not an exception: a snapshot from a page with a minified federation
 * build is a smaller snapshot, not an error.
 */

import type { LoaderInfo, ModuleNode, Snapshot } from "./model.js";
import { emptySnapshot } from "./model.js";
import { probe, attempt, safeGet } from "./capability.js";
import { collectSystemJs, reindexDependents } from "./collectors/systemjs.js";
import { collectFederation } from "./collectors/federation.js";
import { collectFynMesh, probeKernel } from "./collectors/fynmesh.js";

export interface CollectOptions {
  /** defaults to `globalThis.System` */
  loader?: unknown;
  /**
   * Additional loaders to include. The fork keeps records, registrations and
   * the import map per instance, so a page running more than one loader has
   * more than one registry -- reporting only the first would silently hide
   * half the page.
   */
  loaders?: unknown[];
  /** defaults to `globalThis.Federation` */
  federation?: unknown;
  /** defaults to `globalThis.fynMeshKernel`; absent on a plain federation page */
  kernel?: unknown;
  /** skip the combined-bundle pass, which is one lookup per module */
  skipBundles?: boolean;
}

export function collect(opts: CollectOptions = {}): Snapshot {
  const started = now();
  const snap = emptySnapshot();

  const { loader, federation, capability } = probe(opts.loader, opts.federation);
  snap.capability = capability;
  snap.origin = attempt(() => (globalThis as any).location?.href);

  const loaders: any[] = [];
  if (loader) {
    loaders.push(loader);
  }
  for (const extra of opts.loaders ?? []) {
    if (extra && !loaders.includes(extra)) {
      loaders.push(extra);
    }
  }

  if (loaders.length === 0) {
    snap.collectMs = now() - started;
    return snap;
  }

  const globalSystem = (globalThis as any).System;
  const modules = new Map<string, ModuleNode>();
  const loaderInfos: LoaderInfo[] = [];

  const specifiers = new Map<string, string>();

  loaders.forEach((L, index) => {
    const result = collectSystemJs(L, index, capability);
    for (const [spec, target] of result.specifiers) {
      if (!specifiers.has(spec)) {
        specifiers.set(spec, target);
      }
    }
    snap.errors.push(...result.errors);
    for (const [id, node] of result.modules) {
      // Two loaders can know the same id. Keep the first and record the
      // collision rather than merging two different modules into one row.
      if (modules.has(id)) {
        const existing = modules.get(id)!;
        if (existing.loader !== node.loader) {
          snap.errors.push(
            `id "${id}" exists in loader ${existing.loader} and loader ${node.loader}; ` +
              `showing loader ${existing.loader}'s copy`
          );
        }
        continue;
      }
      modules.set(id, node);
    }
    loaderInfos.push({
      index,
      baseUrl: result.baseUrl,
      recordCount: result.recordCount,
      registrationCount: result.registrationCount,
      isGlobal: L === globalSystem,
    });
  });

  snap.loaders = loaderInfos;

  if (federation) {
    const fed = collectFederation(
      loaders[0],
      opts.skipBundles ? withoutBundles(federation) : federation,
      modules,
      specifiers,
      capability
    );
    snap.containers = fed.containers;
    snap.scopes = fed.scopes;
    snap.bundles = fed.bundles;
    snap.errors.push(...fed.errors);
  }

  // The kernel layer is read last because a FynApp row joins onto the container
  // rows the federation pass produced. It is also the one collector whose whole
  // output may legitimately be absent: no kernel means no `fynmesh` node, which
  // is how the UI knows to hide the FynApps tab rather than show it empty.
  const fynmesh = collectFynMesh(opts.kernel, snap.containers, capability);
  if (fynmesh.fynmesh) {
    snap.fynmesh = fynmesh.fynmesh;
  }
  snap.errors.push(...fynmesh.errors);

  // Federation attribution can introduce ids the record pass never saw (an
  // exposed chunk known only to a container), so dependents are rebuilt once
  // the module set is final.
  reindexDependents(modules);

  snap.modules = [...modules.values()].sort((a, b) => a.seq - b.seq);
  snap.takenAt = Date.now();
  snap.collectMs = Math.round((now() - started) * 100) / 100;
  return snap;
}

/** A federation facade with `bundleUrlFor` hidden, for the fast path. */
function withoutBundles(federation: any): any {
  return new Proxy(federation, {
    get(target, prop, receiver) {
      if (prop === "bundleUrlFor") {
        return undefined;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function now(): number {
  const perf = safeGet<any>(globalThis, "performance");
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
}

/**
 * A cheap fingerprint of loader state, for deciding whether to re-collect.
 *
 * The live poll runs every 500ms and a full collect walks every record; this
 * makes the overwhelmingly common idle tick nearly free. It is deliberately
 * not a hash of the whole state -- it catches modules appearing, registrations
 * arriving and share versions being added, which is everything that changes
 * the shape of the view. A module merely advancing a stage is missed until the
 * next real change, which is an acceptable trade for a poll this frequent.
 */
export function fingerprint(opts: CollectOptions = {}): string {
  const g = globalThis as any;
  const primary = opts.loader ?? g.System;
  if (!primary) {
    return "0";
  }
  const F = opts.federation ?? g.Federation;

  // every loader the collect would read, or a change in the second one never
  // triggers a refresh
  const loaders = [primary];
  for (const extra of opts.loaders ?? []) {
    if (extra && !loaders.includes(extra)) {
      loaders.push(extra);
    }
  }

  let records = 0;
  let regs = 0;
  for (const S of loaders) {
    attempt(() => {
      for (const _ of S.records.keys()) {
        records++;
      }
    });
    attempt(() => {
      for (const _ of S.registrations.keys()) {
        regs++;
      }
    });
  }

  let shares = 0;
  const store = safeGet(F, "$SS");
  if (store && typeof store === "object") {
    attempt(() => {
      for (const scope of Object.keys(store as object)) {
        const s = (store as any)[scope];
        for (const key of Object.keys(s)) {
          shares += 1 + Object.keys(s[key]).length;
        }
      }
    });
  }

  // A FynApp mounting changes no record and no registration -- the modules were
  // all loaded before the kernel ever bootstrapped it -- so without a term of
  // its own the FynApps tab would sit on a stale status until something
  // unrelated happened to load. Key count plus the sum of the lifecycle
  // timestamps is O(apps) and allocates nothing per module, which is the only
  // budget a 500ms poll has.
  let fynmesh = 0;
  const { kernel } = probeKernel(opts.kernel);
  if (kernel) {
    attempt(() => {
      const runTime = safeGet<any>(kernel, "runTime");
      fynmesh += Object.keys(safeGet<object>(runTime, "apps") ?? {}).length;
      fynmesh += Object.keys(safeGet<object>(runTime, "middlewares") ?? {}).length;
    });
    attempt(() => {
      for (const state of kernel.listFynAppStates()) {
        fynmesh += state.updatedAt ?? 0;
      }
    });
  }

  return records + ":" + regs + ":" + shares + ":" + fynmesh;
}
