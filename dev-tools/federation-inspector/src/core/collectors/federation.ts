/**
 * The federation half of a snapshot.
 *
 * The awkward fact this file exists to work around: `federation-js` ships
 * minified with property mangling, and the mangling is not uniform. `$SS`
 * (the share store), `$SC` (a container's share config), `$E` (its exposes)
 * and the `_mf*` methods all survive in the shipped `federation-js.min.js`;
 * `$C` -- the runtime's container registry -- and `_mfGetContainer` do not.
 *
 * So containers cannot be enumerated from the runtime on a production page.
 * They are enumerated from the *loader* instead, which is fine, because
 * federation files every container under a deterministic id:
 *
 *   `_mfContainer`  ->  `__mf_container_<name>`, qualified by container version
 *   `_mfBind`(entry) ->  `__mf_entry_<name>_<fileName>`
 *
 * and `System.registrations` -- a documented, unmangled API -- holds both,
 * with the container version as the qualifier. From an id we get the entry
 * url; from the url we get the load record; from the record's namespace we get
 * the live `Container`, because a generated container entry exports it. Every
 * field we then read off that Container is one of the unmangled ones.
 *
 * Nothing here calls a federation method that could load, resolve or register
 * anything. Looking must not change what is being looked at.
 */

import type {
  ContainerNode,
  ContainerVersionNode,
  ExposeInfo,
  FynAppManifest,
  LoadStage,
  ModuleNode,
  ShareDecl,
  ShareScopeNode,
  ShareSourceInfo,
  ShareVersionNode,
  BundleNode,
  Capability,
} from "../model.js";
import { CONTAINER_ID_PREFIX, ENTRY_ID_PREFIX } from "../model.js";
import { safeGet, attempt, isFn } from "../capability.js";

/**
 * Resolve any id federation might hand us to the module it actually names.
 *
 * Three id spellings reach this: a url, a specifier (`./chunk-abc.js`), and a
 * bare fileName (`chunk-abc.js`, which is what `_mfBind` records before
 * federation normalises it up to a specifier). The specifier index closes the
 * common case -- a specifier registered as a redirect to a url -- and the
 * `./` fixups cover the two spellings of the same specifier.
 */
export type Resolver = (id: string | undefined) => ModuleNode | undefined;

function makeResolver(
  modules: Map<string, ModuleNode>,
  specifiers: Map<string, string>
): Resolver {
  return (id) => {
    if (!id) {
      return undefined;
    }
    const direct = modules.get(id);
    if (direct) {
      return direct;
    }
    const viaSpecifier = specifiers.get(id);
    if (viaSpecifier) {
      return modules.get(viaSpecifier);
    }
    const other = id.startsWith("./") ? id.slice(2) : "./" + id;
    return modules.get(other) ?? modules.get(specifiers.get(other) ?? "");
  };
}

export interface FederationCollection {
  containers: ContainerNode[];
  scopes: ShareScopeNode[];
  bundles: BundleNode[];
  errors: string[];
}

/** `Object.keys` over an object that may be null-prototyped or a proxy. */
function keysOf(obj: unknown): string[] {
  if (!obj || typeof obj !== "object") {
    return [];
  }
  return attempt(() => Object.keys(obj as object)) ?? [];
}

/**
 * The directory a url sits in, used to attribute chunks to a container.
 *
 * A rollup-federation build emits every chunk beside its container entry, so
 * "same directory as the entry" identifies a container's own chunks. It is a
 * heuristic and labelled as one -- the authoritative map is federation's `$B`
 * binding table, which the minified build does not expose. It is wrong only
 * for a build that emits two containers into one directory, which the plugin
 * does not do.
 */
function dirOf(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  const q = url.indexOf("?");
  const clean = q >= 0 ? url.slice(0, q) : url;
  const slash = clean.lastIndexOf("/");
  return slash >= 0 ? clean.slice(0, slash + 1) : undefined;
}

/**
 * Reach the live `Container` for one container id and version.
 *
 * Three routes, most reliable first, because which of them works depends on
 * how the page's federation build was minified:
 *
 * 1. the load record for the entry url, whose namespace exports `container` --
 *    every generated container entry does `exports({ container, get, init })`;
 * 2. the record filed directly under the container id, for a host that
 *    registered it without a url;
 * 3. `Federation._mfGetContainer`, which only exists in an unminified build
 *    but is exact when it does.
 */
