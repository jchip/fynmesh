/**
 * Observable state container with subscription support.
 * Enables reactive state sharing between middleware providers and consumers.
 */
export class ObservableState<T> {
  private value: T;
  private observers: Set<(value: T, prev?: T) => void> = new Set();
  private disposed = false;

  constructor(initial: T) {
    this.value = initial;
  }

  /** Get current value */
  get(): T {
    if (this.disposed) {
      throw new Error("Cannot get value from disposed ObservableState");
    }
    return this.value;
  }

  /** Set new value and notify observers */
  set(value: T): void {
    if (this.disposed) return;
    const prev = this.value;
    this.value = value;
    this.notify(prev);
  }

  /** Functional update */
  update(fn: (value: T) => T): void {
    this.set(fn(this.value));
  }

  /** Subscribe to changes. Callback is called immediately with current value. Returns unsubscribe function. */
  subscribe(fn: (value: T, prev?: T) => void): () => void {
    if (this.disposed) {
      throw new Error("Cannot subscribe to disposed ObservableState");
    }
    fn(this.value, undefined); // Immediate call with current value
    this.observers.add(fn);
    return () => this.observers.delete(fn);
  }

  /** Check if state is disposed */
  isDisposed(): boolean {
    return this.disposed;
  }

  /** Dispose state and clear all observers */
  dispose(): void {
    this.disposed = true;
    this.observers.clear();
  }

  private notify(prev: T): void {
    this.observers.forEach(fn => {
      try {
        fn(this.value, prev);
      } catch (e) {
        console.error("ObservableState observer error:", e);
      }
    });
  }
}
