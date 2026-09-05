/**
 * Display formatting.
 *
 * The recurring problem in this UI is that module ids are long, structurally
 * repetitive and differ at both ends -- `https://host/demo/fynapp-1/dist/App-BvOD4S9o.js`
 * against a dozen siblings. Truncating the tail loses the filename, which is
 * the part a reader is scanning for; truncating the head loses the container.
 * So most of what is here is about keeping both ends and losing the middle.
 */

/** Keep both ends, drop the middle: `https://host/…/App-BvOD4S9o.js`. */
export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const keepEnd = Math.max(12, Math.floor(max * 0.55));
  const keepStart = max - keepEnd - 1;
  return text.slice(0, Math.max(0, keepStart)) + "…" + text.slice(-keepEnd);
}

/** The filename, plus one parent directory for context. */
export function urlTail(url: string | undefined, segments = 2): string {
  if (!url) {
    return "";
  }
  const clean = url.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts.slice(-segments).join("/");
}

/** Origin and path split, so a row can dim the origin and keep the path. */
export function splitUrl(url: string | undefined): { origin: string; path: string } {
  if (!url) {
    return { origin: "", path: "" };
  }
  const m = /^([a-z]+:\/\/[^/]+)(\/.*)?$/i.exec(url);
  return m ? { origin: m[1], path: m[2] ?? "/" } : { origin: "", path: url };
}

/**
 * A module id split into the part that identifies it and the part that
 * repeats across its siblings, so the row can weight them differently.
 */
export function splitId(id: string): { lead: string; tail: string } {
  const slash = id.lastIndexOf("/");
  if (slash > 0) {
    return { lead: id.slice(0, slash + 1), tail: id.slice(slash + 1) };
  }
  // `__mf_entry_fynapp-1_fynapp-entry.js` -- the container name is the lead
  const mf = /^(__mf_(?:container|entry)_)(.*)$/.exec(id);
  if (mf) {
    return { lead: mf[1], tail: mf[2] };
  }
  return { lead: "", tail: id };
}

/**
 * Strip a rollup content hash so sibling builds of one module read alike.
 *
 * `App-BvOD4S9o.js` -> `App.js`. Only used for display next to the real name,
 * never as an identity: two chunks can share a stem.
 */
export function dehash(name: string): string {
  return name.replace(/-[A-Za-z0-9_-]{8}(\.[a-z]+)$/, "$1");
}

export function plural(n: number, one: string, many = one + "s"): string {
  return n + " " + (n === 1 ? one : many);
}

export function ago(timestamp: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - timestamp) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  return Math.round(m / 60) + "h ago";
}

export function ms(value: number): string {
  return value < 1 ? value.toFixed(2) + "ms" : Math.round(value) + "ms";
}

/** Compact list rendering: "a, b, c" or "a, b +3". */
export function summarise(items: string[], max = 3): string {
  if (items.length <= max) {
    return items.join(", ");
  }
  return items.slice(0, max).join(", ") + " +" + (items.length - max);
}

/**
 * A stable colour per container name.
 *
 * Hash to a hue so a container keeps the same tint across refreshes and views
 * -- the eye uses it to group rows, so it has to be deterministic. Saturation
 * and lightness stay fixed and modest so a dozen of them coexist without the
 * table turning into a paint chart.
 */
export function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
