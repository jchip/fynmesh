/**
 * The Shares view.
 *
 * This is the view that earns the tool. A share scope is a three-level tree --
 * scope, key, version -- and the two facts that matter about it are recorded
 * in different places by different parties: the store knows which versions
 * were *provided* and by whom, and each container separately knows which range
 * it *asked* for. Nothing joins them at runtime, so "who asked for what, and
 * did they get it" is a question you currently answer by reading console
 * warnings. Here it is a row.
 *
 * The header of each key carries the verdict -- how many copies are actually
 * loaded, and whether that is legal for a singleton -- because that is the
 * failure people come looking for.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type { ShareKeyNode, ShareScopeNode, ShareVersionNode } from "../../core/model.js";
import { expanded, focusOn, query, snapshot, toggleExpanded } from "../state.js";
import { Chip, ContainerChip, Link, SatisfiedMark, StageDot, Twisty } from "../components/atoms.jsx";
import { urlTail } from "../../util/format.js";

export function SharesView(): JSX.Element {
  const scopes = useComputed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) {
      return snapshot.value.scopes;
    }
    // The share view filters on the key name only. The module query grammar
    // does not apply here -- a person typing "esm-react" in this tab means the
    // share, not a module id.
    const needle = q.replace(/^share:/, "");
    return snapshot.value.scopes
      .map((s) => ({
        ...s,
        keys: s.keys.filter(
          (k) => k.key.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle)
        ),
      }))
      .filter((s) => s.keys.length);
  });

  if (!snapshot.value.capability.shareStore) {
    return (
      <div class="empty">
        The federation share store is not readable on this page.
        <br />
        Share scopes, versions and providers are unavailable.
      </div>
    );
  }

  if (!scopes.value.length) {
    return (
      <div class="empty">
        {snapshot.value.scopes.length
          ? "No share keys match this filter."
          : "No share scopes have been created on this page."}
      </div>
    );
  }

  return (
    <div class="scroll">
      {scopes.value.map((scope) => (
        <ScopeSection key={scope.name} scope={scope} />
      ))}
    </div>
  );
}

function ScopeSection({ scope }: { scope: ShareScopeNode }): JSX.Element {
  const loadedTotal = scope.keys.reduce((n, k) => n + k.loadedCount, 0);
  return (
    <div class="section">
      <div class="head">
        <span>scope</span>
        <span style={{ color: "var(--accent)" }}>{scope.name}</span>
        <span class="sub">
          {scope.keys.length} key{scope.keys.length === 1 ? "" : "s"} · {loadedTotal} loaded
        </span>
      </div>
      <div class="tree">
        {scope.keys.map((key) => (
          <KeyBlock key={key.key} scope={scope.name} node={key} />
        ))}
      </div>
    </div>
  );
}

function KeyBlock({ scope, node }: { scope: string; node: ShareKeyNode }): JSX.Element {
  const id = "share:" + scope + ":" + node.key;
  const isOpen = expanded.value.has(id) || node.issues.length > 0;
  const worst = node.issues.find((i) => i.severity === "error") ?? node.issues[0];

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
        <span class="label">{node.key}</span>
        {node.singleton ? (
          <span class="sgl" title="declared singleton: one copy for the whole scope">
            SGL
          </span>
        ) : null}
        <span class="faint">
          {node.versions.length} version{node.versions.length === 1 ? "" : "s"} ·{" "}
          {node.loadedCount} loaded
        </span>
        <span style={{ flex: 1 }} />
        {worst ? (
          <Chip tone={worst.severity === "error" ? "err" : "warn"} title={worst.detail}>
            {worst.severity === "error" ? "⚠" : "!"} {worst.title}
          </Chip>
        ) : null}
      </div>
      {isOpen
        ? node.versions.map((v) => (
            <VersionBlock key={v.version} scope={scope} shareKey={node.key} version={v} />
          ))
        : null}
    </>
  );
}

function VersionBlock({
  scope,
  shareKey,
  version: v,
}: {
  scope: string;
  shareKey: string;
  version: ShareVersionNode;
}): JSX.Element {
  const provided = !!(v.url || v.chunkId);

  return (
    <>
      <div class="node l2">
        {v.loaded && v.stage ? (
          <StageDot stage={v.stage} />
        ) : (
          <span class="stage registered" title={provided ? "provided, not loaded" : "declared only"} />
        )}
        <span class="label ver">
          {v.version}
        </span>
        {v.loaded ? (
          <Chip tone="ok" title="a copy of this version is loaded">
            loaded
          </Chip>
        ) : provided ? (
          <Chip title="a provider exists but nothing has imported it">available</Chip>
        ) : (
          <Chip tone="warn" title="announced into the scope, but no module was supplied">
            not provided
          </Chip>
        )}
        {v.url ? (
          <Link title={v.url} onClick={() => focusOn("modules", "url:" + v.url, v.url)}>
            {urlTail(v.url, 2)}
          </Link>
        ) : v.chunkId ? (
          <span class="faint" title={v.chunkId}>
            {v.chunkId}
          </span>
        ) : null}
      </div>

      {v.sources.length ? (
        <div class="node l3 wrapline">
          <span class="faint rowlabel">
            provided by
          </span>
          <span class="inline">
            {v.sources.map((s, i) => (
              <ContainerChip
                key={s.container + i}
                name={s.container}
                version={s.version}
                onClick={() => focusOn("containers", "container:" + s.container, s.container)}
              />
            ))}
          </span>
        </div>
      ) : null}

      {v.consumers.length ? (
        <div class="node l3 wrapline">
          <span class="faint rowlabel">
            consumed by
          </span>
          <span class="inline">
            {v.consumers.map((c, i) => (
              <span
                key={c.container + i}
                class="inline"
              >
                <ContainerChip
                  name={c.container}
                  version={c.containerVersion}
                  onClick={() => focusOn("containers", "container:" + c.container, c.container)}
                />
                {c.range ? (
                  <span class="faint mono">
                    {c.range}
                  </span>
                ) : null}
                <SatisfiedMark
                  ok={c.satisfied}
                  title={
                    c.satisfied
                      ? `${v.version} satisfies ${c.range ?? "the declaration"}`
                      : `${v.version} does NOT satisfy ${c.range}`
                  }
                />
              </span>
            ))}
          </span>
        </div>
      ) : null}

      {!v.sources.length && !v.consumers.length ? (
        <div class="node l3">
          <span class="faint">no declared sources or consumers · {scope}:{shareKey}</span>
        </div>
      ) : null}
    </>
  );
}
