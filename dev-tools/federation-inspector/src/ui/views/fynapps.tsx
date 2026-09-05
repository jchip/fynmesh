/**
 * The FynApps view.
 *
 * The tab that turns a federation-generic tool into a FynMesh one. A container
 * row answers "what did this build publish"; a FynApp row answers "did the
 * kernel actually run it, and if not, what stopped it" -- which is the question
 * anyone opening this panel on a FynMesh page came to ask.
 *
 * The tab only exists when a kernel does. On a plain federation page there is
 * no `snapshot.fynmesh` and `App.tsx` never offers the tab, because an empty
 * FynApps table reads as "this page has zero FynApps" when the truth is "this
 * page has no FynMesh". Every other empty state here is spelled out for the
 * same reason: nothing in this view is allowed to look like an answer when it
 * is really a gap.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type { FynAppNode, FynAppStatus, LoadStage, MiddlewareUseNode } from "../../core/model.js";
import { expanded, focusOn, query, snapshot, toggleExpanded } from "../state.js";
import { parseQuery } from "../../analysis/search.js";
import { Chip, Link, Twisty } from "../components/atoms.jsx";

/**
 * A FynApp status, drawn in the stage-dot vocabulary the rest of the tool uses.
 *
 * A lifecycle status is not a load stage, but the two read the same way at a
 * glance -- filled disc for arrived, pulsing for in flight, ring for parked,
 * cross for failed -- and inventing a second shape language for eight rows
 * would make the panel harder to scan, not clearer. The mapping is only to the
 * CSS class; the label and the tooltip always say the real status.
 */
const STATUS_STAGE: Record<FynAppStatus, LoadStage> = {
  mounted: "executed",
  bootstrapping: "executing",
  suspended: "awaiting-deps",
  failed: "errored",
  shutdown: "registered",
};

const STATUS_TITLE: Record<FynAppStatus, string> = {
  mounted: "mounted — bootstrap completed and its FynUnits are running",
  bootstrapping: "bootstrapping — started, possibly waiting on a middleware provider",
  suspended: "suspended — paused in the background; resume() restores it",
  failed: "failed — bootstrap threw; the app is isolated and its error retained",
  shutdown: "shutdown — being removed from the registry",
};

/** No lifecycle row at all: registered with the kernel, never bootstrapped. */
const UNTRACKED_TITLE =
  "no lifecycle state — the kernel knows this FynApp but never started a bootstrap for it";

function StatusDot({ status }: { status?: FynAppStatus }): JSX.Element {
  const stage = status ? STATUS_STAGE[status] : "registered";
  const label = status ?? "untracked";
  return (
    <span
      class={"stage " + stage}
      role="img"
      aria-label={label}
      title={status ? STATUS_TITLE[status] : UNTRACKED_TITLE}
    />
  );
}

/**
 * Filter FynApp rows with the query string every other tab shares.
 *
 * `app:` and `container:` both narrow by name -- they are the same name, and a
 * query carried in from the Containers tab should keep working here. Fields
 * this tab cannot answer are skipped rather than matched as text, the same rule
 * `filterContainers` follows, so `stage:errored fynapp-1` narrows by the part
 * that applies instead of coming back empty.
 */
export function filterFynApps(apps: FynAppNode[], queryText: string): FynAppNode[] {
  const terms = parseQuery(queryText).filter(
    (t) => t.field === undefined || t.field === "app" || t.field === "container" || t.field === "status"
  );
  if (!terms.length) {
    return apps;
  }
  return apps.filter((a) =>
    terms.every((t) => {
      const needle = t.value.toLowerCase();
      const hit =
        t.field === "status"
          ? (a.status ?? "untracked").toLowerCase().includes(needle)
          : a.name.toLowerCase().includes(needle) || a.version.toLowerCase().includes(needle);
      return t.negated ? !hit : hit;
    })
  );
}

