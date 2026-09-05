/**
 * Cross-realm adapter, and the page-side agent that feeds it.
 *
 * This is the whole extension story. A content script runs `serveRemote` in
 * the page; a devtools panel runs `RemoteAdapter` over the other end of the
 * same transport and hands it to the ordinary UI. Only `Snapshot` crosses,
 * and `Snapshot` is plain JSON by construction -- see the note at the top of
 * `core/model.ts`, which is the reason that constraint exists.
 *
 * The transport is deliberately not specified further than post/on: a
 * `MessagePort`, `window.postMessage`, `chrome.runtime` messaging and a plain
 * function pair all satisfy it.
 */

import type { Snapshot } from "../core/model.js";
import { collect, fingerprint, type CollectOptions } from "../core/collect.js";
import { analyse } from "../analysis/index.js";
import type { Adapter, RemoteMessage, Transport } from "./types.js";

export class RemoteAdapter implements Adapter {
  readonly label: string;

  private transport: Transport;
  private snapshot?: Snapshot;
  private listeners = new Set<(s: Snapshot) => void>();
  private pending: Array<(s: Snapshot) => void> = [];
  private off: () => void;
  private live = true;

  constructor(transport: Transport, label = "remote page") {
    this.transport = transport;
    this.label = label;
    this.off = transport.on((raw) => this.receive(raw));
    this.transport.post({ type: "fed-inspector/hello" } satisfies RemoteMessage);
  }

  private receive(raw: unknown): void {
    const msg = raw as RemoteMessage;
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      return;
    }
    if (msg.type === "fed-inspector/snapshot") {
      // The panel analyses on its own side rather than trusting the page to:
      // the derived fields are pure functions of the snapshot, and computing
      // them here keeps the page agent small and keeps the two ends from
      // having to agree on an analysis version.
      const snap = msg.snapshot;
      analyse(snap);
      this.snapshot = snap;
      const waiting = this.pending;
      this.pending = [];
      for (const resolve of waiting) {
        resolve(snap);
      }
      for (const fn of this.listeners) {
        try {
          fn(snap);
        } catch (err) {
          console.error("[federation-inspector] snapshot listener failed", err);
        }
      }
    } else if (msg.type === "fed-inspector/error") {
      console.error("[federation-inspector] page agent:", msg.message);
    }
  }

  private request(): Promise<Snapshot> {
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.transport.post({ type: "fed-inspector/collect" } satisfies RemoteMessage);
    });
  }

  async current(): Promise<Snapshot> {
    return this.snapshot ?? this.request();
  }

  refresh(): Promise<Snapshot> {
    return this.request();
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isLive(): boolean {
    return this.live;
  }

  setLive(live: boolean): void {
    this.live = live;
    this.transport.post({ type: "fed-inspector/live", live } satisfies RemoteMessage);
  }

  dispose(): void {
    this.off();
    this.listeners.clear();
    this.pending = [];
  }
}

export interface ServeOptions extends CollectOptions {
  /** how often to check for change and push, ms; false to only answer requests */
  pollMs?: number | false;
}

/**
 * Run the page side of the bridge.
 *
 * Collects but does not analyse -- the panel does that, so this half stays
 * small enough to sit in a content script without carrying the analysis code.
 */
export function serveRemote(transport: Transport, opts: ServeOptions = {}): () => void {
  let live = true;
  let lastPrint = "";

  const send = () => {
    try {
      const snapshot = collect(opts);
      lastPrint = fingerprint(opts);
      transport.post({ type: "fed-inspector/snapshot", snapshot } satisfies RemoteMessage);
    } catch (err) {
      transport.post({
        type: "fed-inspector/error",
        message: err instanceof Error ? err.message : String(err),
      } satisfies RemoteMessage);
    }
  };

  const off = transport.on((raw) => {
    const msg = raw as RemoteMessage;
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      return;
    }
    if (msg.type === "fed-inspector/collect" || msg.type === "fed-inspector/hello") {
      send();
    } else if (msg.type === "fed-inspector/live") {
      live = msg.live;
    }
  });

  const interval = opts.pollMs;
  const timer =
    interval === false || interval === 0
      ? undefined
      : setInterval(() => {
          if (!live) {
            return;
          }
          const print = fingerprint(opts);
          if (print !== lastPrint) {
            send();
          }
        }, interval ?? 500);

  return () => {
    off();
    if (timer) {
      clearInterval(timer);
    }
  };
}

/** A transport over `window.postMessage`, for a content-script bridge. */
export function windowTransport(
  target: Window,
  source: Window,
  channel = "fed-inspector"
): Transport {
  return {
    post(message) {
      target.postMessage({ __channel: channel, payload: message }, "*");
    },
    on(handler) {
      const listener = (event: MessageEvent) => {
        const data = event.data;
        if (data && typeof data === "object" && data.__channel === channel) {
          handler(data.payload);
        }
      };
      source.addEventListener("message", listener as EventListener);
      return () => source.removeEventListener("message", listener as EventListener);
    },
  };
}
