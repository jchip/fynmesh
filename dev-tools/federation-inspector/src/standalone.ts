/**
 * federation-inspector — standalone entry.
 *
 * The drop-in bundle. One script tag next to systemjs and federation-js, and a
 * badge appears in a page corner:
 *
 *   <script src="/federation-inspector.js"></script>
 *
 * Configuration comes off the script tag, so no second file and no inline
 * script are needed for the common cases:
 *
 *   data-auto="false"      do not mount; call FederationInspector.mount()
 *   data-corner="top-left" launcher corner
 *   data-theme="dark"      auto | light | dark
 *   data-hotkey="ctrl+i"   or "false" for none
 *   data-open="true"       open the panel immediately
 *   data-poll="1000"       live-refresh interval in ms, or "false"
 *   data-launcher="false"  no badge; open with the hotkey or the API
 *
 * Mounting waits for `document.body`. A script in `<head>` runs before the
 * body exists, and that is the position you want for a tool that should see
 * modules arriving from the very first registration.
 */

import { mount, type InspectorHandle, type MountOptions } from "./ui/mount.jsx";
import { collect, fingerprint } from "./core/collect.js";
import { analyse } from "./analysis/index.js";
import { LiveAdapter } from "./adapters/live.js";
import { RemoteAdapter, serveRemote, windowTransport } from "./adapters/remote.js";

/** What the bundle installs on the global. */
export interface FederationInspectorGlobal {
  mount(opts?: MountOptions): InspectorHandle;
  collect: typeof collect;
  analyse: typeof analyse;
  fingerprint: typeof fingerprint;
  LiveAdapter: typeof LiveAdapter;
  RemoteAdapter: typeof RemoteAdapter;
  serveRemote: typeof serveRemote;
  windowTransport: typeof windowTransport;
  /** the handle from the automatic mount, when there was one */
  instance?: InspectorHandle;
  version: string;
}

declare const __INSPECTOR_VERSION__: string | undefined;

function readOptions(): MountOptions & { auto: boolean } {
  // `document.currentScript` is correct while this bundle is executing, which
  // is exactly now; it is null for a module or async script, so fall back to
  // finding our own tag by filename.
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    (document.querySelector(
      'script[src*="federation-inspector"]'
    ) as HTMLScriptElement | null);

  const d = script?.dataset ?? {};
  const bool = (v: string | undefined, fallback: boolean) =>
    v === undefined ? fallback : v !== "false" && v !== "0";

  const pollRaw = d.poll;
  const pollMs =
    pollRaw === undefined
      ? undefined
      : pollRaw === "false"
        ? (false as const)
        : Number(pollRaw) || undefined;

  return {
    auto: bool(d.auto, true),
    corner: (d.corner as MountOptions["corner"]) ?? "bottom-right",
    /*
     * Left undefined when the attribute is absent, rather than defaulted here.
     *
     * `mount` treats a supplied theme as an explicit instruction and assigns it
     * over the signal -- which is restored from localStorage. Defaulting to
     * "auto" in this function therefore clobbered the remembered theme on every
     * load: the value was written, survived the reload, and was then
     * overwritten before anything could read it.
     */
    theme: d.theme as MountOptions["theme"] | undefined,
    density: d.density as MountOptions["density"] | undefined,
    hotkey: d.hotkey === "false" ? false : (d.hotkey ?? "ctrl+shift+m"),
    open: bool(d.open, false),
    launcher: bool(d.launcher, true),
    pollMs,
  };
}

function whenBody(fn: () => void): void {
  if (document.body) {
    fn();
    return;
  }
  document.addEventListener("DOMContentLoaded", fn, { once: true });
}

const api: FederationInspectorGlobal = {
  mount,
  collect,
  analyse,
  fingerprint,
  LiveAdapter,
  RemoteAdapter,
  serveRemote,
  windowTransport,
  version: typeof __INSPECTOR_VERSION__ === "string" ? __INSPECTOR_VERSION__ : "0.1.0",
};

const g = globalThis as any;

/*
 * A page can end up with this script twice -- a build that includes it and a
 * tag that also loads it, which is exactly what the fynmesh demo does. A
 * second inspector would mean a second badge and a second poll, so the first
 * one wins and says so.
 *
 * `exported` is what the bundle hands back, and the IIFE wrapper assigns that
 * to `globalThis.FederationInspector`. On the duplicate path it therefore has
 * to be the copy that is already mounted: returning this copy's own `api`
 * replaced the live one with a detached object, whose `instance` is never
 * assigned because this copy never mounts -- so `FederationInspector.instance`
 * became undefined for everyone, and the advice in the warning below was
 * invalidated by the very assignment that followed it.
 */
let exported = api;

if (g.FederationInspector) {
  console.warn(
    "[federation-inspector] already loaded; ignoring this copy. " +
      "Use the existing globalThis.FederationInspector."
  );
  exported = g.FederationInspector;
} else {
  g.FederationInspector = api;

  if (typeof document !== "undefined") {
    const opts = readOptions();
    if (opts.auto) {
      whenBody(() => {
        api.instance = mount(opts);
      });
    }
  }
}

export default exported;
