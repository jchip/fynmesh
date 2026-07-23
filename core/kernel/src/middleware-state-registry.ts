import { ObservableState } from "./observable-state";

/**
 * Registry for middleware shared state with hierarchical scoping.
 * Supports late-join discovery and reactive updates.
 */
export class MiddlewareStateRegistry {
  private parent?: MiddlewareStateRegistry;
  private states: Map<string, ObservableState<any>> = new Map();
  private pendingWaiters: Map<string, Array<{ resolve: (state: ObservableState<any>) => void; reject: (err: Error) => void }>> = new Map();

  constructor(parent?: MiddlewareStateRegistry) {
    this.parent = parent;
  }

  /**
   * Provide/register state in this scope.
   * @param key Unique key for this state
   * @param initial Initial value
   * @returns ObservableState for updates
   */
  provide<T>(key: string, initial: T): ObservableState<T> {
    if (this.states.has(key)) {
      // Return existing state if already provided
      return this.states.get(key) as ObservableState<T>;
    }

    const state = new ObservableState(initial);
    this.states.set(key, state);

    // Notify any waiters
    const waiters = this.pendingWaiters.get(key);
    if (waiters) {
      waiters.forEach(({ resolve }) => resolve(state));
      this.pendingWaiters.delete(key);
    }

    return state;
  }

  /**
   * Lookup state by key. Walks up hierarchy if not found locally.
   * @param key State key to find
   * @returns ObservableState or undefined if not found
   */
  lookup<T>(key: string): ObservableState<T> | undefined {
    // Check local scope first
    if (this.states.has(key)) {
      return this.states.get(key) as ObservableState<T>;
    }
    // Walk up hierarchy
    return this.parent?.lookup<T>(key);
  }

  /**
   * Check if state exists in this scope or parent scopes.
   */
  has(key: string): boolean {
    if (this.states.has(key)) return true;
    return this.parent?.has(key) ?? false;
  }

  /**
   * Async wait for state to be provided.
   * @param key State key to wait for
   * @param timeout Timeout in ms (default 30000)
   * @returns Promise resolving to ObservableState
   */
  waitFor<T>(key: string, timeout = 30000): Promise<ObservableState<T>> {
    // Check if already exists
    const existing = this.lookup<T>(key);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from waiters
        const waiters = this.pendingWaiters.get(key);
        if (waiters) {
          const idx = waiters.findIndex(w => w.resolve === resolve);
          if (idx >= 0) waiters.splice(idx, 1);
          if (waiters.length === 0) this.pendingWaiters.delete(key);
        }
        reject(new Error(`Timeout waiting for state: ${key}`));
      }, timeout);

      const waiter = {
        resolve: (state: ObservableState<any>) => {
          clearTimeout(timer);
          resolve(state as ObservableState<T>);
        },
        reject
      };

      if (!this.pendingWaiters.has(key)) {
        this.pendingWaiters.set(key, []);
      }
      this.pendingWaiters.get(key)!.push(waiter);
    });
  }

  /**
   * Remove state from this scope.
   * @param key State key to remove
   * @returns true if removed, false if not found
   */
  remove(key: string): boolean {
    const state = this.states.get(key);
    if (state) {
      state.dispose();
      this.states.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Clear all state in this scope.
   */
  clear(): void {
    this.states.forEach(state => state.dispose());
    this.states.clear();
    // Reject any pending waiters
    this.pendingWaiters.forEach((waiters, key) => {
      waiters.forEach(({ reject }) => reject(new Error(`Registry cleared while waiting for: ${key}`)));
    });
    this.pendingWaiters.clear();
  }

  /**
   * Create a child scope that inherits from this registry.
   */
  createScope(): MiddlewareStateRegistry {
    return new MiddlewareStateRegistry(this);
  }

  /**
   * Get all keys in this scope (not including parent).
   */
  keys(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Get parent registry if exists.
   */
  getParent(): MiddlewareStateRegistry | undefined {
    return this.parent;
  }
}
