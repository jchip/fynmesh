/**
 * FynApp Lifecycle Module
 *
 * Tracks the kernel-side lifecycle state of each mounted FynApp (mount tracking).
 * State is keyed by `name@version` so multiple versions of the same FynApp are
 * tracked independently. This is the foundation for per-FynApp error boundaries
 * (recording a `failed` state) and suspend/resume.
 */

import type { FynAppState, FynAppStatus } from "../types";

export class FynAppLifecycle {
  private states = new Map<string, FynAppState>();

  private key(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /**
   * Upsert the lifecycle state for a FynApp. `error` is only retained for the
   * `failed` status; `mountedAt` is stamped when transitioning to `mounted` and
   * preserved otherwise.
   */
  set(name: string, version: string, status: FynAppStatus, error?: unknown): FynAppState {
    const key = this.key(name, version);
    const prev = this.states.get(key);
    const now = Date.now();
    const state: FynAppState = {
      name,
      version,
      status,
      error: status === "failed" ? error : undefined,
      updatedAt: now,
      mountedAt: status === "mounted" ? now : prev?.mountedAt,
    };
    this.states.set(key, state);
    return state;
  }

  /** Get the exact state for a `name@version`. */
  get(name: string, version: string): FynAppState | undefined {
    return this.states.get(this.key(name, version));
  }

  /**
   * Resolve state by `name@version` or by bare `name`. When only a name is
   * given and several versions are tracked, the most recently updated wins.
   */
  find(nameOrKey: string): FynAppState | undefined {
    const direct = this.states.get(nameOrKey);
    if (direct) return direct;
    let match: FynAppState | undefined;
    for (const state of this.states.values()) {
      if (state.name === nameOrKey && (!match || state.updatedAt >= match.updatedAt)) {
        match = state;
      }
    }
    return match;
  }

  /** All tracked states (currently mounted, suspended, bootstrapping, or failed). */
  list(): FynAppState[] {
    return [...this.states.values()];
  }

  /** Stop tracking a FynApp (called when it is shut down / unmounted). */
  remove(name: string, version: string): void {
    this.states.delete(this.key(name, version));
  }
}
