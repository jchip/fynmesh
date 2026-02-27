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
  private buffer: TelemetryEntry[] = [];
  private transport: TelemetryTransport;
  private maxBufferSize: number;

  constructor(config?: TelemetryConfig) {
    this.transport = config?.transport ?? new ConsoleTelemetryTransport();
    this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }

  capture(entry: Omit<TelemetryEntry, "ts">): void {
    const full: TelemetryEntry = { ...entry, ts: Date.now() };

    if (this.buffer.length >= this.maxBufferSize) {
      // Drop oldest — shift is O(n) but acceptable for the buffer sizes we use
      this.buffer.shift();
    }

    this.buffer.push(full);
  }

  captureError(name: string, data: Record<string, unknown>, error: unknown): void {
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
      captureError: (name, data, error) => this.captureError(`${prefix}.${name}`, data, error),
      scope: (sub) => this.scope(`${prefix}.${sub}`),
      flush: () => this.flush(),
    };
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0);
    this.transport.send(batch);
  }

  /** Expose buffer length for testing */
  get bufferSize(): number {
    return this.buffer.length;
  }
}

/**
 * No-op telemetry instance for when telemetry is not configured.
 * All methods are silent no-ops.
 */
export const noOpTelemetry: KernelTelemetry = {
  capture() {},
  captureError() {},
  scope() { return noOpTelemetry; },
  flush() {},
};
