# Kernel Telemetry Design

**Status**: Implemented — `core/kernel/src/kernel-telemetry.ts` (wired in `kernel-core.ts`)
**Epic**: FYM-49 (Kernel Observability & Logging Infrastructure)
**Tickets**: FYM-53, FYM-54

## Overview

A lightweight, flexible runtime data capture system for production observability of the FynMesh kernel. Provides structured telemetry with a pluggable transport layer and non-intrusive background flushing.

## Key Principle: Telemetry vs console.debug

These are **two separate concerns**:

| Concern | Mechanism | Audience | Production behavior |
|---------|-----------|----------|---------------------|
| Dev debugging | `console.debug` | Developer at dev time | **Stripped by bundler** (terser `drop_console`, etc.) |
| Runtime observability | `KernelTelemetry` | Ops, APM, production debugging | **Always present** |

**`console.debug` calls are intentionally left as-is.** They serve development-time debugging and are removed in production builds. KernelTelemetry is a new, separate layer for capturing runtime data that operators and APM tools need in production.

## Architecture

```
capture() → ring buffer (memory) → flush → transport.send()
```

- **Capture**: Synchronous, O(1) — just pushes to an array. Zero overhead at the call site.
- **Ring buffer**: Bounded in-memory buffer. When full, drops oldest entries.
- **Flush**: Drains the buffer and sends a batch to the transport. Trigger strategy is TBD.
- **Transport**: Pluggable backend. Default is console.

## API

### TelemetryEntry

```typescript
interface TelemetryEntry {
  type: "event" | "metric" | "error";
  name: string;
  ts: number;
  data?: Record<string, unknown>;
  value?: number;                              // for metrics
  error?: { message: string; stack?: string }; // serialized, not Error ref
}
```

### KernelTelemetry

```typescript
interface KernelTelemetry {
  capture(entry: Omit<TelemetryEntry, "ts">): void;
  capErr(name: string, data: Record<string, unknown>, error: unknown): void;
  scope(prefix: string): KernelTelemetry;
  flush(): void;
}
```

- `capture()` — records an entry. Timestamp is auto-filled. Fire and forget.
- `capErr(name, data, error)` — convenience wrapper for `type: "error"` entries; serializes the `error` so no `Error` reference is retained.
- `scope(prefix)` — returns a child instance that auto-prepends `prefix.` to all entry names.
- `flush()` — manually drains the buffer to the transport.

A `noOpTelemetry` singleton implementing this interface is provided for tests / telemetry-disabled use.

### TelemetryTransport

```typescript
interface TelemetryTransport {
  send(batch: TelemetryEntry[]): Promise<void>;
}
```

### TelemetryConfig

```typescript
interface TelemetryConfig {
  transport?: TelemetryTransport;  // default: ConsoleTelemetryTransport
  maxBufferSize?: number;          // default: 500
}
```

## Scoped Instances

Each kernel module receives a scoped telemetry instance, providing automatic source tagging without manual boilerplate:

```typescript
// kernel-core creates scoped instances for each module
this.bootstrapCoordinator = new BootstrapCoordinator(
  this.events,
  telemetry.scope("bootstrap")
);

// Inside bootstrap-coordinator — clean, short names
this.telemetry.capture({ type: "event", name: "completed", data: { app: "nav" } });
// → entry.name becomes "bootstrap.completed"
```

The `scope()` implementation is trivial:

```typescript
scope(prefix: string): KernelTelemetry {
  return {
    capture: (entry) => this.capture({ ...entry, name: `${prefix}.${entry.name}` }),
    capErr: (name, data, error) => this.capErr(`${prefix}.${name}`, data, error),
    scope: (sub) => this.scope(`${prefix}.${sub}`),
    flush: () => this.flush(),
  };
}
```

## Buffer Overflow Policy

**Drop oldest.** When the ring buffer reaches `maxBufferSize`, the oldest entries are discarded to make room for new ones. Recent data is more valuable than stale data.

## Default Transport: Console

The default transport writes batched entries to the console, making telemetry visible during development without requiring any backend setup.

## Flush Strategy

The `flush()` method is implemented and available for manual use. The automatic trigger strategy (timer-based, threshold-based, page lifecycle events, etc.) is **TBD** — to be decided based on real-world usage patterns.

## Usage Examples

```typescript
// Lifecycle events
telemetry.capture({ type: "event", name: "fynapp.loaded", data: { app: "nav", version: "1.2.0" } });

// Performance metrics
telemetry.capture({ type: "metric", name: "bootstrap.duration", value: 185 });

// Errors (serialize the Error, don't hold a reference)
telemetry.capture({
  type: "error",
  name: "fynapp.load_failed",
  data: { app: "nav" },
  error: { message: err.message, stack: err.stack },
});
```

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Buffer overflow | Drop oldest | Recent data is more operationally valuable |
| Default transport | Console | Visible out of the box, no setup needed |
| Scoping | `scope()` child instances | Enforced consistency, clean call sites |
| console.debug | Untouched | Stripped by bundler in prod — separate concern |
| localStorage persistence | Not now | Pluggable transport covers this later if needed |
| Flush trigger | TBD | Implement mechanism, decide trigger strategy later |

## Non-Goals

- Replacing `console.debug` calls (they serve a different purpose)
- localStorage or persistent buffering (can be added as a transport later)
- APM-specific integrations (DataDog, New Relic — see FYM-45, future transport implementations)
