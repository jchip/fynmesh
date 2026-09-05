/**
 * The Modules view: every module the loader knows, one row each.
 *
 * Row height comes from `ui/metrics.ts` rather than a literal, because the
 * virtual list positions rows by arithmetic and has to agree with CSS exactly.
 *
 * Columns drop out in a fixed order as the panel narrows -- source first, then
 * dependents, then the container chip -- rather than the row wrapping or the
 * table scrolling sideways. Narrow is a normal state for a docked panel.
 *
 * Expansion is in place. A modal or a second pane would hide the list you are
 * comparing against, and comparison is what this view is for.
 */

import type { JSX } from "preact";
import { useComputed } from "@preact/signals";
import type { ModuleNode, LoadStage } from "../../core/model.js";
import {
  analysis,
  density,
  expanded,
  focusOn,
  groupBy,
  query,
  selected,
  snapshot,
  sortBy,
  sortDesc,
  toggleExpanded,
  visibleModules,
  type SortBy,
} from "../state.js";
import { toggleFacet } from "../../analysis/search.js";
import { rowHeight } from "../metrics.js";
import { VirtualList } from "../components/VirtualList.jsx";
import {
  Chip,
  ContainerChip,
  KindGlyph,
  Link,
  ModuleId,
  STAGE_LABEL,
  STAGE_ORDER,
  StageDot,
  Twisty,
} from "../components/atoms.jsx";
import { splitUrl, urlTail } from "../../util/format.js";

/**
 * The column table.
 *
 * One definition drives both the header and every row, because two hand-kept
 * lists of widths drifted: measured against the live panel the header labels
 * sat 1-7px off the data they named, and two columns differed in width
 * outright. Anything that changes a width now changes it in both places.
 *
 * `hide` is the order columns leave as the panel narrows -- source first,
 * since a docked panel is usually narrow and the url is the least dense
 * information in the row.
 */
interface Column {
  key: string;
  label: string;
  sort?: SortBy;
  /** css width; "grow" columns take the remainder */
  width: string;
  grow?: boolean;
  num?: boolean;
  hide?: "hide-md" | "hide-sm" | "hide-xs";
  title?: string;
}

const COLUMNS: Column[] = [
  { key: "dot", label: "", width: "var(--w-stage)" },
  { key: "kind", label: "", width: "var(--w-kind)" },
  { key: "id", label: "module", sort: "id", width: "auto", grow: true },
  { key: "container", label: "container", sort: "container", width: "150px", hide: "hide-sm" },
  { key: "deps", label: "dep", sort: "deps", width: "38px", num: true, title: "dependencies" },
  {
    key: "dependents",
    label: "used",
    sort: "dependents",
    width: "38px",
    num: true,
    hide: "hide-xs",
    title: "modules that depend on this",
  },
  { key: "stage", label: "stage", sort: "stage", width: "92px", hide: "hide-xs" },
  { key: "source", label: "source", width: "34%", hide: "hide-md" },
];

function cellClass(c: Column): string {
  return ["col", c.grow ? "grow" : "", c.num ? "num" : "", c.hide ?? ""]
    .filter(Boolean)
    .join(" ");
}

function cellStyle(c: Column): JSX.CSSProperties {
  return c.grow ? { minWidth: 0 } : { width: c.width, flex: "none" };
}

/** A group header, or a module. Both flow through one virtual list. */
type Row =
  | { type: "group"; key: string; label: string; count: number; hue?: string }
  | { type: "module"; key: string; module: ModuleNode };

const STAGE_RANK = new Map(STAGE_ORDER.map((s, i) => [s, i]));

function sortModules(list: ModuleNode[], by: SortBy, desc: boolean): ModuleNode[] {
  const sorted = list.slice();
  const dir = desc ? -1 : 1;
  sorted.sort((a, b) => {
    switch (by) {
      case "id":
        return dir * a.id.localeCompare(b.id);
      case "deps":
        return dir * (a.deps.length - b.deps.length);
      case "dependents":
        return dir * (a.dependents.length - b.dependents.length);
      case "stage":
        return (
          dir *
          ((STAGE_RANK.get(a.stage) ?? 99) - (STAGE_RANK.get(b.stage) ?? 99))
        );
      case "container":
        return (
          dir *
          (a.container?.name ?? "￿").localeCompare(b.container?.name ?? "￿")
        );
      default:
        return dir * (a.seq - b.seq);
    }
  });
  return sorted;
}

function groupKeyOf(m: ModuleNode, by: string): string {
  switch (by) {
    case "container":
      return m.container ? m.container.name + "@" + (m.container.version ?? "?") : "(no container)";
    case "scope":
      return m.scope ?? "(no scope)";
    case "kind":
      return m.kind;
    case "bundle":
      return m.bundle ? urlTail(m.bundle, 1) : "(own file)";
    default:
      return "";
  }
}

