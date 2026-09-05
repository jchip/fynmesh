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
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type { ContainerNode, ContainerVersionNode, ShareDecl } from "../../core/model.js";
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
  const loadedExposes = v.exposes.filter((e) => e.stage && e.stage !== "registered").length;
  const unsatisfied = v.consumes.filter((d) => d.resolved && !d.resolved.satisfies).length;

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
        <span class="muted">
          {v.exposes.length ? `${loadedExposes}/${v.exposes.length} exposes loaded` : "no exposes"}
        </span>
        {v.consumes.length ? (
          <span class="muted">
            {v.consumes.length} share{v.consumes.length === 1 ? "" : "s"}
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
                  <span
                    key={e.name}
                    class="inline"
                    title={`${e.name} → ${e.chunkId}${e.url ? "\n" + e.url : ""}`}
                  >
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
      {decl.versions.length ? (
        <span class="faint" title={"this container can provide: " + decl.versions.join(", ")}>
          provides {decl.versions.join(", ")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * FynMesh-specific extras.
 *
 * `import-exposed` is the interesting one: it records that this app imports
 * another app's exposed module, which is cross-app wiring that appears nowhere
 * in the loader's own graph until the import actually happens.
 */
function ManifestBlock({ version: v }: { version: ContainerVersionNode }): JSX.Element {
  const m = v.manifest!;
  const importExposed = m["import-exposed"] ?? {};
  const providers = m["shared-providers"] ?? {};

  const entries = Object.entries(importExposed);
  return (
    <>
      {entries.length ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">
            imports from
          </span>
          <span class="inline">
            {entries.map(([app, exposes]) => (
              <span key={app} class="inline">
                <ContainerChip
                  name={app}
                  onClick={() => focusOn("containers", "container:" + app, app)}
                />
                <span class="faint mono">
                  {Object.keys(exposes).join(" ")}
                </span>
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {Object.keys(providers).length ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">
            provided by
          </span>
          <span class="inline">
            {Object.entries(providers).map(([app, info]) => (
              <span key={app} class="inline">
                <ContainerChip
                  name={app}
                  onClick={() => focusOn("containers", "container:" + app, app)}
                />
                <span class="faint">
                  {(info.provides ?? []).join(", ")}
                  {info.semver ? " " + info.semver : ""}
                </span>
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </>
  );
}
