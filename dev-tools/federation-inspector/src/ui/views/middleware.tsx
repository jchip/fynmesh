/**
 * The Middleware view.
 *
 * The FynApps view reads the middleware registry from the consumer's side --
 * what an app asked for and what it got. This is the same registry from the
 * provider's side: who publishes what, which version a version-less lookup
 * lands on, and who is actually consuming it. One row per `provider::name`,
 * expanding into a block per registered version.
 *
 * Both tabs read one collection. `snapshot.fynmesh.middlewares` is built once
 * by `collectors/fynmesh.ts`, with the consumer list filled in from the same
 * pass over `__middlewareMeta` that fills each FynApp's `usesMiddleware` -- so
 * the two views cannot disagree about who consumes what, because there is only
 * one answer and they both render it.
 *
 * The tab exists only when a kernel does, and every empty state here names
 * what is missing. "No middleware registered" and "the registry could not be
 * read" are different claims, and so are "nobody consumes this" and "the app
 * list could not be read, so consumers are unknown".
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type {
  MiddlewareConsumerNode,
  MiddlewareNode,
  MiddlewareResolution,
  MiddlewareVersionNode,
} from "../../core/model.js";
import { expanded, focusOn, query, snapshot, toggleExpanded } from "../state.js";
import { parseQuery } from "../../analysis/search.js";
import { Chip, Link, Twisty } from "../components/atoms.jsx";

/**
 * What the registry's `default` slot means, in the one sentence that is true.
 *
 * It is the *first* version registered, and the kernel never re-points it
 * (FYM-332): re-pointing to the highest would move `default` under a page that
 * is already running, so two consumers asking for nothing would get different
 * middleware depending only on when they mounted. So this marker says
 * "version-less lookups land here", not "this is the best version" -- since
 * FYM-321 a consumer that declares a range gets a real semver match instead.
 */
const DEFAULT_TITLE =
  "the registry's default slot — what a lookup that asks for no version " +
  "resolves to. It is the FIRST version registered, not the highest, and the " +
  "kernel never re-points it once set. A consumer that cares declares a range.";

/** How a consumer's declaration landed on this version, in the kernel's own order. */
const VIA_TITLE: Record<MiddlewareResolution, string> = {
  exact: "asked for this exact version, and the registry has that key",
  range: "declared a range, and this is the highest registered version satisfying it",
  default: "asked for no version, so it got the default slot — the first version registered",
  fallback:
    "declared a range that no registered version satisfies, so the kernel fell back to " +
    "the default slot: this FynApp is running a version it did not ask for",
  unresolved:
    "this middleware is registered but which version the declaration resolves to could " +
    "not be worked out — the registration behind the default slot could not be read",
};

const VIA_LABEL: Record<MiddlewareResolution, string> = {
  exact: "exact",
  range: "range",
  default: "default",
  fallback: "fallback",
  unresolved: "unresolved",
};

/**
 * Filter middleware rows with the query string every other tab shares.
 *
 * `mw:` narrows by the middleware's own name, `app:` and `container:` by the
 * FynApp on either end of it -- the host that publishes it or any app that
 * consumes it -- because "which middleware does fynapp-1 touch" is the question
 * a query carried in from the FynApps tab is asking. Fields this tab cannot
 * answer are skipped rather than matched as text, the same rule the other
 * filters follow.
 */
export function filterMiddleware(nodes: MiddlewareNode[], queryText: string): MiddlewareNode[] {
  const terms = parseQuery(queryText).filter(
    (t) =>
      t.field === undefined ||
      t.field === "mw" ||
      t.field === "app" ||
      t.field === "container"
  );
  if (!terms.length) {
    return nodes;
  }
  return nodes.filter((m) =>
    terms.every((t) => {
      const needle = t.value.toLowerCase();
      const hit =
        t.field === "mw"
          ? m.name.toLowerCase().includes(needle)
          : t.field === "app" || t.field === "container"
            ? appsOf(m).some((a) => a.toLowerCase().includes(needle))
            : m.regKey.toLowerCase().includes(needle) ||
              appsOf(m).some((a) => a.toLowerCase().includes(needle));
      return t.negated ? !hit : hit;
    })
  );
}

/** Every FynApp on either end of this middleware: its hosts and its consumers. */
function appsOf(m: MiddlewareNode): string[] {
  const out = m.versions.map((v) => v.hostApp);
  for (const c of allConsumers(m)) {
    out.push(c.app);
  }
  return out;
}

function allConsumers(m: MiddlewareNode): MiddlewareConsumerNode[] {
  return [...m.versions.flatMap((v) => v.consumers), ...m.unpinnedConsumers];
}