export function ModulesView(): JSX.Element {
  const rows = useComputed<Row[]>(() => {
    const sorted = sortModules(visibleModules.value, sortBy.value, sortDesc.value);
    const by = groupBy.value;
    if (by === "none") {
      return sorted.map((m) => ({ type: "module", key: m.id, module: m }));
    }

    const buckets = new Map<string, ModuleNode[]>();
    for (const m of sorted) {
      const key = groupKeyOf(m, by);
      const list = buckets.get(key);
      if (list) {
        list.push(m);
      } else {
        buckets.set(key, [m]);
      }
    }

    const out: Row[] = [];
    for (const [label, members] of [...buckets].sort((a, b) => a[0].localeCompare(b[0]))) {
      out.push({ type: "group", key: "grp:" + label, label, count: members.length });
      for (const m of members) {
        out.push({ type: "module", key: m.id, module: m });
      }
    }
    return out;
  });

  const cursorIndex = useComputed(() =>
    selected.value ? rows.value.findIndex((r) => r.key === selected.value) : -1
  );

  const onSort = (col: SortBy) => {
    if (sortBy.value === col) {
      sortDesc.value = !sortDesc.value;
    } else {
      sortBy.value = col;
      // counts are most useful largest-first; names are not
      sortDesc.value = col === "deps" || col === "dependents";
    }
  };

  const header = (
    <div class="thead">
      {COLUMNS.map((c) => (
        <span key={c.key} class={cellClass(c)} style={cellStyle(c)} title={c.title}>
          {c.sort ? (
            <button
              class={"col" + (sortBy.value === c.sort ? " sorted" : "")}
              onClick={() => onSort(c.sort!)}
              title={"Sort by " + c.label}
            >
              {c.label}
              {sortBy.value === c.sort ? (sortDesc.value ? " ↓" : " ↑") : ""}
            </button>
          ) : (
            c.label
          )}
        </span>
      ))}
    </div>
  );

  // The list positions rows arithmetically, so this has to be exactly what CSS
  // gives a row -- both come from ui/metrics.ts so they cannot drift.
  const rowH = rowHeight(density.value);

  return (
    <VirtualList<Row>
      items={rows.value}
      rowHeight={rowH}
      keyOf={(r) => r.key}
      heightsKey={expanded.value}
      extraHeight={(r, m) =>
        r.type === "module" && expanded.value.has(r.module.id)
          ? // `m` is the measured height once the detail has rendered; until
            // then an estimate keeps the scrollbar from jumping on expand
            Math.max(0, (m ?? rowH + 240) - rowH)
          : 0
      }
      scrollTo={cursorIndex.value}
      header={header}
      empty={<EmptyModules />}
      renderRow={(row, _i, measureRef) =>
        row.type === "group" ? (
          <div class="section">
            <div class="head" style={{ height: rowH + "px" }}>
              <span>{row.label}</span>
              <span class="sub">{row.count}</span>
            </div>
          </div>
        ) : (
          <ModuleRow module={row.module} measureRef={measureRef} />
        )
      }
    />
  );
}

function ModuleRow({
  module: m,
  measureRef,
}: {
  module: ModuleNode;
  measureRef: (el: HTMLElement | null) => void;
}): JSX.Element {
  const isOpen = expanded.value.has(m.id);
  const isSelected = selected.value === m.id;
  const url = splitUrl(m.url);

  return (
    <div ref={measureRef}>
      <div
        class={"row" + (isSelected ? " cursor" : "")}
        aria-selected={isSelected}
        aria-expanded={isOpen}
        role="row"
        tabIndex={0}
        onClick={() => {
          selected.value = m.id;
          toggleExpanded(m.id);
        }}
      >
        {COLUMNS.map((c) => (
          <span key={c.key} class={cellClass(c)} style={cellStyle(c)}>
            {renderCell(c, m, url)}
          </span>
        ))}
      </div>
      {isOpen ? <ModuleDetail module={m} /> : null}
    </div>
  );
}

/** One cell of a module row. Keyed to COLUMNS so header and body cannot drift. */
function renderCell(
  c: Column,
  m: ModuleNode,
  url: { origin: string; path: string }
): JSX.Element | string | null {
  switch (c.key) {
    case "dot":
      return <StageDot stage={m.stage} />;
    case "kind":
      return <KindGlyph kind={m.kind} />;
    case "id":
      return (
        <>
          <ModuleId id={m.id} />
          {m.shareKey ? (
            <Chip tone="accent" title={"shared as " + m.shareKey}>
              {m.shareKey}
            </Chip>
          ) : null}
          {m.bundle ? (
            <Chip title={"arrived inside the combined file " + m.bundle}>bundled</Chip>
          ) : null}
          {m.aliases.length ? (
            <Chip title={"aliases: " + m.aliases.join(", ")}>≡{m.aliases.length}</Chip>
          ) : null}
        </>
      );
    case "container":
      return m.container ? (
        <ContainerChip
          name={m.container.name}
          version={m.container.version}
          onClick={(e) => {
            e.stopPropagation();
            query.value = toggleFacet(query.value, "container", m.container!.name);
          }}
        />
      ) : null;
    case "deps":
      return m.deps.length ? String(m.deps.length) : "";
    case "dependents":
      return m.dependents.length ? String(m.dependents.length) : "";
    case "stage":
      return <span class="stagetext">{STAGE_LABEL[m.stage]}</span>;
    case "source":
      return m.error ? (
        <span class="errtext" title={m.error.message}>
          {m.error.message}
        </span>
      ) : (
        <span class="url" title={m.url ?? "no url"}>
          {url.path || "—"}
        </span>
      );
    default:
      return null;
  }
}