export function FynAppsView(): JSX.Element {
  const snap = snapshot.value;
  const fynmesh = snap.fynmesh;
  const apps = useComputed(() => filterFynApps(snapshot.value.fynmesh?.apps ?? [], query.value));

  if (!fynmesh) {
    return (
      <div class="empty">
        No FynMesh kernel on this page.
        <br />
        This is a federation page without <code>globalThis.fynMeshKernel</code>; there
        are no FynApps to list.
      </div>
    );
  }

  if (!snap.capability.kernelRunTime) {
    return (
      <div class="empty">
        A FynMesh kernel is here, but <code>kernel.runTime.apps</code> could not be read.
        <br />
        That is not "no FynApps" — it is no list to read them from.
      </div>
    );
  }

  if (!apps.value.length) {
    return (
      <div class="empty">
        {fynmesh.apps.length
          ? "No FynApps match this filter."
          : "The kernel is loaded but has no FynApps registered yet."}
      </div>
    );
  }

  // `mountedAt` is a wall clock, which says nothing on its own. Zeroed on the
  // first lifecycle timestamp on the page, the column becomes a mount timeline
  // -- which app came up when, relative to the first one that did.
  const t0 = originOf(fynmesh.apps);

  // the bare-name registry key is only ambiguous when a name has more than one
  // version live, which is exactly when the flag is worth a column
  const ambiguous = new Set(
    fynmesh.apps
      .map((a) => a.name)
      .filter((name, i, all) => all.indexOf(name) !== i)
  );

  return (
    <div class="scroll">
      <div class="tree">
        {apps.value.map((a) => (
          <AppRow key={a.key} app={a} t0={t0} ambiguous={ambiguous.has(a.name)} />
        ))}
      </div>
    </div>
  );
}

function originOf(apps: FynAppNode[]): number | undefined {
  let earliest: number | undefined;
  for (const a of apps) {
    for (const t of [a.mountedAt, a.updatedAt]) {
      if (typeof t === "number" && (earliest === undefined || t < earliest)) {
        earliest = t;
      }
    }
  }
  return earliest;
}

function AppRow({
  app,
  t0,
  ambiguous,
}: {
  app: FynAppNode;
  t0?: number;
  ambiguous: boolean;
}): JSX.Element {
  const id = "fynapp:" + app.key;
  const isOpen = expanded.value.has(id);

  const declared = app.declaredExposes.length;
  const loaded = app.loadedExposes.length;
  const declaredCount = Math.max(declared, loaded);
  const deliveredCount = app.usesMiddleware.filter((u) => u.delivered).length;
  const unregistered = app.usesMiddleware.filter((u) => !u.registered).length;

  return (
    <>
      <div
        class="node l1"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => toggleExpanded(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded(id);
          }
        }}
      >
        <Twisty open={isOpen} />
        <StatusDot status={app.status} />
        <span class="label">{app.name}</span>
        <span class="label ver">{app.version}</span>
        <span class="faint">{app.status ?? "untracked"}</span>
        <span class="faint mono" title={timestampTitle(app)}>
          {offset(app.mountedAt, t0)}
        </span>
        <span
          class="muted"
          title={`${loaded} of ${declaredCount} declared exposes were loaded by the kernel`}
        >
          ex {loaded}/{declaredCount}
        </span>
        <span class="muted" title={middlewareTitle(app)}>
          mw {app.usesMiddleware.length}
          {deliveredCount ? " ✓" + deliveredCount : ""}
        </span>
        {unregistered ? (
          <Chip tone="err" title="declared middleware that is not registered on this page">
            ✗{unregistered}
          </Chip>
        ) : null}
        {ambiguous && app.isDefaultForName ? (
          <Chip
            tone="accent"
            title={
              "the bare-name registry key resolves to this instance, so a by-name " +
              "lookup of " + app.name + " gets this version"
            }
          >
            default
          </Chip>
        ) : null}
        {!app.inRegistry ? (
          <Chip
            title={
              "known only from the lifecycle table -- this FynApp is no longer in " +
              "kernel.runTime.apps, so its exposes and middleware cannot be read"
            }
          >
            not registered
          </Chip>
        ) : null}
        {app.error ? (
          <span class="faint" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={app.error.message}>
            {app.error.message}
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <ContainerLink app={app} />
      </div>

      {isOpen ? <AppDetail app={app} /> : null}
    </>
  );
}

