/**
 * How the UI gets snapshots.
 *
 * The UI depends on this interface and never on a loader, which is the whole
 * reason a devtools extension is a packaging exercise rather than a rewrite:
 * `LiveAdapter` reads the page it is running in, `RemoteAdapter` reads a page
 * across a message port, and the views cannot tell the difference.
 */

import type { Snapshot } from "../core/model.js";

export interface Adapter {
  /** a human label for the source, shown in the header */
  readonly label: string;
  /** the most recent snapshot, collecting one if there is none */
  current(): Promise<Snapshot>;
  /** force a fresh collect */
  refresh(): Promise<Snapshot>;
  /**
   * Subscribe to snapshots. Returns an unsubscribe function.
   *
   * The adapter decides its own cadence: `LiveAdapter` polls behind a cheap
   * fingerprint check, `RemoteAdapter` is pushed to by the page agent.
   */
  subscribe(fn: (snapshot: Snapshot) => void): () => void;
  /** true while the adapter is producing updates */
  isLive(): boolean;
  setLive(live: boolean): void;
  dispose(): void;
}

/** The minimum a transport must provide for the remote adapter. */
export interface Transport {
  post(message: unknown): void;
  on(handler: (message: unknown) => void): () => void;
}

export type RemoteMessage =
  | { type: "fed-inspector/hello" }
  | { type: "fed-inspector/collect" }
  | { type: "fed-inspector/live"; live: boolean }
  | { type: "fed-inspector/snapshot"; snapshot: Snapshot }
  | { type: "fed-inspector/error"; message: string };