function findContainer(
  loader: any,
  federation: any,
  containerId: string,
  entryUrl: string | undefined,
  name: string,
  version: string | undefined
): any {
  const fromRecord = (key: string | undefined) => {
    if (!key) {
      return undefined;
    }
    const rec = attempt(() => loader.records.get(key));
    const ns = rec ? safeGet(rec, "n") : undefined;
    const c = ns ? safeGet(ns, "container") : undefined;
    // guard against a page module that happens to export something called
    // `container`: a real one carries the id we looked it up by
    return c && safeGet(c, "id") === containerId ? c : c && safeGet(c, "name") === name ? c : undefined;
  };

  return (
    fromRecord(entryUrl) ??
    fromRecord(containerId) ??
    (isFn(safeGet(federation, "_mfGetContainer"))
      ? attempt(() => federation._mfGetContainer(name, version))
      : undefined)
  );
}

/** Read `$SC` into share declarations, split into provided and consumed. */
function readShareConfig(
  container: any,
  defaultScope: string
): { provides: ShareDecl[]; consumes: ShareDecl[]; ok: boolean } {
  const sc = safeGet(container, "$SC");
  if (!sc || typeof sc !== "object") {
    return { provides: [], consumes: [], ok: false };
  }
  const provides: ShareDecl[] = [];
  const consumes: ShareDecl[] = [];

  for (const key of keysOf(sc)) {
    const entry = safeGet(sc, key);
    const options = (safeGet(entry, "options") ?? {}) as Record<string, any>;
    const versions = keysOf(safeGet(entry, "versions"));
    const rvmRaw = safeGet(entry, "rvm");
    const rvm: Record<string, string> = {};
    for (const dir of keysOf(rvmRaw)) {
      const v = safeGet<string>(rvmRaw, dir);
      if (typeof v === "string") {
        rvm[dir] = v;
      }
    }
    // `import: false` is the generated marker for consume-only: this container
    // can use the share but never offers a copy of its own.
    const importable = safeGet(options, "import") !== false;
    const decl: ShareDecl = {
      key,
      requestedRange: typeof options.semver === "string" ? options.semver : undefined,
      singleton: options.singleton === true,
      importable,
      shareScope:
        typeof options.shareScope === "string" ? options.shareScope : defaultScope,
      versions,
      rvm: Object.keys(rvm).length ? rvm : undefined,
    };
    // Every declaration is a consumption -- declaring a share is how you get to
    // import it. Only a declaration with `import !== false` and an actual
    // version to offer is also a provision.
    consumes.push(decl);
    if (importable && versions.length) {
      provides.push({ ...decl });
    }
  }
  return { provides, consumes, ok: true };
}

/** Read `$E` into expose rows, resolving each chunk id to a module. */
function readExposes(
  container: any,
  resolve: Resolver
): { exposes: ExposeInfo[]; ok: boolean } {
  const e = safeGet(container, "$E");
  if (!e || typeof e !== "object") {
    return { exposes: [], ok: false };
  }
  const exposes: ExposeInfo[] = [];
  for (const name of keysOf(e)) {
    const chunkId = safeGet<string>(e, name);
    if (typeof chunkId !== "string") {
      continue;
    }
    // `_E` stores the raw chunk id, which is usually a specifier redirecting
    // to the module's real url -- the resolver is what follows that.
    const mod = resolve(chunkId);
    exposes.push({
      name,
      chunkId,
      url: mod?.url,
      stage: mod?.stage,
    });
  }
  exposes.sort((a, b) => a.name.localeCompare(b.name));
  return { exposes, ok: true };
}

function readManifest(container: any): FynAppManifest | undefined {
  const m = safeGet(container, "__FYNAPP_MANIFEST__");
  if (!m || typeof m !== "object") {
    return undefined;
  }
  // Copied through JSON so a snapshot stays structured-cloneable even if the
  // build ever puts something exotic in there.
  return attempt(() => JSON.parse(JSON.stringify(m)) as FynAppManifest);
}

/**
 * Enumerate containers from `System.registrations`.
 *
 * Returns name -> the versions the loader knows, each with its entry id and
 * url. A container whose entry has not executed still appears, which is the
 * point: "this remote is still in flight" is a thing you go to a tool like
 * this to find out.
 */