/**
 * The chip through to this app's container row.
 *
 * A FynApp *is* a container version -- same name, same version -- so the link
 * expands the exact version block rather than only scrolling to the container,
 * which matters on the demo page where two containers are both called
 * `fynapp-react-lib`. When the container collector never saw that version, the
 * link still lands on the container and says so, instead of pointing at a row
 * that is not there.
 */
function ContainerLink({ app }: { app: FynAppNode }): JSX.Element | null {
  if (!app.containerId) {
    return (
      <span
        class="faint"
        title="no federation container was collected under this name; the kernel knows the app but the loader's registry does not"
      >
        no container
      </span>
    );
  }
  const select = app.containerVersion
    ? "container:" + app.name + "@" + app.containerVersion
    : undefined;
  return (
    <Link
      title={app.containerId + (app.containerVersion ? " @" + app.containerVersion : "")}
      onClick={() => focusOn("containers", "container:" + app.name, select)}
    >
      →{app.containerId}
    </Link>
  );
}

function AppDetail({ app }: { app: FynAppNode }): JSX.Element {
  const unloaded = app.declaredExposes.filter((e) => !app.loadedExposes.includes(e));
  const undeclared = app.loadedExposes.filter((e) => !app.declaredExposes.includes(e));

  return (
    <>
      <div class="node l2 wrapline">
        <span class="faint rowlabel">lifecycle</span>
        <span class="muted">
          {app.mountedAt ? "mounted " + new Date(app.mountedAt).toLocaleTimeString() : "never mounted"}
          {app.updatedAt
            ? " · last change " + new Date(app.updatedAt).toLocaleTimeString()
            : ""}
        </span>
        {app.packageName && app.packageName !== app.name ? (
          <span class="faint mono">package {app.packageName}</span>
        ) : null}
        {app.hasConfig ? (
          <Chip title="this FynApp exposes ./config and the kernel loaded it; its value is deliberately not snapshotted">
            has config
          </Chip>
        ) : null}
      </div>

      {app.error ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">error</span>
          <span class="mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {app.error.stack ?? app.error.message}
          </span>
        </div>
      ) : null}

      <div class="node l2 wrapline">
        <span class="faint rowlabel">exposes</span>
        {app.declaredExposes.length || app.loadedExposes.length ? (
          <span class="inline">
            {app.loadedExposes.map((e) => (
              <span key={e} class="mono" title="loaded by the kernel">
                {e}
              </span>
            ))}
            {unloaded.map((e) => (
              <span
                key={e}
                class="faint mono"
                title="declared by the build, never loaded by the kernel"
              >
                {e}
              </span>
            ))}
          </span>
        ) : (
          <span class="faint">
            {app.inRegistry
              ? "none declared and none loaded"
              : "unreadable — this app is no longer in the registry"}
          </span>
        )}
        {undeclared.length ? (
          <Chip
            tone="warn"
            title={
              "loaded but absent from the container's declared exposes: " +
              undeclared.join(", ")
            }
          >
            {undeclared.length} undeclared
          </Chip>
        ) : null}
      </div>

      <div class="node l2 wrapline">
        <span class="faint rowlabel">unit hooks</span>
        {app.unitHooks.length ? (
          <span class="inline">
            {app.unitHooks.map((h) => (
              <span key={h} class="mono">
                {h}
              </span>
            ))}
          </span>
        ) : (
          <span class="faint">
            {app.loadedExposes.includes("./main")
              ? "./main exposes no FynUnit"
              : "no ./main expose was loaded"}
          </span>
        )}
      </div>

      {app.usesMiddleware.length ? (
        app.usesMiddleware.map((use, i) => <MiddlewareUseRow key={i} use={use} />)
      ) : (
        <div class="node l2">
          <span class="faint rowlabel">middleware</span>
          <span class="faint">this FynApp declares none</span>
        </div>
      )}

      <div class="node l2 wrapline">
        <span class="faint rowlabel">delivered</span>
        {app.middlewareDelivered.length ? (
          <span
            class="inline"
            title="middlewareContext keys, in the order the middleware wrote them"
          >
            {app.middlewareDelivered.map((k) => (
              <span key={k} class="mono">
                {k}
              </span>
            ))}
          </span>
        ) : (
          <span class="faint">
            nothing wrote into this app's middlewareContext
          </span>
        )}
      </div>

      {app.providesMiddleware.length ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">provides</span>
          <span class="inline">
            {app.providesMiddleware.map((k) => (
              <span key={k} class="mono">
                {k}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </>
  );
}

function MiddlewareUseRow({ use }: { use: MiddlewareUseNode }): JSX.Element {
  const label = use.name
    ? (use.provider ? use.provider + "::" : "") + use.name
    : use.raw ?? "unreadable declaration";

  return (
    <div class="node l3">
      <span class="label" style={{ flex: "0 1 200px", minWidth: 0 }} title={label}>
        {label}
      </span>
      <span class="faint mono" style={{ flex: "0 1 68px", minWidth: 0 }}>
        {use.range ?? "any"}
      </span>
      {use.registered ? (
        <Chip tone="ok" title={use.resolvedFullKey ?? "registered on this page"}>
          registered
        </Chip>
      ) : (
        <Chip
          tone="err"
          title={
            "no middleware is registered under this name, so the kernel skips it " +
            "and this FynApp's execute() never runs"
          }
        >
          not registered
        </Chip>
      )}
      {use.delivered ? (
        <Chip tone="ok" title="this middleware wrote an entry into the app's middlewareContext">
          delivered
        </Chip>
      ) : (
        <Chip
          tone="warn"
          title={
            "nothing under this name is in the app's middlewareContext. The kernel " +
            "keeps no record of middleware application, so this means the middleware " +
            "wrote nothing -- not necessarily that it failed"
          }
        >
          not delivered
        </Chip>
      )}
      {use.form !== "info" ? (
        <span class="faint" title={"declared in the " + use.form + " form"}>
          {use.form}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      <ConfigCell use={use} />
    </div>
  );
}

function ConfigCell({ use }: { use: MiddlewareUseNode }): JSX.Element | null {
  if (use.configKind === "opaque") {
    return (
      <span
        class="faint"
        title={
          "this config is not structured-clone-safe (a function or a DOM node, " +
          "most likely), so only its keys are recorded"
        }
      >
        config {use.configKeys?.length ? "{ " + use.configKeys.join(", ") + " }" : "unreadable"}
      </span>
    );
  }
  if (use.configKind !== "json") {
    return null;
  }
  const json = safeStringify(use.config);
  return (
    <span class="faint mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={json}>
      {json.length > 60 ? json.slice(0, 59) + "…" : json}
    </span>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** `+1.2s` from the first lifecycle timestamp on the page. */
function offset(at?: number, t0?: number): string {
  if (at === undefined || t0 === undefined) {
    return "—";
  }
  const delta = at - t0;
  return delta < 1000 ? "+" + delta + "ms" : "+" + (delta / 1000).toFixed(1) + "s";
}

function timestampTitle(app: FynAppNode): string {
  const lines: string[] = [];
  lines.push(
    app.mountedAt
      ? "first mounted " + new Date(app.mountedAt).toISOString()
      : "never reached mounted"
  );
  if (app.updatedAt) {
    lines.push("last status change " + new Date(app.updatedAt).toISOString());
  }
  return lines.join("\n");
}

function middlewareTitle(app: FynAppNode): string {
  const declared = app.usesMiddleware.length;
  const delivered = app.usesMiddleware.filter((u) => u.delivered).length;
  const missing = app.usesMiddleware.filter((u) => !u.registered).length;
  return (
    `${declared} middleware declared, ${delivered} delivered an API to this app` +
    (missing ? `, ${missing} not registered anywhere on this page` : "")
  );
}
