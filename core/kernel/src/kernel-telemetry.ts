/**
 * Kernel Telemetry Implementation
 * Ring-buffer backed telemetry with pluggable transports and scoping
 */

import type {
  TelemetryEntry,
  KernelTelemetry,
  TelemetryTransport,
  TelemetryConfig,
} from "./types";

const DEFAULT_MAX_BUFFER_SIZE = 500;

/**
 * Console transport — writes batched entries to console.log
 */
export class ConsoleTelemetryTransport implements TelemetryTransport {
  async send(batch: TelemetryEntry[]): Promise<void> {
    console.log("[telemetry]", batch);
  }
}

/**
 * Default KernelTelemetry implementation with a bounded ring buffer.
 * When the buffer reaches maxBufferSize, oldest entries are dropped.
 */
export class KernelTelemetryImpl implements KernelTelemetry {
  #buffer: TelemetryEntry[] = [];
  private transport: TelemetryTransport;
  private maxBufferSize: number;

  constructor(config?: TelemetryConfig) {
    this.transport = config?.transport ?? new ConsoleTelemetryTransport();
    this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  capture(entry: Omit<TelemetryEntry, "ts">): void {
    const full: TelemetryEntry = { ...entry, ts: Date.now() };

    if (this.#buffer.length >= this.maxBufferSize) {
      // Drop oldest — shift is O(n) but acceptable for the buffer sizes we use
      this.#buffer.shift();
    }

    this.#buffer.push(full);
  }

  capErr(name: string, data: Record<string, unknown>, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.capture({
      type: "error",
      name,
      data,
      error: { message: err.message, stack: err.stack },
    });
  }

  scope(prefix: string): KernelTelemetry {
    return {
      capture: (entry) => this.capture({ ...entry, name: `${prefix}.${entry.name}` }),
      capErr: (name, data, error) => this.capErr(`${prefix}.${name}`, data, error),
      scope: (sub) => this.scope(`${prefix}.${sub}`),
      flush: () => this.flush(),
    };
  }

  /** Buffer length; the ring-buffer tests assert on it. */
  get bufferSize(): number {
    return this.#buffer.length;
  }

  flush(): void {
    if (this.#buffer.length === 0) return;

    const batch = this.#buffer.splice(0);
    // Fire-and-forget. Call send() synchronously (callers and tests rely on the
    // timing), but never leak: a synchronous throw is caught here and an async
    // rejection by .catch.
    const failed = (err: unknown) => console.error("[telemetry] transport.send failed:", err);
    try {
      void Promise.resolve(this.transport.send(batch)).catch(failed);
    } catch (err) {
      failed(err);
    }
  }
}

/**
 * Record an event. Equivalent to `t.capture({ type: "event", name, data })`.
 *
 * A module-scope function rather than a method or an inline literal, for size:
 * the kernel records events at ~30 call sites, and each inline
 * `{ type: "event", name: …, data: … }` repeats the whole object shape in the
 * bundle. Terser mangles a module-scope function's name to one character; a
 * class method's name is a property and can never be mangled.
 */
export function captureEvent(
  tel: KernelTelemetry,
  name: string,
  data?: Record<string, unknown>,
): void {
  tel.capture({ type: "event", name, data });
}

/**
 * No-op telemetry instance for when telemetry is not configured.
 * All methods are silent no-ops.
 */
export const noOpTelemetry: KernelTelemetry = {
  capture() {},
  capErr() {},
  scope() { return noOpTelemetry; },
  flush() {},
};
