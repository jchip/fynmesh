/**
 * The Raw view: the snapshot as a collapsible tree, plus a copy button.
 *
 * The escape hatch for anything the other views do not model, and -- more
 * usefully -- the attachment for a bug report. A snapshot is plain JSON by
 * construction, so pasting it into an issue carries the whole page state:
 * every module, every container, every share resolution, and the capability
 * notes saying what could not be read.
 */

import type { JSX } from "preact";
import { useState } from "preact/hooks";
import { snapshot } from "../state.js";

export function RawView(): JSX.Element {
  return (
    <div class="scroll">
      <div class="json">
        <JsonNode name="snapshot" value={snapshot.value} depth={0} defaultOpen />
      </div>
    </div>
  );
}

interface NodeProps {
  name: string;
  value: unknown;
  depth: number;
  defaultOpen?: boolean;
}

/**
 * Collapsed by default below the first level.
 *
 * A snapshot of a real page is tens of thousands of lines; expanding it all
 * would be slower to render than the rest of the tool combined, and unreadable
 * besides.
 */
function JsonNode({ name, value, depth, defaultOpen }: NodeProps): JSX.Element {
  const [open, setOpen] = useState(!!defaultOpen || depth < 1);

  if (value === null || typeof value !== "object") {
    return (
      <div class="line" style={{ paddingLeft: depth * 12 + "px" }}>
        <span class="k">{name}:</span>
        <Primitive value={value} />
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <>
      <div class="line" style={{ paddingLeft: depth * 12 + "px" }}>
        <span class="toggle" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"}
        </span>
        <span class="k">{name}:</span>
        <span class="count">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </div>
      {open
        ? entries.map(([k, v]) => (
            <JsonNode key={k} name={k} value={v} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

function Primitive({ value }: { value: unknown }): JSX.Element {
  if (typeof value === "string") {
    return <span class="s">"{value}"</span>;
  }
  if (typeof value === "number") {
    return <span class="n">{String(value)}</span>;
  }
  if (typeof value === "boolean" || value === null) {
    return <span class="b">{String(value)}</span>;
  }
  return <span>{String(value)}</span>;
}
