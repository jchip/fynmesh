/**
 * The Middleware view.
 *
 * The FynApps view reads the middleware registry from the consumer's side --
 * what an app asked for and what it got. This is the same registry from the
 * provider's side: who publishes what, which version a version-less lookup
 * lands on, and who is actually consuming it. One row per `provider::name`,
 * expanding into a block per registered version.
 *
 * Both tabs read one collection, and getting that guarantee right took two
 * goes. `snapshot.fynmesh.middlewares` was first filled from the pass over
 * `__middlewareMeta` alone -- the same pass that fills each FynApp's
 * `usesMiddleware` -- on the reasoning that one source cannot contradict
 * itself. It could, because a FynApp does not have to declare a middleware to
 * be running one: `fynapp-shell-mw::shell-layout` auto-applies, and it showed
 * `0 consumers` here while the FynApps tab listed it as delivered to three
 * FynApps (FYM-347).
 *
 * So the collector now files consumers from *both* of the FynApp fields this
 * view's sibling renders -- `usesMiddleware` and `middlewareDelivered` -- and
 * tags each with the `route` it came by. The count answers "who runs on this",
 * which is the question a reader of this tab is asking, and "who asked for it"
 * is still on every chip. Neither tab can be short of the other, because
 * neither is reading a subset of the other's evidence any more.
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
  MiddlewareVersionNode,
} from "../../core/model.js";
import {
  consumerTone,
  UNDECLARED_TITLE,
  VIA_LABEL,
  VIA_TITLE,
} from "../middleware-resolution.js";
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

/**
 * One spelling for the auto-apply scopes (FYM-355).
 *
 * The same fact reaches this view through two surfaces with two vocabularies.
 * The runtime's `autoApply` map buckets its registrations under `fynapp` and
 * `mw`; the registration's own `autoApplyScope` -- the array a middleware author
 * actually writes -- says `fynapp` and `middleware`, and may say `all` for both.
 * Rendering each faithfully to its source put `auto: fynapp, mw` two lines above
 * `auto fynapp, middleware` on the same middleware, leaving the reader to work
 * out whether that was one scope or two.
 *
 * The author's vocabulary wins, because the reader of this row is the person who
 * writes `autoApplyScope`. `all` is expanded rather than passed through: it is
 * shorthand for both, and showing it next to a row naming both would be the same
 * ambiguity in a third form.
 */
const SCOPE_LABELS: Record<string, string[]> = {
  fynapp: ["fynapp"],
  mw: ["middleware"],
  middleware: ["middleware"],
  all: ["fynapp", "middleware"],
};

/** The scopes as this view names them, deduped and in the order given. */
function scopeLabels(scopes: readonly string[]): string[] {
  const out: string[] = [];
  for (const scope of scopes) {
    for (const label of SCOPE_LABELS[scope] ?? [scope]) {
      if (!out.includes(label)) {
        out.push(label);
      }
    }
  }
  return out;
}

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
  // only a *declaration* can miss a provider: an undeclared consumer named
  // nothing at all, and never went near the kernel's resolve-by-name path
  const exposed = mw.nameCollisions.length
    ? consumers.filter((c) => c.route === "declared" && !c.pinnedProvider).length
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
          auto:{" "}
          {autoKnown ? (mw.autoApply ? scopeLabels(mw.autoApply).join(", ") : "—") : "unknown"}
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
              "these FynApps consume this middleware, but which registered version they " +
              "are on could not be worked out -- either a declaration that resolves to " +
              "no version below, or an undeclared consumer of a middleware with more " +
              "than one version it could have come from"
            }
          >
            consume this middleware but no version below
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
              scopeLabels(version.autoApplyScope).join(" and ") +
              " on the page without anyone declaring it" +
              (version.autoApplyScope.includes("all")
                ? '. Declared as "all", which is both of them'
                : "")
            }
          >
            auto: {scopeLabels(version.autoApplyScope).join(", ")}
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
              " in a way that resolves to this version, and none carries it in " +
              "middlewareContext either" +
              (version.autoApplyScope?.length
                ? ". It auto-applies, so the kernel would have offered it to every " +
                  "FynApp here — every one of them either declined it through " +
                  "shouldApply or was handed nothing to record"
                : "")
            }
          >
            {version.autoApplyScope?.length
              ? "nobody declares it, and nobody carries it in middlewareContext — it auto-applies, so it ran and wrote nothing"
              : "nobody declares it, and nobody carries it in middlewareContext"}
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
 *
 * An undeclared consumer has no cross to show and no resolution to describe --
 * it exists only because delivery happened. It is labelled for what it is, so a
 * reader counting chips against the FynApps tab can see which of them got here
 * without asking.
 *
 * The tick and the colour say different things (FYM-354). The tick is delivery.
 * The colour is delivery *and* the resolution branch, so a `fallback` consumer
 * is amber with a tick: something arrived, and it is not what was asked for.
 *
 * The label abbreviates and the colour never does. `default` and `exact` go
 * unnamed here because the chip already sits inside the version block they
 * landed on, and repeating it on every chip would bury the two branches worth
 * reading. The FynApps row is the other way round -- there the branch *is* what
 * the row is answering, so it names all five. Both take their word and their
 * tone from `middleware-resolution.ts`, so the two tabs can differ in how much
 * they spell out and never in how bad they say it is (FYM-353).
 */
function ConsumerChip({ consumer }: { consumer: MiddlewareConsumerNode }): JSX.Element {
  const [name] = consumer.app.split("@");
  const detail =
    consumer.route === "undeclared"
      ? UNDECLARED_TITLE
      : [
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
      tone={consumerTone(consumer)}
      title={detail}
      onClick={() => focusOn("fynapps", name, "fynapp:" + consumer.app)}
    >
      {consumer.app} {consumer.delivered ? "✓" : "✗"}
      {consumer.route === "undeclared"
        ? " undeclared"
        : consumer.via !== "default" && consumer.via !== "exact"
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
    scopeLabels(mw.autoApply).join(" and ") +
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
      ", and none carries it in middlewareContext" +
      (mw.autoApply?.length
        ? " — it auto-applies, so the kernel offered it to every FynApp here and none " +
          "of them recorded anything"
        : "")
    );
  }
  const declared = consumers.filter((c) => c.route === "declared").length;
  const undeclared = consumers.length - declared;
  const delivered = consumers.filter((c) => c.delivered).length;
  return (
    consumers.length +
    " FynApps run on it: " +
    declared +
    " declare it" +
    (undeclared
      ? " and " +
        undeclared +
        " never asked — it auto-applied, or the middleware wrote straight into them"
      : "") +
    ". " +
    delivered +
    " have something under its name in their middlewareContext."
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