export function MiddlewareView(): JSX.Element {
  const snap = snapshot.value;
  const fynmesh = snap.fynmesh;
  const rows = useComputed(() =>
    filterMiddleware(snapshot.value.fynmesh?.middlewares ?? [], query.value)
  );

  if (!fynmesh) {
    return (
      <div class="empty">
        No FynMesh kernel on this page.
        <br />
        Middleware is a kernel concept; without <code>globalThis.fynMeshKernel</code> there
        is no registry to read.
      </div>
    );
  }

  if (!snap.capability.kernelMiddleware) {
    return (
      <div class="empty">
        A FynMesh kernel is here, but <code>kernel.runTime.middlewares</code> could not be
        read.
        <br />
        That is not "no middleware" — it is no registry to read it from.
      </div>
    );
  }

  if (!rows.value.length) {
    return (
      <div class="empty">
        {fynmesh.middlewares.length
          ? "No middleware matches this filter."
          : "The middleware registry is readable and empty — no FynApp on this page has registered a middleware."}
      </div>
    );
  }

  // Consumers are read off every FynApp's `__middlewareMeta`. With no app list
  // there is nothing to read them from, so the counts would all be zero — which
  // would say "nobody uses this middleware" when the truth is "we cannot tell".
  const consumersKnown = snap.capability.kernelRunTime;

  return (
    <div class="scroll">
      <div class="tree">
        {rows.value.map((m) => (
          <MiddlewareRow
            key={m.regKey}
            mw={m}
            consumersKnown={consumersKnown}
            autoKnown={fynmesh.autoApplyReadable}
          />
        ))}
      </div>
    </div>
  );
}

function MiddlewareRow({
  mw,
  consumersKnown,
  autoKnown,
}: {
  mw: MiddlewareNode;
  consumersKnown: boolean;
  autoKnown: boolean;
}): JSX.Element {
  const id = "mw:" + mw.regKey;
  const isOpen = expanded.value.has(id);
  const consumers = allConsumers(mw);
  const undelivered = consumers.filter((c) => !c.delivered).length;
  const exposed = mw.nameCollisions.length
    ? consumers.filter((c) => !c.pinnedProvider).length
    : 0;

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
        <span class="label" title={mw.regKey}>
          {mw.name}
        </span>
        <span class="faint mono" title={"published by " + (mw.provider || "an unnamed provider")}>
          {mw.provider || "—"}
        </span>
        <span class="muted" title={autoTitle(mw, autoKnown)}>
          auto: {autoKnown ? mw.autoApply?.join(", ") ?? "—" : "unknown"}
        </span>
        <span class="muted" title={versionsTitle(mw)}>
          {mw.versions.length === 1 ? "1 version" : mw.versions.length + " versions"}
        </span>
        {mw.unreadableVersions.length ? (
          <Chip
            tone="err"
            title={
              "these version keys are in the registry but their registration could not " +
              "be read, so nothing below describes them: " +
              mw.unreadableVersions.join(", ")
            }
          >
            {mw.unreadableVersions.length} unreadable
          </Chip>
        ) : null}
        <span class="muted" title={consumersTitle(mw, consumersKnown)}>
          {consumersKnown
            ? consumers.length === 1
              ? "1 consumer"
              : consumers.length + " consumers"
            : "consumers unknown"}
        </span>
        {consumersKnown && undelivered ? (
          <Chip
            tone="warn"
            title={
              "declared this middleware but have nothing under its name in their " +
              "middlewareContext: " +
              consumers
                .filter((c) => !c.delivered)
                .map((c) => c.app)
                .join(", ")
            }
          >
            ✗{undelivered}
          </Chip>
        ) : null}
        {mw.nameCollisions.length ? (
          <Chip tone={exposed ? "err" : "warn"} title={collisionTitle(mw, exposed)}>
            name shared
          </Chip>
        ) : null}
        <span style={{ flex: 1 }} />
        {mw.defaultVersion ? (
          <span class="faint mono" title={DEFAULT_TITLE}>
            ⚑{mw.defaultVersion}
          </span>
        ) : (
          <span
            class="faint"
            title={
              "nothing occupies this middleware's default slot, so a lookup that asks " +
              "for no version resolves to nothing at all"
            }
          >
            no default
          </span>
        )}
      </div>

      {isOpen ? <MiddlewareDetail mw={mw} consumersKnown={consumersKnown} /> : null}
    </>
  );
}