function discoverContainers(
  loader: any,
  cap: Capability
): Map<string, Map<string, { entryId: string; entryUrl?: string }>> {
  const found = new Map<string, Map<string, { entryId: string; entryUrl?: string }>>();
  if (!cap.registrations) {
    return found;
  }
  const regs = loader.registrations;

  const note = (name: string, version: string, entryId: string, entryUrl?: string) => {
    let byVersion = found.get(name);
    if (!byVersion) {
      byVersion = new Map();
      found.set(name, byVersion);
    }
    const existing = byVersion.get(version);
    if (!existing) {
      byVersion.set(version, { entryId, entryUrl });
    } else if (!existing.entryUrl && entryUrl) {
      existing.entryUrl = entryUrl;
    }
  };

  attempt(() => {
    for (const id of regs.keys()) {
      if (!id.startsWith(CONTAINER_ID_PREFIX)) {
        continue;
      }
      const name = id.slice(CONTAINER_ID_PREFIX.length);
      if (!name) {
        continue;
      }
      const qualifiers: string[] = attempt(() => regs.qualifiersOf(id)) ?? [];
      if (qualifiers.length === 0) {
        // registered without a version qualifier: the unqualified slot is all
        // there is, and federation defaults a container to 0.0.0
        const entry = attempt(() => regs.get(id));
        note(name, "", id, entry ? safeGet<string>(entry, "url") : undefined);
        continue;
      }
      for (const v of qualifiers) {
        const entry = attempt(() => regs.get(id, v));
        note(name, v, id, entry ? safeGet<string>(entry, "url") : undefined);
      }
    }
  });

  /*
   * `__mf_entry_<name>_<fileName>` -- an entry *chunk*, which is not the same
   * thing as the container entry.
   *
   * A build emits one per chunk rollup marked `isEntry`, and a share surface is
   * one of those: `_mf-share-surface_vue-CmMbG3Pi.js` is bound with `e: true`
   * and the container's version. So these ids are only ever used to *fill in*
   * what the container pass could not find -- a container it never saw, or a
   * version with no entry url. Letting them open a version slot of their own
   * reported four single-version demo apps as "2 versions live", with the share
   * surface standing in as a second entry: exactly the claim this tool exists
   * to make trustworthy.
   */
  attempt(() => {
    for (const id of regs.keys()) {
      if (!id.startsWith(ENTRY_ID_PREFIX)) {
        continue;
      }
      const rest = id.slice(ENTRY_ID_PREFIX.length);

      // longest known container name that prefixes the rest, since a container
      // name may itself contain "_"
      let name = "";
      for (const known of found.keys()) {
        if (rest.startsWith(known + "_") && known.length > name.length) {
          name = known;
        }
      }

      const qualifiers: string[] = attempt(() => regs.qualifiersOf(id)) ?? [];
      const urlFor = (q?: string) => {
        const entry = attempt(() => regs.get(id, q));
        return entry ? safeGet<string>(entry, "url") : undefined;
      };

      if (!name) {
        // A container the `__mf_container_` pass never saw. This is the only
        // case where an entry chunk may establish one, and it is a real one:
        // a build whose container id was never registered with this loader.
        const cut = rest.lastIndexOf("_");
        name = cut > 0 ? rest.slice(0, cut) : rest;
        if (!name) {
          continue;
        }
        for (const v of qualifiers.length ? qualifiers : [""]) {
          note(name, v, id, urlFor(qualifiers.length ? v : undefined));
        }
        continue;
      }

      // Known container: supplement only. Fill an entry url where the
      // container pass found none, and never add a version.
      const byVersion = found.get(name)!;
      for (const v of qualifiers) {
        const existing = byVersion.get(v);
        if (existing && !existing.entryUrl) {
          existing.entryUrl = urlFor(v);
        }
      }
      const unqualified = urlFor(undefined);
      if (unqualified && byVersion.size === 1) {
        const only = byVersion.values().next().value;
        if (only && !only.entryUrl) {
          only.entryUrl = unqualified;
        }
      }
    }
  });

  return found;
}

/**
 * Build the share-scope tree from `Federation.$SS`.
 *
 * The store's shape is `scope -> key -> version -> { sources[], url?, id? }`.
 * A version carrying a `url` or an `id` means somebody actually provided a
 * copy; a version with only `sources` was declared and never supplied, which
 * is worth surfacing rather than hiding.
 */
