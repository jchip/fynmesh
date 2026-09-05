/**
 * The Containers view.
 *
 * Side-by-side versions get first-class layout rather than a nested expander,
 * because running two versions of one remote at once is the case this whole
 * framework exists to support -- and therefore the case you most need to see
 * at a glance when it goes wrong.
 *
 * Each version block answers three questions in three bands: what it exposes
 * and whether those modules have loaded; what it asked for and what it got;
 * and, when a FynMesh manifest is present, which other apps it reaches into.
 *
 * The expose counts are read off the snapshot, never derived here. A chunk
 * being loaded and the kernel having imported the expose are two different
 * facts, both of them true at different numbers, and this view deriving one of
 * them itself is what let it print `2/5 exposes loaded` beside a FynApps row
 * reading `ex 1/5`. See `src/core/exposes.ts`.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type {
  ContainerNode,
  ContainerVersionNode,
  ExposeInfo,
  FynAppManifest,
  ShareDecl,
} from "../../core/model.js";
import type { ExposeLevels } from "../../core/exposes.js";
import { containerExposeLevels, inlinedExposes } from "../../core/exposes.js";
import { expanded, focusOn, query, snapshot, toggleExpanded } from "../state.js";
import { filterContainers } from "../../analysis/search.js";
import {
  Chip,
  ContainerChip,
  Link,
  SatisfiedMark,
  STAGE_LABEL,
  StageDot,
  Twisty,
} from "../components/atoms.jsx";
import { distinguishingTails } from "../../util/format.js";

export function ContainersView(): JSX.Element {
  // one rule for the list and for the count above it -- see `filterContainers`
  const containers = useComputed(() =>
    filterContainers(snapshot.value.containers, query.value)
  );

  if (!snapshot.value.capability.federation) {
    return (
      <div class="empty">
        No Federation runtime on this page.
        <br />
        Showing it as a plain SystemJS registry.
      </div>
    );
  }

  if (!containers.value.length) {
    return (
      <div class="empty">
        {snapshot.value.containers.length
          ? "No containers match this filter."
          : "No federation containers have registered with this loader."}
      </div>
    );
  }

  return (
    <div class="scroll">
      {containers.value.map((c) => (
        <ContainerBlock key={c.name} container={c} />
      ))}
    </div>
  );
}

function ContainerBlock({ container: c }: { container: ContainerNode }): JSX.Element {
  const multi = c.versions.length > 1;
  return (
    <div class="section">
      <div class="head">
        <ContainerChip name={c.name} />
        {multi ? (
          <Chip tone="accent" title="two versions of this container are live at once">
            {c.versions.length} versions live
          </Chip>
        ) : null}
        <span class="sub">{c.id}</span>
      </div>
      <div class="tree">
        {(() => {
          // widen the entry link until the versions are told apart
          const tails = distinguishingTails(c.versions.map((v) => v.entryUrl));
          return c.versions.map((v, i) => (
            <VersionBlock key={v.version} name={c.name} version={v} entryLabel={tails[i]} />
          ));
        })()}
      </div>
    </div>
  );
}

function VersionBlock({
  name,
  version: v,
  entryLabel,
}: {
  name: string;
  version: ContainerVersionNode;
  entryLabel: string;
}): JSX.Element {
  const id = "container:" + name + "@" + v.version;
  const isOpen = expanded.value.has(id);
  const exposes = containerExposeLevels(v);
  const inlined = inlinedExposes(v);
  const unsatisfied = v.consumes.filter((d) => d.resolved && !d.resolved.satisfies).length;
  const shares = shareCount(v);

  return (
    <>
      <div
        class="node l1"
        role="button"
        tabIndex={0}
        onClick={() => toggleExpanded(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded(id);
          }
        }}
      >
        <Twisty open={isOpen} />
        <StageDot stage={v.stage} />
        <span class="label ver">
          {v.version}
        </span>
        <span class="faint">scope {v.scope}</span>
        <span class="muted" title={exposesTitle(exposes, inlined)}>
          {exposes.declared.length
            ? `${exposes.loaded!.length}/${exposes.declared.length} chunks loaded`
            : "no exposes"}
        </span>
        {exposes.imported && exposes.declared.length ? (
          <span
            class="muted"
            title={
              "the FynMesh kernel imported " +
              exposes.imported.length +
              " of these exposes onto fynApp.exposes. Fewer than loaded is normal: " +
              "one expose's chunk can pull in another's without anybody importing it."
            }
          >
            {exposes.imported.length}/{exposes.declared.length} imported
          </span>
        ) : null}
        {shares ? (
          <span class="muted">
            {shares} share{shares === 1 ? "" : "s"}
          </span>
        ) : null}
        {unsatisfied ? (
          <Chip tone="warn" title="a declared range does not match what it resolved to">
            {unsatisfied} mismatched
          </Chip>
        ) : null}
        <span class="faint">{STAGE_LABEL[v.stage]}</span>
        {v.entryUrl ? (
          <Link
            title={v.entryUrl}
            onClick={(() => focusOn("modules", "url:" + v.entryUrl, v.entryUrl)) as () => void}
          >
            {entryLabel}
          </Link>
        ) : null}
      </div>

      {isOpen ? (
        <>
          {v.exposes.length ? (
            <div class="node l2 wrapline">
              <span class="faint rowlabel">
                exposes
              </span>
              <span class="inline">
                {v.exposes.map((e) => (
                  <span key={e.name} class="inline" title={exposeTitle(e)}>
                    <StageDot stage={e.stage ?? "registered"} />
                    {e.url ? (
                      <Link onClick={() => focusOn("modules", "url:" + e.url, e.url)}>
                        {e.name}
                      </Link>
                    ) : (
                      <span class="link plain">
                        {e.name}
                      </span>
                    )}
                    {e.imported ? (
                      <span
                        class="faint"
                        title="the kernel imported this expose onto fynApp.exposes"
                      >
                        ↑
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            </div>
          ) : null}

          {v.consumes.length ? (
            <>
              <div class="node l2" style={{ borderBottom: 0, minHeight: "20px" }}>
                <span class="faint rowlabel">
                  shares
                </span>
                <span class="faint" style={{ fontSize: "9.5px" }}>
                  requested → resolved
                </span>
                {rvmUnavailable() ? (
                  <span
                    class="faint"
                    style={{ fontSize: "9.5px" }}
                    title={
                      "federation-js mangles Container.$SC[key].rvm, so the per-importer " +
                      "required-version maps cannot be read in this build. The range each " +
                      "container declared is still shown."
                    }
                  >
                    · no required-version maps in this build
                  </span>
                ) : null}
              </div>
              {v.consumes.map((d) => (
                <ShareRow key={d.shareScope + ":" + d.key} decl={d} />
              ))}
            </>
          ) : null}

          {/*
            * Provisions the shares band cannot show, because they were
            * reconstructed from the share store rather than read off the
            * container -- which is the only thing there is to show for a
            * container the loader never fetched an entry for.
            */}
          {inferredProvides(v).length ? (
            <>
              <div class="node l2" style={{ borderBottom: 0, minHeight: "20px" }}>
                <span class="faint rowlabel">
                  provides
                </span>
                <span class="faint" style={{ fontSize: "9.5px" }}>
                  filed into the share store; this container's own declaration was unreadable
                </span>
              </div>
              {inferredProvides(v).map((d) => (
                <ShareRow key={"p:" + d.shareScope + ":" + d.key} decl={d} />
              ))}
            </>
          ) : null}

          {v.manifest ? <ManifestBlock version={v} /> : null}

          {v.bundles && Object.keys(v.bundles).length ? (
            <div class="node l2 wrapline">
              <span class="faint rowlabel">
                bundles
              </span>
              <span class="muted">
                {Object.entries(v.bundles)
                  .map(([file, members]) => `${file} (${members.length})`)
                  .join(", ")}
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** Provisions with no declaration behind them -- see `provisions` in the collector. */
function inferredProvides(v: ContainerVersionNode): ShareDecl[] {
  return v.provides.filter((d) => d.inferred);
}

/**
 * The collapsed header's exposes tooltip, spelling out the levels.
 *
 * The header used to read "N/M exposes loaded" while the FynApps tab read
 * "ex K/M" for the same app, with nothing on either screen saying they were
 * counting different things.
 */
export function exposesTitle(levels: ExposeLevels, inlined: string[] = []): string {
  const lines = [
    `${levels.declared.length} exposes declared by the build`,
    `${levels.loaded!.length} whose chunk the loader has: ` +
      (levels.loaded!.length ? levels.loaded!.join(", ") : "none"),
  ];
  if (inlined.length) {
    lines.push(
      `${inlined.length} with no chunk at all, inlined into the container entry, so ` +
        "they can never be in that count: " +
        inlined.join(", ")
    );
  }
  if (levels.imported) {
    lines.push(
      `${levels.imported.length} the kernel imported: ` +
        (levels.imported.length ? levels.imported.join(", ") : "none")
    );
  }
  return lines.join("\n");
}

/** One expose row's tooltip: where it points, and which levels it reached. */
export function exposeTitle(e: ExposeInfo): string {
  const lines = [e.chunkId ? `${e.name} → ${e.chunkId}` : e.name];
  if (e.url) {
    lines.push(e.url);
  }
  lines.push(
    !e.chunkId
      ? "no chunk of its own — the build inlined this expose into the container entry"
      : e.loaded
        ? "the loader has this chunk"
        : "the loader has no record of this chunk"
  );
  if (e.imported !== undefined) {
    lines.push(
      e.imported
        ? "the kernel imported this expose onto fynApp.exposes"
        : "the kernel never imported this expose"
    );
  }
  return lines.join("\n");
}

/**
 * How many shares the collapsed header should claim.
 *
 * Counted across both bands rather than off `consumes`. A store-only
 * container's `consumes` is empty on purpose -- filing a copy into the scope
 * is not evidence of importing one, and adding provisions there made every
 * provider a false consumer -- so counting it alone reported a container that
 * provides a share as having no shares at all.
 */
export function shareCount(v: ContainerVersionNode): number {
  const keys = new Set<string>();
  for (const d of [...v.consumes, ...v.provides]) {
    keys.add(d.shareScope + ":" + d.key);
  }
  return keys.size;
}

/**
 * Does this row have a resolution to report?
 *
 * An inferred row has no declaration behind it and so nothing to resolve
 * against; saying "unresolved" there put an amber warning next to a version
 * that had plainly been supplied. Nothing is the honest answer.
 */
export function showsResolution(decl: ShareDecl): boolean {
  return !!decl.resolved?.version || !decl.inferred;
}

/**
 * Is the rvm missing, or is it unreadable?
 *
 * Worth the distinction in the UI because the answer is always "unreadable" on
 * a production page -- `rvm` is one of the names federation-js mangles -- and
 * an empty column there otherwise reads as "no importer pinned a range", which
 * is the opposite of what it means.
 */
function rvmUnavailable(): boolean {
  const cap = snapshot.value.capability;
  return cap.shareConfig && !cap.requiredVersionMaps;
}

function ShareRow({ decl }: { decl: ShareDecl }): JSX.Element {
  const r = decl.resolved;
  const rvm = decl.rvm ? Object.entries(decl.rvm) : [];
  /*
   * Announced and supplied are two facts, and one word for both is what let
   * this row say marko provides 5.37.31 while Issues said nothing ever
   * supplied it. Both are worth reading: a container offering a version that
   * never loaded is exactly the shape a reader is here to find.
   */
  const supplied = decl.supplied ?? [];
  const announced = decl.versions.filter((v) => !supplied.includes(v));
  return (
    <div class="node l3">
      {/*
        * A width to line rows up against, not a floor to overflow the row
        * with: `min-width` cannot shrink, so at a narrow panel these two
        * columns held their size, pushed the row past the panel edge, and
        * took the range-satisfied mark at the end of it out of view -- the
        * one thing in the row that must always be visible.
        */}
      <span class="label" style={{ flex: "0 1 120px", minWidth: 0 }}>
        {decl.key}
      </span>
      {decl.singleton ? (
        <span class="sgl" title="declared singleton">
          SGL
        </span>
      ) : null}
      {!decl.importable ? (
        <Chip title="import: false — this container consumes the share but never provides a copy">
          consume-only
        </Chip>
      ) : null}
      <span
        class="faint mono"
        style={{ flex: "0 1 68px", minWidth: 0 }}
        title={
          decl.inferred
            ? "reconstructed from the share store: this container's own declaration " +
              "could not be read, so the range it asked for is unknown"
            : undefined
        }
      >
        {decl.requestedRange ?? (decl.inferred ? "?" : "any")}
      </span>
      {showsResolution(decl) ? (
        <>
          <span class="faint">→</span>
          {r?.version ? (
            <>
              <Chip
                tone={r.satisfies ? "ok" : "warn"}
                class="ver"
                title={r.url ?? "no url"}
              >
                {r.version}
              </Chip>
              <SatisfiedMark ok={r.satisfies} title={r.reason} />
            </>
          ) : (
            <Chip tone="warn" title={r?.reason ?? "not resolved"}>
              unresolved
            </Chip>
          )}
        </>
      ) : null}
      {r?.reason && !r.satisfies ? (
        <span class="faint" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={r.reason}>
          {r.reason}
        </span>
      ) : null}
      {rvm.length ? (
        <span
          class="faint"
          title={"required by\n" + rvm.map(([dir, range]) => `${dir}: ${range}`).join("\n")}
        >
          rvm {rvm.length}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {supplied.length ? (
        <span class="faint" title={"a copy of these versions was supplied: " + supplied.join(", ")}>
          provides {supplied.join(", ")}
        </span>
      ) : null}
      {announced.length ? (
        <span
          class="faint"
          title={
            `announced into "${decl.shareScope}" as available, but nothing supplied a ` +
            "copy: " +
            announced.join(", ")
          }
        >
          declares {announced.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- manifest reading */

/**
 * The manifest keys this view renders, in render order.
 *
 * Spelled as the build spells them rather than given friendly names: the
 * point of showing a manifest is to send a reader to the file, and a label
 * that does not match the key they will search for costs more than it reads.
 *
 * `middlewares` and `requires` are declared on the kernel's own manifest type
 * but no producer emits them, so listing them here would report every real
 * manifest as missing two keys it was never going to have.
 */
export const MANIFEST_SECTIONS = [
  "import-exposed",
  "consume-shared",
  "provide-shared",
  "shared-providers",
  "shared",
] as const;

/**
 * The four keys only the FynApp-enriched build emits.
 *
 * `shared` is rendered but not counted here: an enriched manifest never
 * carries it, so reporting it missing would put a false absence on every
 * FynApp on the page.
 */
export const FYNAPP_MANIFEST_SECTIONS = MANIFEST_SECTIONS.filter((k) => k !== "shared");

export type ManifestSectionState = "absent" | "empty" | "filled";

/**
 * Is this key missing from the manifest, or declared with nothing in it?
 *
 * Both render as a row that is not there, and they mean opposite things. A
 * container built by the plain rollup plugin carries none of these keys, so
 * `provide-shared` absent says "this build never enriched the manifest";
 * `provide-shared: {}` says "it did, and this app provides nothing". Reporting
 * the second as the first is how an empty view comes to read as a broken one.
 *
 * A key present holding something that is not an object counts as empty, not
 * absent -- unreadable is still declared, and the row says so.
 */
export function manifestSectionState(m: FynAppManifest, key: string): ManifestSectionState {
  const value = m[key];
  if (value === undefined || value === null) {
    return "absent";
  }
  if (typeof value !== "object") {
    return "empty";
  }
  return Object.keys(value as object).length ? "filled" : "empty";
}

/** The FynApp-enriched keys this manifest does not carry at all. */
export function absentManifestSections(m: FynAppManifest): string[] {
  return FYNAPP_MANIFEST_SECTIONS.filter((k) => manifestSectionState(m, k) === "absent");
}

/**
 * Which of the two manifest dialects this is.
 *
 * `shared` is the discriminator, and it is the only one that works in both
 * directions. The rollup plugin's no-enrichment branch always writes
 * `shared: options.shared || {}`, so the key is there even when it is empty;
 * `create-fynapp`'s enrichment builds its result from a fixed key list that
 * has no `shared` in it, and drops its own maps when they come out empty. So
 * the four FynApp keys are each individually optional in an enriched manifest
 * and their absence proves nothing, while `shared` present proves the build
 * never ran the enrichment at all.
 *
 * Checked with `in` rather than for truthiness precisely because the empty
 * case is the one that matters.
 */
export function manifestDialect(m: FynAppManifest): "generic" | "fynapp" {
  return "shared" in m ? "generic" : "fynapp";
}

/** The entries of one manifest section, or nothing when it has none to give. */
export function manifestEntries(m: FynAppManifest, key: string): Array<[string, unknown]> {
  const value = m[key];
  return value && typeof value === "object" ? Object.entries(value as object) : [];
}

/** One `import-exposed[app][path]` entry, flattened. */
export interface ImportExposedRow {
  app: string;
  path: string;
  type?: string;
  semver?: string;
  sites?: string[];
  exposeModule?: string;
  middlewareName?: string;
}

/**
 * Flatten `import-exposed` into one row per import.
 *
 * Flat rather than grouped under an app chip, which is what this row used to
 * be: an app that pulls one module and one middleware out of the same
 * neighbour is doing two unrelated things, and a single chip listing both
 * paths said neither.
 */
export function importExposedRows(m: FynAppManifest): ImportExposedRow[] {
  const rows: ImportExposedRow[] = [];
  for (const [app, byPath] of manifestEntries(m, "import-exposed")) {
    if (!byPath || typeof byPath !== "object") {
      continue;
    }
    for (const [path, info] of Object.entries(byPath as Record<string, any>)) {
      const e = (info ?? {}) as Record<string, unknown>;
      rows.push({
        app,
        path,
        type: typeof e.type === "string" ? e.type : undefined,
        semver: typeof e.semver === "string" ? e.semver : undefined,
        sites: Array.isArray(e.sites) ? e.sites.map(String) : undefined,
        exposeModule: typeof e.exposeModule === "string" ? e.exposeModule : undefined,
        middlewareName: typeof e.middlewareName === "string" ? e.middlewareName : undefined,
      });
    }
  }
  return rows;
}

/**
 * A one-line summary of a `consume-shared` / `provide-shared` /
 * `shared-providers` entry.
 *
 * Shape-tolerant on purpose. These come off an untrusted build artefact whose
 * per-entry fields differ between the three keys and have changed before, so
 * the known fields are preferred and anything else falls back to its JSON
 * rather than rendering as a blank beside a key that is plainly there.
 */
export function describeManifestEntry(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return value === undefined ? "" : String(value);
  }
  const e = value as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(e.provides) && e.provides.length) {
    parts.push(e.provides.join(", "));
  }
  if (typeof e.version === "string") {
    parts.push(e.version);
  }
  if (typeof e.semver === "string") {
    parts.push(e.semver);
  }
  return parts.length ? parts.join(" ") : safeStringify(value);
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * The FynMesh build manifest, as the build declared it.
 *
 * Every band above this one is read off the live federation runtime; this one
 * is read off what the author wrote. That is the reason to render it at all --
 * a disagreement between the two is a bug, and it is invisible unless both are
 * on screen.
 *
 * `import-exposed` is the richest of the four, and the only record anywhere of
 * which source file triggered a cross-app import: nothing in the loader's own
 * graph knows that until the import actually happens.
 */
function ManifestBlock({ version: v }: { version: ContainerVersionNode }): JSX.Element | null {
  const m = v.manifest!;
  const generic = manifestDialect(m) === "generic";
  const absent = generic ? [] : absentManifestSections(m);
  const imports = importExposedRows(m);

  const sections = MANIFEST_SECTIONS.filter((k) => manifestSectionState(m, k) !== "absent");
  if (!sections.length && !absent.length) {
    return null;
  }

  return (
    <>
      <div class="node l2" style={{ borderBottom: 0, minHeight: "20px" }}>
        <span class="faint rowlabel">
          manifest
        </span>
        <span class="faint" style={{ fontSize: "9.5px" }}>
          what the build declared, not what the runtime did
        </span>
        {/*
          * A generic manifest is missing all four FynApp keys by construction,
          * so listing them as absences would read as four faults where there
          * is one fact.
          */}
        {generic ? (
          <span
            class="faint"
            style={{ fontSize: "9.5px" }}
            title={
              "this container was built by rollup-plugin-federation with no enrichManifest " +
              "hook, so its manifest carries a raw `shared` map and none of the FynApp keys " +
              "(import-exposed, consume-shared, provide-shared, shared-providers). That is " +
              "the build it asked for, not a gap."
            }
          >
            · plain federation manifest, not FynApp-enriched
          </span>
        ) : absent.length ? (
          <span
            class="faint"
            style={{ fontSize: "9.5px" }}
            title={
              "these keys are not in this container's __FYNAPP_MANIFEST__ at all, which is " +
              "a different fact from declaring one and leaving it empty. create-fynapp drops " +
              "a map it built and found empty, so absent here means nothing to declare."
            }
          >
            · not declared: {absent.join(", ")}
          </span>
        ) : null}
      </div>

      {sections.map((key) =>
        /*
         * `import-exposed` is two levels deep, so it can be non-empty at the
         * top and still flatten to no rows -- an app key holding no imports.
         * Without the second term that section renders as nothing at all,
         * which is the one thing this block exists to stop doing.
         */
        manifestSectionState(m, key) === "empty" ||
        (key === "import-exposed" && !imports.length) ? (
          <div key={key} class="node l3">
            <ManifestKey name={key} />
            <span class="faint" title="the key is in the manifest; it carries no entries">
              declared, and empty
            </span>
          </div>
        ) : key === "import-exposed" ? (
          imports.map((row, i) => (
            <ImportExposedRowView key={row.app + " " + row.path} row={row} first={i === 0} />
          ))
        ) : (
          <ManifestEntriesRow key={key} name={key} entries={manifestEntries(m, key)} />
        )
      )}
    </>
  );
}

/** The literal manifest key, in the column the share rows put their key in. */
function ManifestKey({ name, blank }: { name: string; blank?: boolean }): JSX.Element {
  return (
    <span class="label mono" style={{ flex: "0 1 132px", minWidth: 0 }} title={name}>
      {blank ? "" : name}
    </span>
  );
}

function ImportExposedRowView({
  row,
  first,
}: {
  row: ImportExposedRow;
  first: boolean;
}): JSX.Element {
  const mw = row.type === "middleware";
  return (
    <div class="node l3">
      <ManifestKey name="import-exposed" blank={!first} />
      <ContainerChip
        name={row.app}
        onClick={() => focusOn("containers", "container:" + row.app, row.app)}
      />
      <span class="label mono" style={{ flex: "0 1 150px", minWidth: 0 }} title={row.path}>
        {row.path}
      </span>
      {/*
        * A module import and a middleware import read identically without
        * this, and they are not the same thing: one pulls code, the other
        * hands this app's FynUnit over to another app's middleware.
        */}
      {row.type ? (
        <Chip
          tone={mw ? "accent" : undefined}
          title={
            mw
              ? "a middleware import: " +
                (row.middlewareName ?? "this middleware") +
                " from the " +
                (row.exposeModule ?? row.path) +
                " expose. It runs this app's FynUnit rather than being imported by it."
              : "a plain module import of another app's expose"
          }
        >
          {mw && row.middlewareName ? row.middlewareName : row.type}
        </Chip>
      ) : (
        <span class="faint" title="the build recorded no type for this import">
          type not declared
        </span>
      )}
      <span
        class="faint mono"
        style={{ flex: "0 1 68px", minWidth: 0 }}
        title={row.semver ? undefined : "the import attribute declared no semver range"}
      >
        {row.semver ?? "any"}
      </span>
      <span style={{ flex: 1 }} />
      <SitesCell sites={row.sites} />
    </div>
  );
}

/**
 * Which source files import this.
 *
 * Absent and empty are spelled differently on purpose. The build only records
 * `sites` for the import kinds it tracks, so a missing list means "this build
 * does not say", and an empty one means "it says: nowhere" -- which, next to a
 * declared import, is a finding.
 */
function SitesCell({ sites }: { sites?: string[] }): JSX.Element {
  if (!sites) {
    return (
      <span class="faint" title="this build recorded no import sites for this entry">
        sites not recorded
      </span>
    );
  }
  if (!sites.length) {
    return (
      <span class="faint" title="the manifest lists no source file importing this">
        no import sites
      </span>
    );
  }
  return (
    <span class="faint mono" title={"imported from\n" + sites.join("\n")}>
      {sites.length === 1 ? sites[0] : sites.length + " sites"}
    </span>
  );
}

/**
 * `consume-shared`, `provide-shared`, `shared-providers` and `shared`.
 *
 * One wrapping line each rather than a row per entry: unlike `import-exposed`
 * these carry two or three fields, and the shares band above already gives
 * every one of these keys a full row with what it actually resolved to. What
 * this line adds is the declaration to compare that against.
 *
 * The full entry goes in the title, because `provide-shared` holds the whole
 * shared config by reference and so has no fixed field list to render.
 */
function ManifestEntriesRow({
  name,
  entries,
}: {
  name: string;
  entries: Array<[string, unknown]>;
}): JSX.Element {
  return (
    <div class="node l3 wrapline">
      <ManifestKey name={name} />
      <span class="inline">
        {entries.map(([key, value]) => (
          <span key={key} class="inline" title={key + " " + safeStringify(value)}>
            {name === "shared-providers" ? (
              <ContainerChip
                name={key}
                onClick={() => focusOn("containers", "container:" + key, key)}
              />
            ) : (
              <span class="label mono">{key}</span>
            )}
            {(value as { singleton?: unknown } | null)?.singleton === true ? (
              <span class="sgl" title="declared singleton">
                SGL
              </span>
            ) : null}
            <span class="faint mono">{describeManifestEntry(value)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