function MiddlewareDetail({
  mw,
  consumersKnown,
}: {
  mw: MiddlewareNode;
  consumersKnown: boolean;
}): JSX.Element {
  return (
    <>
      {mw.versions.map((v) => (
        <VersionBlock key={v.version} mw={mw} version={v} consumersKnown={consumersKnown} />
      ))}

      {!mw.versions.length ? (
        <div class="node l2">
          <span class="faint rowlabel">versions</span>
          <span class="faint">
            {mw.unreadableVersions.length
              ? "unreadable — the registry holds " +
                mw.unreadableVersions.length +
                " version key(s) here, but none of their registrations could be read"
              : "this middleware has a registry entry with no versions in it"}
          </span>
        </div>
      ) : null}

      {mw.unpinnedConsumers.length ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">unpinned</span>
          <span
            class="faint"
            title={
              "these FynApps declare this middleware, but which registered version they " +
              "resolve to could not be worked out"
            }
          >
            resolve to this middleware but to no version below
          </span>
          <span class="inline">
            {mw.unpinnedConsumers.map((c) => (
              <ConsumerChip key={c.app} consumer={c} />
            ))}
          </span>
        </div>
      ) : null}

      {mw.nameCollisions.length ? (
        <div class="node l2 wrapline">
          <span class="faint rowlabel">also named</span>
          <span class="inline">
            {mw.nameCollisions.map((k) => (
              <Chip key={k} tone="warn" title={collisionChipTitle(mw)}>
                {k}
              </Chip>
            ))}
          </span>
        </div>
      ) : null}
    </>
  );
}