function readShareStore(federation: any, resolve: Resolver): ShareScopeNode[] {
  const store = safeGet(federation, "$SS");
  if (!store || typeof store !== "object") {
    return [];
  }
  const scopes: ShareScopeNode[] = [];

  for (const scopeName of keysOf(store)) {
    const scope = safeGet(store, scopeName);
    const keys: ShareScopeNode["keys"] = [];

    for (const key of keysOf(scope)) {
      const meta = safeGet(scope, key);
      const versions: ShareVersionNode[] = [];

      for (const version of keysOf(meta)) {
        const info = safeGet(meta, version);
        const url = safeGet<string>(info, "url");
        const chunkId = safeGet<string>(info, "id");
        const rawSources = safeGet<any[]>(info, "sources");
        const sources: ShareSourceInfo[] = Array.isArray(rawSources)
          ? rawSources
              .map((s) => ({
                id: String(safeGet(s, "id") ?? ""),
                container: String(safeGet(s, "container") ?? ""),
                version: safeGet<string>(s, "version"),
              }))
              .filter((s) => s.container)
          : [];

        const mod = resolve(url) ?? resolve(chunkId);

        versions.push({
          version,
          url,
          chunkId,
          loaded: !!mod,
          stage: mod?.stage,
          sources,
          // consumers are filled in by analysis, which has the container
          // declarations to match ranges against
          consumers: [],
        });
      }

      versions.sort((a, b) => compareVersionDesc(a.version, b.version));
      keys.push({
        key,
        singleton: false, // set by analysis from the container declarations
        versions,
        loadedCount: versions.filter((v) => v.loaded).length,
        issues: [],
      });
    }

    keys.sort((a, b) => a.key.localeCompare(b.key));
    scopes.push({ name: scopeName, keys });
  }

  scopes.sort((a, b) => a.name.localeCompare(b.name));
  return scopes;
}

/** Newest first, numerically per segment, non-numeric segments lexically. */
export function compareVersionDesc(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const xa = pa[i] ?? "";
    const xb = pb[i] ?? "";
    const na = Number(xa);
    const nb = Number(xb);
    if (Number.isFinite(na) && Number.isFinite(nb) && xa !== "" && xb !== "") {
      if (na !== nb) {
        return nb - na;
      }
    } else if (xa !== xb) {
      return xa < xb ? 1 : -1;
    }
  }
  return 0;
}

/**
 * Group modules by the combined file they arrived in.
 *
 * `Federation.bundleUrlFor` is the only readable view of the combined-bundle
 * map -- `$bU` itself is mangled -- and it answers per url, so this is one
 * call per module. That is fine: it is a plain object lookup, and the module
 * count is bounded by the registry.
 */
