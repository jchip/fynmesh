/**
 * FynApp Lifecycle Module
 *
 * Tracks the kernel-side lifecycle state of each mounted FynApp (mount tracking).
 * State is keyed by `name@version` so multiple versions of the same FynApp are
 * tracked independently. This is the foundation for per-FynApp error boundaries
 * (recording a `failed` state) and suspend/resume.
 */

import type { FynAppState, FynAppStatus } from "../types";

export interface FynAppLifecycle {
  /**
   * Upsert the lifecycle state for a FynApp. `error` is only retained for the
   * `failed` status; `mountedAt` is stamped when transitioning to `mounted` and
   * preserved otherwise.
   */
  set(name: string, version: string, status: FynAppStatus, error?: unknown): FynAppState;
  /** Get the exact state for a `name@version`. */
  get(name: string, version: string): FynAppState | undefined;
  /**
   * Resolve state by `name@version` or by bare `name`. When only a name is
   * given and several versions are tracked, the most recently updated wins.
   */
  find(nameOrKey: string): FynAppState | undefined;
  /** All tracked states (currently mounted, suspended, bootstrapping, or failed). */
  list(): FynAppState[];
  /** Stop tracking a FynApp (called when it is shut down / unmounted). */
  remove(name: string, version: string): void;
}

export const FynAppLifecycle = function (): FynAppLifecycle {
  const states = new Map<string, FynAppState>();
  const key = (name: string, version: string) => `${name}@${version}`;

  return {
    set(name, version, status, error) {
      const k = key(name, version);
      const now = Date.now();
      const state: FynAppState = {
        name,
        version,
        status,
        error: status === "failed" ? error : undefined,
        updatedAt: now,
        mountedAt: status === "mounted" ? now : states.get(k)?.mountedAt,
      };
      states.set(k, state);
      return state;
    },

    get: (name, version) => states.get(key(name, version)),

    find(nameOrKey) {
      const direct = states.get(nameOrKey);
      if (direct) return direct;
      let match: FynAppState | undefined;
      for (const state of states.values()) {
        if (state.name === nameOrKey && (!match || state.updatedAt >= match.updatedAt)) {
          match = state;
        }
      }
      return match;
    },

    list: () => [...states.values()],

    remove(name, version) {
      states.delete(key(name, version));
    },
  };
} as unknown as new () => FynAppLifecycle;
