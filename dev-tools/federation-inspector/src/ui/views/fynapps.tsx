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
 *
 * Above the list sits the bootstrap queue panel. A row says what happened to
 * one FynApp; the panel says what is happening to all of them right now -- who
 * holds the kernel's single bootstrap lock, who is parked behind it, and which
 * middleware provider each of those is still waiting for. It is a panel and not
 * a tab because it is only ever a handful of lines, and because it is the
 * context those rows are read in.
 *
 * The exposes column counts what the *kernel imported* and says so. It used to
 * be labelled `ex L/D` and described as "loaded", which is a different fact
 * that the Containers tab was separately counting off chunk stages -- so the
 * two tabs printed different numbers under the same word for the same app.
 * Both now read `src/core/exposes.ts`, which names the three levels.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type {
  BootstrapDeferredNode,
  BootstrapQueueNode,
  FynAppNode,
  FynAppStatus,
  FynMeshNode,
  LoadStage,
  MiddlewareUseNode,
} from "../../core/model.js";
import type { ExposeLevels } from "../../core/exposes.js";
import { fynAppExposeLevels } from "../../core/exposes.js";
import {
  resolutionTone,
  UNDECLARED_TITLE,
  useResolution,
  useTone,
  VIA_LABEL,
  VIA_TITLE,
} from "../middleware-resolution.js";
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
      <BootstrapPanel fynmesh={fynmesh} />
      {!snap.capability.kernelRunTime ? (
        <div class="empty">
          A FynMesh kernel is here, but <code>kernel.runTime.apps</code> could not be read.
          <br />
          That is not "no FynApps" — it is no list to read them from.
        </div>
      ) : !apps.value.length ? (
        <div class="empty">
          {fynmesh.apps.length
            ? "No FynApps match this filter."
            : "The kernel is loaded but has no FynApps registered yet."}
        </div>
      ) : (
        <div class="tree">
          {apps.value.map((a) => (
            <AppRow key={a.key} app={a} t0={t0} ambiguous={ambiguous.has(a.name)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The bootstrap queue, in the four states it can be in.
 *
 * The kernel bootstraps one FynApp at a time and parks the rest, so "why is my
 * app not mounted" is usually answered by this panel and nothing else. It reads
 * `kernel.bootstrapCoordinator`, which the production kernel mangles, and the
 * whole point of the panel is that the four cases stay four:
 *
 * - **absent** — no readable coordinator. One line saying so, because an empty
 *   queue here would claim every FynApp has finished.
 * - **unreadable** — the coordinator is there but one of its surfaces is not.
 *   The surface is named; nothing is inferred from what could not be read.
 * - **empty** — nobody holds the lock and nothing is queued. A real, healthy
 *   state, and said as one rather than as a blank panel.
 * - **readable** — the holder, the queue behind it, and what each is waiting on.
 */
function BootstrapPanel({ fynmesh }: { fynmesh: FynMeshNode }): JSX.Element {
  const queue = fynmesh.bootstrapQueue;

  if (!queue) {
    return (
      <div class="section">
        <div class="head">
          <span>bootstrap queue</span>
          <span class="sub">unavailable in this build</span>
        </div>
        <div class="tree">
          <div class="node l1 wrapline">
            <span class="faint">
              {fynmesh.build === "minified"
                ? "kernel.bootstrapCoordinator is mangled in the production kernel — there is no queue to read, which is not the same as an idle one."
                : "kernel.bootstrapCoordinator could not be read on this kernel — there is no queue to read, which is not the same as an idle one."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const idle =
    queue.holder === undefined &&
    !queue.deferred.length &&
    !queue.unreadableDeferred &&
    !queue.unreadable.length;

  return (
    <div class="section">
      <div class="head">
        <span>bootstrap queue</span>
        <span class="sub" title={summaryTitle(queue)}>
          {queueSummary(queue, idle)}
        </span>
      </div>
      <div class="tree">
        {queue.unreadable.length ? (
          <div class="node l1 wrapline">
            <Chip
              tone="err"
              title={
                "these fields of kernel.bootstrapCoordinator could not be read, so " +
                "nothing below speaks for them — this is a gap, not an empty queue"
              }
            >
              unreadable
            </Chip>
            <span class="faint">
              {queue.unreadable.join(", ")} could not be read
            </span>
          </div>
        ) : null}

        {idle ? (
          <div class="node l1 wrapline">
            <span class="faint">
              Nobody holds the bootstrap lock and nothing is deferred — every FynApp
              that started has finished. This is the healthy state, not a missing
              reading.
            </span>
          </div>
        ) : null}

        {queue.holder !== undefined ? (
          <div class="node l1">
            <span class="stage executing" role="img" aria-label="bootstrapping" />
            <span class="label">{queue.holder}</span>
            <span
              class="faint"
              title={
                "the coordinator's single bootstrap lock. Every other FynApp's " +
                "bootstrap waits until this one completes, fails or times out"
              }
            >
              holds the bootstrap lock
            </span>
          </div>
        ) : !idle && !queue.unreadable.includes("bootstrappingApp") ? (
          <div class="node l1">
            <span class="faint">
              The bootstrap lock is free — nothing is bootstrapping right now.
            </span>
          </div>
        ) : null}

        {queue.deferred.map((d, i) => (
          <DeferredRow key={d.key + ":" + i} deferred={d} lockHeld={queue.holder !== undefined} />
        ))}

        {queue.unreadableDeferred ? (
          <div class="node l1 wrapline">
            <Chip
              tone="err"
              title="queued entries whose fynApp could not be read; they are counted so the queue length stays true"
            >
              {queue.unreadableDeferred} unreadable
            </Chip>
            <span class="faint">
              {queue.unreadableDeferred === 1 ? "one queued entry" : "queued entries"} whose FynApp
              could not be read
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function queueSummary(queue: BootstrapQueueNode, idle: boolean): string {
  if (idle) {
    return "idle — lock free, nothing deferred";
  }
  // Neither half of the summary is allowed to state a count for a field that
  // could not be read: "lock free" and "0 deferred" are the two sentences that
  // would turn a gap back into the idle reading this panel exists to separate.
  const parts: string[] = [];
  parts.push(
    queue.unreadable.includes("bootstrappingApp")
      ? "lock unreadable"
      : queue.holder !== undefined
        ? queue.holder + " bootstrapping"
        : "lock free"
  );
  parts.push(
    queue.unreadable.includes("deferredBootstraps")
      ? "queue unreadable"
      : queue.deferred.length === 1
        ? "1 deferred"
        : queue.deferred.length + " deferred"
  );
  if (queue.unreadableDeferred) {
    parts.push(queue.unreadableDeferred + " unreadable");
  }
  return parts.join(" · ");
}

function summaryTitle(queue: BootstrapQueueNode): string {
  const lines = [
    "kernel.bootstrapCoordinator: one FynApp bootstraps at a time and the rest are deferred.",
    queue.bootstrapped.length
      ? "bootstrapped so far: " + queue.bootstrapped.join(", ")
      : "the coordinator has recorded no completed bootstrap yet",
  ];
  if (queue.modes.length) {
    lines.push(
      "provider/consumer roles recorded for: " + queue.modes.map((m) => m.app).join(", ")
    );
  }
  return lines.join("\n");
}

/**
 * One parked FynApp, and why.
 *
 * `waitingOn` is the coordinator's own dependency rule replayed: a consumer of
 * a middleware waits until whichever FynApp registered as that middleware's
 * provider has bootstrapped. Empty means the dependencies are satisfied and the
 * lock is the only thing left -- unless nobody holds the lock either, which is
 * a stall the coordinator should not be in and is worth saying out loud.
 */
function DeferredRow({
  deferred,
  lockHeld,
}: {
  deferred: BootstrapDeferredNode;
  lockHeld: boolean;
}): JSX.Element {
  return (
    <>
      <div class="node l1">
        <span class="stage awaiting-deps" role="img" aria-label="deferred" />
        <span class="label">{deferred.name}</span>
        <span class="label ver">{deferred.version || "—"}</span>
        {deferred.waitingOn.length ? (
          <Chip
            tone="warn"
            title={
              "this FynApp consumes middleware whose provider has not bootstrapped yet; " +
              "the coordinator will resume it when the provider completes"
            }
          >
            waiting on {deferred.waitingOn.length}
          </Chip>
        ) : lockHeld ? (
          <Chip tone="ok" title="its middleware dependencies are satisfied; it resumes when the lock is released">
            ready
          </Chip>
        ) : (
          <Chip
            tone="err"
            title={
              "its dependencies are satisfied and nobody holds the bootstrap lock, yet it " +
              "is still queued — the coordinator resumes the queue on a completion or a " +
              "failure event, so one of those was missed or has not fired yet"
            }
          >
            stalled
          </Chip>
        )}
      </div>
      {deferred.waitingOn.map((b) => (
        <div class="node l2" key={b.middleware + "::" + b.provider}>
          <span class="faint rowlabel">waiting on</span>
          <span class="mono" title="the middleware this FynApp registered as a consumer of">
            {b.middleware}
          </span>
          <span class="faint">from</span>
          <Link
            title={"jump to " + b.provider + " in this list"}
            onClick={() => focusOn("fynapps", "app:" + b.provider)}
          >
            {b.provider}
          </Link>
          <span class="faint">
            which the coordinator has not recorded as bootstrapped
          </span>
        </div>
      ))}
    </>
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

/**
 * What holds the bare-name registry key, said without the word `default`.
 *
 * This chip used to read `default`, and a middleware row two lines below it can
 * read `default 1.0.0` (FYM-356) -- one word, two registries, on one FynApp's
 * row (FYM-361). The branch chip keeps the word: `default` is one of the five
 * names that mirror what the kernel's resolver did, it is what `resolvedVia`
 * carries, and the Middleware view reads the same table -- renaming inside that
 * set to settle a collision here would break the correspondence and put the two
 * views back into disagreement (FYM-353).
 *
 * Nothing similar stands behind this one, and the codebase already had a
 * spelling for it: `FynAppRegistry.add` writes the *bare* name, and the model,
 * the collector and the ambiguous-name issue all say "the bare key" or "the
 * bare `name`". The chip was the only place calling it `default`, so it is the
 * one that moves -- the same rule as FYM-355, one spelling per concept.
 *
 * Scoping both instead (`default name` / `default version`) was the other way
 * out and is worse: it draws the two as siblings when their tie-breaks are
 * *opposite*. The bare app key is re-pointed on every registration, so it is
 * whichever version registered LAST; a middleware's `default` slot is set once
 * by the FIRST version and never moves (FYM-332). Making them rhyme is exactly
 * the assumption `fynapp-name-ambiguous` exists to warn a reader off.
 */
export const BARE_NAME_LABEL = "bare name";

/** Which lookups land here, and why this key is not the middleware `default` slot. */
export function bareNameTitle(app: FynAppNode): string {
  return (
    "the bare registry key `" + app.name + "` points at this instance, so a lookup by " +
    "name alone — `loadFynAppsByName`, a middleware declaration naming a provider with " +
    "no version — gets this version.\n\n" +
    "`FynAppRegistry.add` re-points that key on every registration, so it is whichever " +
    "version registered LAST. That is the opposite of a middleware's `default` slot, " +
    "which the first registration sets and nothing moves after."
  );
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

  const exposes = fynAppExposeLevels(app);
  const deliveredCount = app.usesMiddleware.filter((u) => u.delivered).length;
  const unregistered = app.usesMiddleware.filter((u) => !u.registered).length;
  // Delivered, and still not what was asked for (FYM-356). `mw 3 ✓3` reads as
  // three out of three and is the only middleware signal on a collapsed row, so
  // a `fallback` used to be invisible until someone opened the row *and* knew
  // to compare a range against a version. The count is separate from `✗` above
  // because "nothing is registered under that name" and "something is, and it is
  // the wrong version" have nothing to do with each other.
  const misresolved = app.usesMiddleware.filter((u) => u.delivered && useTone(u) === "warn");

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
        <span class={exposes.imported ? "muted" : "faint"} title={importedTitle(exposes)}>
          {!exposes.imported
            ? "exposes unreadable"
            : exposes.declared.length
              ? `${exposes.imported.length}/${exposes.declared.length} imported`
              : "no exposes"}
        </span>
        {exposes.undeclared ? (
          <Chip
            tone="warn"
            title={
              "the kernel returned exposes this container never declared: " +
              exposes.undeclared.join(", ")
            }
          >
            {exposes.undeclared.length} undeclared
          </Chip>
        ) : null}
        <span class="muted" title={middlewareTitle(app)}>
          mw {app.usesMiddleware.length}
          {deliveredCount ? " ✓" + deliveredCount : ""}
        </span>
        {unregistered ? (
          <Chip tone="err" title="declared middleware that is not registered on this page">
            ✗{unregistered}
          </Chip>
        ) : null}
        {misresolved.length ? (
          <Chip tone="warn" title={misresolvedTitle(misresolved)}>
            ⚠{misresolved.length}
          </Chip>
        ) : null}
        {ambiguous && app.isDefaultForName ? (
          <Chip tone="accent" title={bareNameTitle(app)}>
            {BARE_NAME_LABEL}
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
  const levels = fynAppExposeLevels(app);
  const notImported = app.declaredExposes.filter((e) => !app.importedExposes.includes(e));
  const undeclared = levels.undeclared ?? [];
  const undeclaredDelivery = new Set(undeclaredDeliveries(app));

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
        {app.declaredExposes.length || app.importedExposes.length ? (
          <span class="inline">
            {app.importedExposes.map((e) => (
              <span key={e} class="mono" title="imported by the kernel onto fynApp.exposes">
                {e}
              </span>
            ))}
            {notImported.map((e) => (
              <span key={e} class="faint mono" title={notImportedTitle(e, levels)}>
                {e}
              </span>
            ))}
          </span>
        ) : (
          <span class="faint">
            {app.inRegistry
              ? "none declared and none imported"
              : "unreadable — this app is no longer in the registry"}
          </span>
        )}
        {undeclared.length ? (
          <Chip
            tone="warn"
            title={
              "imported but absent from the container's declared exposes: " +
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
            {app.importedExposes.includes("./main")
              ? "./main exposes no FynUnit"
              : "the kernel never imported a ./main expose"}
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
              <DeliveredKey key={k} name={k} declared={!undeclaredDelivery.has(k)} />
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

/**
 * The `middlewareContext` keys this app never asked for (FYM-356).
 *
 * Matched on the declared name, which is the same join the collector makes when
 * it sets `use.delivered` -- so a key here is a delivery no row above accounts
 * for. That is the FynApp side of FYM-347's undeclared route, read from this
 * app's own two fields and needing nothing from the registry.
 *
 * Which is why this can name one the Middleware view cannot: over there an
 * undeclared consumer has to be attributed to a registration, and two providers
 * of one name (FYM-333) leave it unattributable, so the chip is dropped. Here
 * there is nothing to attribute. Both are `ok`-toned either way, so the tabs
 * differ in what they can say and not in how bad they say it is.
 */
export function undeclaredDeliveries(app: FynAppNode): string[] {
  const declared = new Set(app.usesMiddleware.map((u) => u.name).filter((n) => !!n));
  return app.middlewareDelivered.filter((k) => !declared.has(k));
}

/**
 * One `middlewareContext` key, and whether this app ever asked for it.
 *
 * The declared ones have a row of their own above, with the branch that
 * resolved them. These do not, and they cannot: nothing was declared, so no
 * resolution ran and there is no branch to draw. Drawing one anyway -- or
 * leaving the key bare, which is what this row used to do -- is how an
 * auto-applied middleware ends up looking like a resolved declaration.
 *
 * So it is tagged for what is observable and nothing more, in the same words
 * the Middleware view's `undeclared` chip uses for the same FynApp.
 */
function DeliveredKey({ name, declared }: { name: string; declared: boolean }): JSX.Element {
  if (declared) {
    return (
      <span class="mono" title={"declared above, and delivered under this name"}>
        {name}
      </span>
    );
  }
  return (
    <span class="inline" title={UNDECLARED_TITLE}>
      <span class="mono">{name}</span>
      <span class="faint">undeclared</span>
    </span>
  );
}

/**
 * One `__middlewareMeta` declaration: what this app asked for, and what it got.
 *
 * Three separate facts, each with its own chip, because collapsing them loses
 * the one the reader came for. `registered` is whether anything answers to the
 * name at all. `delivered` is whether an entry appeared in `middlewareContext`.
 * Between them sits the branch that resolved it (FYM-356) -- the fact this row
 * used to omit entirely, which left `fallback` (running a version it did not ask
 * for) rendering exactly like `exact`, two green chips and a tick.
 *
 * All five branches are named here even though the Middleware view's chip only
 * names two. That view's chip already sits under the version it resolved to;
 * this row has no such context, and "asked for nothing and got the first
 * version registered" is a different answer from "asked for 2.0.0 and got it"
 * to someone reading their own app's row. The tone comes from the same table
 * either way, so the extra detail can never become extra severity.
 *
 * There is no branch chip when nothing is registered under the name. The kernel
 * never reached the version map, so there was no resolution -- and `unresolved`
 * means something else and narrower: registered, but which version is unreadable.
 */
function MiddlewareUseRow({ use }: { use: MiddlewareUseNode }): JSX.Element {
  const label = use.name
    ? (use.provider ? use.provider + "::" : "") + use.name
    : use.raw ?? "unreadable declaration";
  const via = useResolution(use);

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
      {via ? (
        <Chip
          tone={resolutionTone(via)}
          title={
            (use.range ? "asked for " + use.range : "asked for no version") +
            "\n" +
            VIA_TITLE[via] +
            (use.resolvedVersion ? "\nrunning " + use.resolvedVersion : "")
          }
        >
          {VIA_LABEL[via]}
          {use.resolvedVersion ? " " + use.resolvedVersion : ""}
        </Chip>
      ) : null}
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

/**
 * The exposes cell's tooltip.
 *
 * It says "imported" and not "loaded", and it says why the Containers tab may
 * show a bigger number for the same container: a chunk can be in the loader
 * because a sibling expose imported it, with nobody having imported the expose
 * itself.
 */
export function importedTitle(levels: ExposeLevels): string {
  const imported = levels.imported;
  if (!imported) {
    return (
      "this FynApp is no longer in the registry, so neither its declared exposes " +
      "nor the ones the kernel imported can be read — not zero of them, none " +
      "readable. The Containers tab says nothing about imported for it either."
    );
  }
  if (!levels.declared.length) {
    return "this FynApp's container declares no exposes at all, so there is no fraction to show";
  }
  const lines = [
    `${imported.length} of ${levels.declared.length} declared exposes were imported ` +
      "by the kernel onto fynApp.exposes" +
      (imported.length ? ": " + imported.join(", ") : ""),
    "The Containers tab counts loaded chunks, which is a different and usually " +
      "larger number for the same container.",
  ];
  if (levels.undeclared) {
    lines.push("imported but never declared: " + levels.undeclared.join(", "));
  }
  return lines.join("\n");
}

/**
 * A declared-but-not-imported expose's tooltip.
 *
 * "The kernel never imported it" is one fact; whether there is a chunk that
 * could have loaded anyway is a second one, and it decides whether the
 * Containers tab has anything to show for this name. An expose the build
 * inlined into the container entry has no chunk at all -- `fynapp-design-tokens`'s
 * `./main` is exactly that -- so sending the reader over there to look for one
 * is a dead end, and the Containers tab already says the true thing about it.
 *
 * Which names are inlined is the container collector's answer, joined onto the
 * FynApp node and read here. Deriving it a second time off something in this
 * view is how the exposes numbers came to disagree across these two tabs in the
 * first place; see `src/core/exposes.ts`.
 */
export function notImportedTitle(name: string, levels: ExposeLevels): string {
  const head = "declared by the build, never imported by the kernel.";
  if (!levels.inlined) {
    // no container version row: whether this name has a chunk is unknown, and
    // "its chunk may have loaded" would presume one exists
    return (
      head +
      " No container row was collected for this version, so whether it has a" +
      " chunk of its own is unknown."
    );
  }
  if (levels.inlined.includes(name)) {
    return (
      head +
      " The build inlined it into the container entry, so it has no chunk of" +
      " its own that could have loaded."
    );
  }
  return head + " Its chunk may still have loaded — see this container on the Containers tab.";
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

/**
 * The `⚠n` chip's tooltip: which declarations resolved badly, and how.
 *
 * Named one by one rather than counted, because the two branches under this
 * chip need different things done about them -- a `fallback` is a range to fix,
 * an `unresolved` is a registration the inspector could not read -- and a bare
 * number sends the reader hunting through the expanded rows for which is which.
 */
export function misresolvedTitle(uses: MiddlewareUseNode[]): string {
  return [
    "delivered, and not what was asked for:",
    ...uses.map((u) => {
      const via = useResolution(u) ?? "unresolved";
      return `· ${u.name ?? u.raw ?? "unreadable declaration"} — ${VIA_LABEL[via]}: ${VIA_TITLE[via]}`;
    }),
  ].join("\n");
}