function readBundles(
  federation: any,
  modules: Map<string, ModuleNode>
): BundleNode[] {
  if (!isFn(safeGet(federation, "bundleUrlFor"))) {
    return [];
  }
  const byBundle = new Map<string, string[]>();
  for (const mod of modules.values()) {
    if (!mod.url) {
      continue;
    }
    const bundleUrl = attempt(() => federation.bundleUrlFor(mod.url));
    if (typeof bundleUrl !== "string" || bundleUrl === mod.url) {
      continue;
    }
    mod.bundle = bundleUrl;
    const list = byBundle.get(bundleUrl);
    if (list) {
      list.push(mod.url);
    } else {
      byBundle.set(bundleUrl, [mod.url]);
    }
  }
  return [...byBundle.entries()]
    .map(([url, members]) => ({
      url,
      members,
      loadedCount: members.filter((m) => modules.get(m)?.stage !== "registered").length,
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

export function collectFederation(
  loader: any,
  federation: any,
  modules: Map<string, ModuleNode>,
  specifiers: Map<string, string>,
  cap: Capability
): FederationCollection {
  const errors: string[] = [];
  if (!federation) {
    return { containers: [], scopes: [], bundles: [], errors };
  }

  const resolve = makeResolver(modules, specifiers);
  const scopes = readShareStore(federation, resolve);
  const discovered = discoverContainers(loader, cap);
  const containers: ContainerNode[] = [];

  // A container may show up in the share store without ever registering with
  // this loader -- a share provided by a container whose entry the loader did
  // not fetch. Note the name so it is not silently dropped.
  for (const scope of scopes) {
    for (const key of scope.keys) {
      for (const v of key.versions) {
        for (const s of v.sources) {
          if (!discovered.has(s.container)) {
            discovered.set(
              s.container,
              new Map([[s.version ?? "", { entryId: CONTAINER_ID_PREFIX + s.container }]])
            );
          }
        }
      }
    }
  }

  let sawShareConfig = false;
  let sawExposes = false;
  let sawManifest = false;

  for (const [name, byVersion] of discovered) {
    const versions: ContainerVersionNode[] = [];

    for (const [version, { entryId, entryUrl }] of byVersion) {
      const container = findContainer(
        loader,
        federation,
        CONTAINER_ID_PREFIX + name,
        entryUrl,
        name,
        version || undefined
      );

      const entryMod = resolve(entryUrl) ?? resolve(entryId);
      const stage: LoadStage = entryMod?.stage ?? "registered";

      const scopeName =
        (container ? safeGet<string>(container, "scope") : undefined) ??
        scopes[0]?.name ??
        "default";

      const { provides, consumes, ok: scOk } = container
        ? readShareConfig(container, scopeName)
        : { provides: [], consumes: [], ok: false };
      const { exposes, ok: expOk } = container
        ? readExposes(container, resolve)
        : { exposes: [], ok: false };
      const manifest = container ? readManifest(container) : undefined;

      sawShareConfig ||= scOk;
      sawExposes ||= expOk;
      sawManifest ||= !!manifest;

      const resolvedVersion =
        (container ? safeGet<string>(container, "version") : undefined) ||
        version ||
        manifest?.version ||
        "0.0.0";

      versions.push({
        version: resolvedVersion,
        entryId,
        entryUrl,
        stage,
        scope: scopeName,
        exposes,
        provides,
        consumes,
        manifest,
        moduleIds: [],
      });
    }

    versions.sort((a, b) => compareVersionDesc(a.version, b.version));
    containers.push({ name, id: CONTAINER_ID_PREFIX + name, versions });
  }

  containers.sort((a, b) => a.name.localeCompare(b.name));

  cap.shareConfig = sawShareConfig;
  cap.exposes = sawExposes;
  cap.manifest = sawManifest;
  if (containers.length && !sawShareConfig) {
    cap.notes.push(
      "Container.$SC is unreadable, so requested semver ranges and " +
        "required-version maps are unavailable. Share versions are still listed."
    );
  }
  if (containers.length && !sawExposes) {
    cap.notes.push("Container.$E is unreadable, so exposed modules cannot be listed.");
  }

  attributeModules(containers, modules, scopes, resolve);
  const bundles = readBundles(federation, modules);

  return { containers, scopes, bundles, errors };
}

/**
 * Tag every module with the container, scope and share key it belongs to.
 *
 * Ordered weakest-claim-last so a strong signal is never overwritten by the
 * directory heuristic: container entry, then exposed chunk, then shared copy,
 * then same-directory-as-the-entry.
 */
function attributeModules(
  containers: ContainerNode[],
  modules: Map<string, ModuleNode>,
  scopes: ShareScopeNode[],
  resolve: Resolver
): void {
  const claim = (
    id: string | undefined,
    container: { name: string; version?: string },
    kind: ModuleNode["kind"],
    scope?: string
  ): ModuleNode | undefined => {
    const mod = resolve(id);
    if (!mod) {
      return undefined;
    }
    if (!mod.container) {
      mod.container = container;
    }
    // "unknown" is the only kind a later, weaker claim may overwrite
    if (mod.kind === "unknown") {
      mod.kind = kind;
    }
    if (scope && !mod.scope) {
      mod.scope = scope;
    }
    return mod;
  };

  for (const c of containers) {
    for (const v of c.versions) {
      const ref = { name: c.name, version: v.version };
      const entry =
        claim(v.entryUrl, ref, "container-entry", v.scope) ??
        claim(v.entryId, ref, "container-entry", v.scope);
      if (entry) {
        entry.version = v.version;
        v.moduleIds.push(entry.id);
      }
      for (const e of v.exposes) {
        const mod = claim(e.chunkId, ref, "exposed", v.scope);
        if (mod) {
          v.moduleIds.push(mod.id);
        }
      }
    }
  }

  // shared copies: the share store names the chunk that provided each version
  for (const scope of scopes) {
    for (const key of scope.keys) {
      for (const ver of key.versions) {
        const owner = ver.sources[0];
        const mod = resolve(ver.url) ?? resolve(ver.chunkId);
        if (!mod) {
          continue;
        }
        mod.kind = "shared";
        mod.shareKey = key.key;
        mod.scope ??= scope.name;
        mod.version ??= ver.version;
        if (!mod.container && owner) {
          mod.container = { name: owner.container, version: owner.version };
        }
      }
    }
  }

  // remaining chunks, by directory. See dirOf() for why this is a heuristic.
  const dirToContainer = new Map<string, { name: string; version?: string }>();
  for (const c of containers) {
    for (const v of c.versions) {
      const dir = dirOf(v.entryUrl);
      if (dir && !dirToContainer.has(dir)) {
        dirToContainer.set(dir, { name: c.name, version: v.version });
      }
    }
  }
  for (const mod of modules.values()) {
    if (mod.container || !mod.url) {
      continue;
    }
    const owner = dirToContainer.get(dirOf(mod.url) ?? "");
    if (owner) {
      mod.container = owner;
      if (mod.kind === "unknown") {
        mod.kind = "chunk";
      }
      const cv = containers
        .find((c) => c.name === owner.name)
        ?.versions.find((v) => v.version === owner.version);
      cv?.moduleIds.push(mod.id);
    }
  }

  for (const mod of modules.values()) {
    if (mod.kind === "unknown") {
      mod.kind = mod.container ? "chunk" : "external";
    }
  }
}
