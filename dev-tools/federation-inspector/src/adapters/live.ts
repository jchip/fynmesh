/**
 * Same-realm adapter: reads the loader in this page.
 *
 * Polls rather than hooks. Hooking `System.instantiate` would give exact
 * change notifications, but installing a hook mutates the loader under
 * inspection, and the tool's first promise is that opening it does not change
 * what the page does. `attach()` in `instrument.ts` is the opt-in that trades
 * that away for a timeline.
 *
 * The poll is affordable because `fingerprint()` is O(registry keys) with no
 * allocation per module, and the full collect only runs when it changes.
 */

import type { Snapshot } from "../core/model.js";
import { collect, fingerprint, type CollectOptions } from "../core/collect.js";
import { analyse } from "../analysis/index.js";
import type { Adapter } from "./types.js";

export interface LiveAdapterOptions extends CollectOptions {
  /** poll interval in ms; false disables polling entirely */
  pollMs?: number | false;
}

export class LiveAdapter implements Adapter {
  readonly label: string;

  private opts: LiveAdapterOptions;
  private snapshot?: Snapshot;
  private listeners = new Set<(s: Snapshot) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private lastPrint = "";
  private live = true;

  constructor(opts: LiveAdapterOptions = {}) {
    this.opts = opts;
    this.label =
      (globalThis as any).location?.host ?? "this page";
  }

  private take(): Snapshot {
    const snap = collect(this.opts);
    analyse(snap);
    this.snapshot = snap;
    this.lastPrint = fingerprint(this.opts);
    return snap;
  }

  async current(): Promise<Snapshot> {
    return this.snapshot ?? this.take();
  }

  async refresh(): Promise<Snapshot> {
    const snap = this.take();
    this.emit(snap);
    return snap;
  }

  private emit(snap: Snapshot): void {
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (err) {
        // a throwing listener must not stop the others, and must not take the
        // poll timer down with it
        console.error("[federation-inspector] snapshot listener failed", err);
      }
    }
  }

  private tick = (): void => {
    if (!this.live) {
      return;
    }
    const print = fingerprint(this.opts);
    if (print === this.lastPrint) {
      return;
    }
    this.emit(this.take());
  };

  private start(): void {
    const interval = this.opts.pollMs;
    if (this.timer || interval === false || interval === 0) {
      return;
    }
    this.timer = setInterval(this.tick, interval ?? 500);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.listeners.add(fn);
    this.start();
    return () => {
      this.listeners.delete(fn);
      if (!this.listeners.size) {
        this.stop();
      }
    };
  }

  isLive(): boolean {
    return this.live;
  }

  setLive(live: boolean): void {
    this.live = live;
    if (live) {
      this.start();
      this.tick();
    } else {
      this.stop();
    }
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.snapshot = undefined;
  }
}