function ModuleDetail({ module: m }: { module: ModuleNode }): JSX.Element {
  const snap = snapshot.value;
  const graph = analysis.value.graph;
  const depth = graph.depth.get(m.id);

  const jump = (id: string) => {
    focusOn("modules", "id:" + id, id);
  };

  return (
    <div class="detail">
      <dl>
        <dt>id</dt>
        <dd>{m.id}</dd>
        {m.url && m.url !== m.id ? (
          <>
            <dt>url</dt>
            <dd>
              {/*
                * A real link, because the next question after "which file is
                * this" is always "what is in it". A page cannot open the
                * Sources panel -- there is no API for that, and this UI holds
                * a snapshot rather than the live module, so it cannot hand
                * devtools an object to resolve either. A new tab is the whole
                * of what the page form can offer; the devtools extension can
                * do the real thing with panels.openResource().
                */}
              <a class="link" href={m.url} target="_blank" rel="noreferrer noopener">
                {m.url}
              </a>
            </dd>
          </>
        ) : null}
        {m.bundle ? (
          <>
            <dt>bundle</dt>
            <dd title="this module arrived inside a combined file">{m.bundle}</dd>
          </>
        ) : null}
        <dt>stage</dt>
        <dd class="dim">
          {STAGE_LABEL[m.stage]}
          {depth !== undefined && depth !== Infinity ? ` · depth ${depth} from a root` : ""}
          {graph.inCycle.has(m.id) ? " · in a dependency cycle" : ""}
        </dd>
        {m.container ? (
          <>
            <dt>container</dt>
            <dd class="dim">
              {m.container.name}
              {m.container.version ? "@" + m.container.version : ""}
              {m.scope ? ` · scope ${m.scope}` : ""}
            </dd>
          </>
        ) : null}
        {m.shareKey ? (
          <>
            <dt>share</dt>
            <dd class="dim">
              {m.shareKey}
              {m.version ? "@" + m.version : ""}
            </dd>
          </>
        ) : null}
        {m.aliases.length ? (
          <>
            <dt>aliases</dt>
            <dd class="dim">{m.aliases.join(", ")}</dd>
          </>
        ) : null}
        {m.registration ? (
          <>
            <dt>registration</dt>
            <dd class="dim">
              {m.registration.qualifiers.length
                ? `versions ${m.registration.qualifiers.join(", ")}`
                : "unqualified"}
              {m.registration.pending ? " · pending, not consumed" : ""}
              {m.registration.taken ? " · consumed" : ""}
            </dd>
          </>
        ) : null}
        {snap.loaders.length > 1 ? (
          <>
            <dt>loader</dt>
            <dd class="dim">#{m.loader}</dd>
          </>
        ) : null}
      </dl>

      {m.error ? (
        <>
          <h4>error</h4>
          <pre>{m.error.stack || m.error.message}</pre>
        </>
      ) : null}

      {m.exports?.length ? (
        <>
          <h4>exports ({m.exports.length})</h4>
          <div class="linklist">
            {m.exports.map((name) => (
              <span class="link" key={name} style={{ color: "var(--fg-dim)" }}>
                {name}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {m.deps.length ? (
        <>
          <h4>dependencies ({m.deps.length})</h4>
          <div class="linklist">
            {m.deps.map((d) => (
              <Link
                key={d.id}
                missing={d.missing}
                title={d.missing ? d.id + " (not in the registry)" : d.id}
                onClick={() => jump(d.id)}
              >
                {urlTail(d.id, 1) || d.id}
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {m.dependents.length ? (
        <>
          <h4>used by ({m.dependents.length})</h4>
          <div class="linklist">
            {m.dependents.map((d) => (
              <Link key={d.id} title={d.id} onClick={() => jump(d.id)}>
                {urlTail(d.id, 1) || d.id}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function EmptyModules(): JSX.Element {
  const total = snapshot.value.modules.length;
  return (
    <div class="empty">
      {total === 0 ? (
        <>
          No modules found.
          <br />
          This page has a loader but nothing has been registered with it yet.
        </>
      ) : (
        <>
          None of the {total} modules match this filter.
          <br />
          <code>{query.value}</code>
        </>
      )}
    </div>
  );
}

/** Facet definitions for the filter bar; kept here beside the view they drive. */
export function stageFacets(): Array<{ value: LoadStage; count: number }> {
  const counts = analysis.value.facets.stage;
  return STAGE_ORDER.filter((s) => counts.has(s)).map((s) => ({
    value: s,
    count: counts.get(s)!,
  }));
}

export { Twisty };
