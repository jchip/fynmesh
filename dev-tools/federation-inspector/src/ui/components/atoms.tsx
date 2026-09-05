/**
 * The small pieces every view shares: stage indicator, kind glyph, chips,
 * links, icons.
 *
 * Two rules run through all of them.
 *
 * Never colour alone. A stage is a colour *and* a shape (filled disc, ring,
 * square, rotated square), because red-green is the pair this UI leans on
 * hardest and it is the pair most likely to be indistinguishable.
 *
 * Never wrap. Rows are a fixed height, so anything that could overflow either
 * middle-truncates or ellipsises, and carries the full value in `title`.
 */

import type { ComponentChildren, JSX } from "preact";
import type { LoadStage, ModuleKind } from "../../core/model.js";
import { hueFor, splitId } from "../../util/format.js";

export const STAGE_LABEL: Record<LoadStage, string> = {
  registered: "registered",
  instantiating: "fetching",
  instantiated: "declared",
  linked: "linked",
  "awaiting-deps": "awaiting deps",
  executing: "executing",
  executed: "executed",
  errored: "errored",
};

/** Ordered from earliest to latest, for sorting and for facet display. */
export const STAGE_ORDER: LoadStage[] = [
  "errored",
  "registered",
  "instantiating",
  "instantiated",
  "linked",
  "awaiting-deps",
  "executing",
  "executed",
];

export function StageDot({ stage }: { stage: LoadStage }): JSX.Element {
  return (
    <span
      class={"stage " + stage}
      role="img"
      aria-label={STAGE_LABEL[stage] ?? stage}
      title={STAGE_LABEL[stage] ?? stage}
    />
  );
}

const KIND_GLYPH: Record<ModuleKind, string> = {
  "container-entry": "▣",
  exposed: "◈",
  shared: "◆",
  chunk: "▫",
  external: "○",
  unknown: "·",
};

const KIND_LABEL: Record<ModuleKind, string> = {
  "container-entry": "container entry",
  exposed: "exposed module",
  shared: "shared module",
  chunk: "chunk",
  external: "external module",
  unknown: "unclassified",
};

export function KindGlyph({ kind }: { kind: ModuleKind }): JSX.Element {
  return (
    <span class="kind" role="img" aria-label={KIND_LABEL[kind]} title={KIND_LABEL[kind]}>
      {KIND_GLYPH[kind]}
    </span>
  );
}

export function Chip(props: {
  children: ComponentChildren;
  tone?: "ok" | "warn" | "err" | "accent";
  title?: string;
  onClick?: (e: MouseEvent) => void;
  class?: string;
}): JSX.Element {
  const cls = ["chip", props.tone ?? "", props.class ?? ""].filter(Boolean).join(" ");
  const inner = <span class="chiptext">{props.children}</span>;
  return props.onClick ? (
    <button class={cls} title={props.title} onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <span class={cls} title={props.title}>
      {inner}
    </span>
  );
}

/**
 * A container name, tinted by a hash of the name.
 *
 * The tint is the fastest way to group rows by owner while scanning, and it
 * has to be stable across refreshes or that grouping becomes noise -- hence a
 * hash rather than a palette cursor.
 */
export function ContainerChip(props: {
  name: string;
  version?: string;
  onClick?: (e: MouseEvent) => void;
}): JSX.Element {
  const style = { "--hue": String(hueFor(props.name)) } as JSX.CSSProperties;
  const label = props.name + (props.version ? "@" + props.version : "");
  // the name ellipsises, the version never does: a truncated version number is
  // worse than no version at all, because "@1." reads as a real value
  const inner = (
    <>
      <span class="chiptext">{props.name}</span>
      {props.version ? <span class="chipver">@{props.version}</span> : null}
    </>
  );
  return props.onClick ? (
    <button class="chip container" style={style} title={label} onClick={props.onClick}>
      {inner}
    </button>
  ) : (
    <span class="chip container" style={style} title={label}>
      {inner}
    </span>
  );
}

/**
 * How much of a module id's prefix to keep.
 *
 * Enough to tell two apps apart, not enough to push the filename out of view.
 * A url prefix is dropped from the FRONT, because its tail (the app directory)
 * is the part that distinguishes it -- "localhost:3000" is the same on every
 * row and "fynapp-1/dist/" is not.
 */
const LEAD_MAX = 34;

function leadFor(lead: string): string {
  return lead.length <= LEAD_MAX ? lead : "…" + lead.slice(-(LEAD_MAX - 1));
}

/**
 * A module id with its repeating prefix dimmed.
 *
 * The prefix is what every sibling shares (a directory, or `__mf_entry_`); the
 * tail is what distinguishes them. So the prefix is dimmed and clipped and the
 * tail is never truncated at all.
 *
 * The clipping is done here rather than in CSS on purpose. `direction: rtl`
 * plus `text-overflow` looks like the natural way to drop the front of a path,
 * but it is a bidi reorder, not a clip: a prefix ending in "/" had its slash
 * moved to the visual start, so every row rendered as
 * "…:///localhost:3000/fynapp-1/dist" with no separator before the filename.
 */
export function ModuleId({ id, title }: { id: string; title?: string }): JSX.Element {
  const { lead, tail } = splitId(id);
  return (
    <span class="id" title={title ?? id}>
      {lead ? <span class="lead">{leadFor(lead)}</span> : null}
      <span class="tail">{tail}</span>
    </span>
  );
}

export function Link(props: {
  children: ComponentChildren;
  onClick: () => void;
  missing?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      class={"link" + (props.missing ? " missing" : "")}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function Twisty({ open }: { open: boolean }): JSX.Element {
  return (
    <span class={"twisty" + (open ? " open" : "")} aria-hidden="true">
      ▶
    </span>
  );
}

/** A satisfied / unsatisfied marker for a resolved semver range. */
export function SatisfiedMark({
  ok,
  title,
}: {
  ok: boolean;
  title?: string;
}): JSX.Element {
  return (
    <span
      class={"chip mark " + (ok ? "ok" : "warn")}
      title={title ?? (ok ? "range satisfied" : "range not satisfied")}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}

/* ------------------------------------------------------------------ icons */

export const Icons = {
  logo: (
    <svg class="glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="8" cy="3" r="1.8" />
      <circle cx="3" cy="12" r="1.8" />
      <circle cx="13" cy="12" r="1.8" />
      <path d="M8 4.8v3.4M8 8.2 4.2 10.6M8 8.2l3.8 2.4" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3 3" stroke-linecap="round" />
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" stroke-linecap="round" />
      <path d="M13 2.5V5h-2.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="3.5" width="2.6" height="9" rx="0.6" />
      <rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.6v8.8L12.5 8z" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
      <path d="M10.5 3.5h-6a1.5 1.5 0 0 0-1.5 1.5v6" stroke-linecap="round" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
      <path d="m4.5 4.5 7 7m0-7-7 7" stroke-linecap="round" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
      <path d="M9.5 3.5 5 8l4.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ),
  forward: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
      <path d="M6.5 3.5 11 8l-4.5 4.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  ),
  dock: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="2.5" y="3" width="11" height="10" rx="1.4" />
      <path d="M10 3v10" />
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
      <circle cx="8" cy="8" r="4" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M13 3l-1.1 1.1M4.1 11.9 3 13" stroke-linecap="round" />
    </svg>
  ),
};