function VersionBlock({
  mw,
  version,
  consumersKnown,
}: {
  mw: MiddlewareNode;
  version: MiddlewareVersionNode;
  consumersKnown: boolean;
}): JSX.Element {
  const [hostName] = version.hostApp.split("@");

  return (
    <>
      <div class="node l2">
        <span class="label ver">{version.version}</span>
        {version.isDefault ? (
          <Chip tone="accent" title={DEFAULT_TITLE}>
            ⚑ default
          </Chip>
        ) : null}
        <span class="faint rowlabel">host</span>
        {version.hostApp ? (
          <Link
            title={"show " + version.hostApp + " in the FynApps view"}
            onClick={() => focusOn("fynapps", hostName, "fynapp:" + version.hostApp)}
          >
            {version.hostApp}
          </Link>
        ) : (
          <span
            class="faint"
            title="the registration carries no hostFynApp, so which FynApp published this version is unreadable"
          >
            unreadable
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span class="faint mono" title={"full registry key " + version.fullKey}>
          {version.fullKey || "no fullKey"}
        </span>
      </div>

      <div class="node l3 wrapline">
        <span class="faint rowlabel">expose</span>
        <span class="mono" title="the expose the middleware manager scanned">
          {version.exposeName || "—"}
        </span>
        <span class="faint rowlabel">export</span>
        <span class="mono" title="the __middleware__* export it was registered from">
          {version.exportName || "—"}
        </span>
      </div>

      <div class="node l3 wrapline">
        <span class="faint rowlabel">hooks</span>
        <Mark on={version.hasSetup} label="setup" title="setup() — runs once, before any apply" />
        <Mark
          on={version.hasApply}
          label="apply"
          title="apply() — runs per consuming FynApp; this is what writes into middlewareContext"
        />
        <Mark
          on={version.hasShouldApply}
          label="shouldApply"
          title="shouldApply() — the middleware can decline a consumer, so a declared middleware may deliberately deliver nothing"
        />
        <Mark
          on={version.overridesExecution}
          label="override"
          title={
            version.overrideHooks.length
              ? "this middleware can run instead of its consumer's FynUnit: " +
                version.overrideHooks.join(", ")
              : "no override hooks — this middleware cannot take over a consumer's execution"
          }
        />
        {version.autoApplyScope?.length ? (
          <Chip
            title={
              "autoApplyScope — the kernel applies this to every " +
              version.autoApplyScope.join(" and ") +
              " on the page without anyone declaring it"
            }
          >
            auto {version.autoApplyScope.join(", ")}
          </Chip>
        ) : null}
      </div>

      <div class="node l3 wrapline">
        <span class="faint rowlabel">consumers</span>
        {!consumersKnown ? (
          <span
            class="faint"
            title="kernel.runTime.apps could not be read, so there is nothing to read declarations from"
          >
            unknown — the FynApp list could not be read
          </span>
        ) : version.consumers.length ? (
          <span class="inline">
            {version.consumers.map((c) => (
              <ConsumerChip key={c.app} consumer={c} />
            ))}
          </span>
        ) : (
          <span
            class="faint"
            title={
              "no FynApp on this page declares " +
              mw.regKey +
              " in a way that resolves to this version" +
              (version.autoApplyScope?.length
                ? ". It auto-applies, and the kernel keeps no record of that, so it may " +
                  "well be running anyway"
                : "")
            }
          >
            {version.autoApplyScope?.length
              ? "nobody declares it — but it auto-applies, and the kernel records no trace of that"
              : "nobody declares it"}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * One consumer, as `app ✓delivered` or `app ✗not delivered`.
 *
 * Delivery is read from the consumer's `middlewareContext`, which the
 * middleware itself writes -- so a cross means "this middleware wrote nothing
 * into that app", which is a middleware that declined via `shouldApply`, one
 * that has nothing to hand over, or one that failed. The kernel keeps no record
 * that separates those three, and the tooltip says so rather than picking one.
 */
function ConsumerChip({ consumer }: { consumer: MiddlewareConsumerNode }): JSX.Element {
  const [name] = consumer.app.split("@");
  const detail = [
    consumer.range ? "asked for " + consumer.range : "asked for no version",
    VIA_TITLE[consumer.via],
    consumer.pinnedProvider
      ? "named the provider"
      : "named no provider (or one that never registered), so the kernel resolved this by name alone",
    consumer.delivered
      ? "its middlewareContext carries an entry under this name"
      : "nothing under this name is in its middlewareContext — the middleware may have " +
        "declined it, delivered nothing, or failed; the kernel records no difference",
  ].join("\n");

  return (
    <Chip
      tone={consumer.delivered ? "ok" : "warn"}
      title={detail}
      onClick={() => focusOn("fynapps", name, "fynapp:" + consumer.app)}
    >
      {consumer.app} {consumer.delivered ? "✓" : "✗"}
      {consumer.via !== "default" && consumer.via !== "exact"
        ? " " + VIA_LABEL[consumer.via]
        : ""}
    </Chip>
  );
}

function Mark({
  on,
  label,
  title,
}: {
  on: boolean;
  label: string;
  title: string;
}): JSX.Element {
  return (
    <span class={on ? "muted" : "faint"} title={title}>
      {label} {on ? "✓" : "—"}
    </span>
  );
}

function autoTitle(mw: MiddlewareNode, known: boolean): string {
  if (!known) {
    return (
      "neither kernel.runTime.autoApply nor kernel.mwMgr.getAutoApply() could be read on " +
      "this kernel, so whether this middleware auto-applies is unknown — not 'it does not'"
    );
  }
  if (!mw.autoApply?.length) {
    return "no auto-apply scope: this middleware runs only where a FynApp declares it";
  }
  return (
    "the kernel applies this to every " +
    mw.autoApply.join(" and ") +
    " on the page, whether or not anything declares it"
  );
}

function versionsTitle(mw: MiddlewareNode): string {
  if (!mw.versions.length) {
    return "no registered version could be read under " + mw.regKey;
  }
  return (
    mw.versions.map((v) => v.version + " (" + (v.hostApp || "unreadable host") + ")").join(", ") +
    (mw.defaultVersion
      ? "\ndefault → " + mw.defaultVersion + ", the first of them to register"
      : "")
  );
}

function consumersTitle(mw: MiddlewareNode, known: boolean): string {
  if (!known) {
    return (
      "kernel.runTime.apps could not be read, so no FynApp's declarations are " +
      "available: this is 'cannot tell', not 'nobody'"
    );
  }
  const consumers = allConsumers(mw);
  if (!consumers.length) {
    return (
      "no FynApp on this page declares " +
      mw.regKey +
      (mw.autoApply?.length ? ", though it auto-applies and so may be running anyway" : "")
    );
  }
  const delivered = consumers.filter((c) => c.delivered).length;
  return (
    consumers.length +
    " FynApps declare it, " +
    delivered +
    " have something under its name in their middlewareContext"
  );
}

function collisionTitle(mw: MiddlewareNode, exposed: number): string {
  const base =
    "'" +
    mw.name +
    "' is also registered by " +
    mw.nameCollisions.join(", ") +
    ". A lookup that names no provider takes whichever the kernel scanned first and " +
    "console.errors — a message a production build strips.";
  return exposed
    ? base +
        "\n" +
        exposed +
        " consumer(s) here named no provider, so they are resolving by name across that collision."
    : base + "\nEvery consumer here named its provider, so none of them hit that path.";
}

function collisionChipTitle(mw: MiddlewareNode): string {
  return (
    "another provider registers a middleware called '" +
    mw.name +
    "'. Neither is wrong; a consumer that names no provider just gets whichever " +
    "registered first."
  );
}
