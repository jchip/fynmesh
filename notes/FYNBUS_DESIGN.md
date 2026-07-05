# FynBus Design (FYM-13)

Status: **draft — pending review** · Epic: FYM-2 · Implements: FYM-14 (pub/sub), FYM-15 (request/response), FYM-18 (demo)

## Context

FynApps today never talk to each other directly. All cross-app interaction is
**middleware-mediated state sharing**: a middleware `provide()`s an object into the
`MiddlewareStateRegistry`, drops it into each app's `middlewareContext`, and apps
mutate/observe that shared object (see `SHARED_STATE_ARCHITECTURE.md`). That works
well for *state*, but there is no sanctioned primitive for *messages*:

- No way for app A to tell app B "the user clicked checkout" without a middleware
  author plumbing a private `EventTarget` through the registry (what the
  basic-counter demo does).
- No request/response at all — everything is fire-and-forget or shared mutation.
- Ad-hoc echo suppression via `source` app-name string comparison in every consumer.
- `kernel.events` exists but is the kernel's *internal lifecycle bus*
  (`FYNAPP_BOOTSTRAPPED`, `MIDDLEWARE_READY`, …), not an app-facing channel.

FynBus is the sanctioned messaging API. The roadmap sketch
(`FRAMEWORK_ROADMAP.md` § FynBus) left three open questions; this doc answers them.

## Goals

1. Pub/sub messaging between FynApps: `emit` / `on` / `once` (FYM-14).
2. Request/response (RPC-like): `request` / `handle` (FYM-15).
3. Zero new dependencies; built on the kernel's existing `FynEventTarget`.
4. Subscriptions are cleaned up automatically when a FynApp shuts down.
5. Sender identity is stamped by the platform, not self-reported by callers.

## Non-goals

- **Not a state store.** Late joiners do not see past messages. Anything a late
  joiner must observe belongs in `MiddlewareStateRegistry` + `ObservableState`.
  This keeps the line drawn in `SHARED_STATE_ARCHITECTURE.md`: registry = state,
  bus = ephemeral messages/commands.
- No event replay / sticky events in v1 (revisit only with a concrete use case).
- No cross-tab / cross-frame / network transport — in-page, same-realm only.
- No typed event contracts yet — that is FYM-17 (parked); v1 leaves the door open.
- No migration of existing mechanisms (basic-counter, react-context,
  design-tokens middleware). They keep working unchanged; any migration is a
  separate decision.

## Positioning vs existing mechanisms

| Mechanism                  | Kind                  | Late join | Direction        | Use for                          |
| -------------------------- | --------------------- | --------- | ---------------- | -------------------------------- |
| `MiddlewareStateRegistry`  | shared observable state | yes (current value) | n-way   | data late joiners must see       |
| `middlewareContext`        | per-app API drop      | n/a       | middleware → app | exposing middleware APIs         |
| `kernel.events`            | lifecycle events      | no        | kernel → apps    | kernel lifecycle only (unchanged) |
| **FynBus (new)**           | messages + RPC        | no (by design) | app ↔ app   | commands, notifications, queries |

## API

```typescript
type Unsubscribe = () => void;

interface FynBusMeta {
  topic: string;
  source: string;        // sender FynApp name, or "kernel"
  channel: string;       // channel name, "" for the root bus
}

type BusHandler<T = unknown> = (payload: T, meta: FynBusMeta) => void;

interface SubscribeOptions {
  self?: boolean;        // receive own emits; default false
  signal?: AbortSignal;  // alternative unsubscribe, mirrors EventTarget
}

interface RequestOptions {
  timeout?: number;      // ms; default 10_000
}

interface FynBus {
  // pub/sub (FYM-14)
  emit<T = unknown>(topic: string, payload?: T): void;
  on<T = unknown>(topic: string, handler: BusHandler<T>, options?: SubscribeOptions): Unsubscribe;
  once<T = unknown>(topic: string, handler: BusHandler<T>, options?: SubscribeOptions): Unsubscribe;

  // request/response (FYM-15)
  request<TRes = unknown, TReq = unknown>(topic: string, payload?: TReq, options?: RequestOptions): Promise<TRes>;
  handle<TReq = unknown, TRes = unknown>(
    topic: string,
    handler: (payload: TReq, meta: FynBusMeta) => TRes | Promise<TRes>
  ): Unsubscribe;

  // scoping (flat, one level; foundation for FYM-16)
  channel(name: string): FynBus;
}
```

### How FynApps get it

- `kernel.bus: FynBus` — the root bus on the public kernel interface.
- `runtime.bus: FynBus` — a **per-app facade** handed to each FynApp (alongside
  `runtime.middlewareContext`). Same interface, plus platform behavior:
  - stamps `meta.source` with the app's name — callers cannot forge or forget it;
  - tracks every subscription/handler the app registers and removes them all on
    `FYNAPP_SHUTDOWN` (ties into FYM-1 lifecycle work);
  - filters out the app's own emits unless `{ self: true }` — this replaces the
    hand-rolled `detail.source !== appName` checks in today's demos.

Code that only has the kernel handle (middleware, host page) uses `kernel.bus`
directly; `meta.source` is then `"kernel"`.

## Semantics

### Pub/sub

- `emit` delivers **synchronously** to current subscribers (inherited from
  `EventTarget.dispatchEvent`) and returns `void`. Emitting with zero subscribers
  is not an error.
- Handler errors are isolated: one throwing handler neither stops delivery to the
  others nor throws from `emit` (native `EventTarget` behavior).
- No delivery to subscribers added *during* an emit of that same emit (native
  `EventTarget` behavior); they receive subsequent emits.
- `on`/`once` return an `Unsubscribe`; `options.signal` abort also unsubscribes.

### Request/response

- **Exactly one handler per topic per channel.** A second `handle()` on the same
  topic throws immediately (fail fast — silent replacement or broadcast-RPC are
  both foot-guns). The returned `Unsubscribe` frees the topic.
- `request()` **waits for a handler to appear** up to `timeout` (default 10 s),
  then rejects with a timeout error naming the topic. Rationale: FynApps load
  independently and late loading is normal in FynMesh — the registry's
  `waitFor()` established this pattern. Rejecting instantly on "no handler yet"
  would make every caller re-implement retry.
- Handler return values (sync or Promise) resolve the request; a throwing/rejecting
  handler rejects the request with that error.
- RPC does **not** ride on `EventTarget` — listeners can't return values and
  multi-listener dispatch is the wrong shape. It's a plain
  `Map<topic, handler>` plus a pending-waiter list per topic, behind the same facade.

### Channels

- `channel(name)` returns a scoped `FynBus` view: topics on channel `"cart"` are
  invisible to the root bus and to other channels.
- Channel names are flat (one level). Calling `channel()` on a scoped bus resolves
  from the root, not nested — nesting can come with FYM-16 if ever needed.
- Internally: one `ChannelState { events: FynEventTarget, handlers: Map }` per
  name, created lazily, held by the root `FynBus`. The root bus is itself the
  `""` channel.

### Typing (forward-compatible with FYM-17)

v1 topics are strings and payloads are generics defaulting to `unknown` (not
`any` — consumers must assert or narrow). The `FynBus` interface is written so
FYM-17 can later introduce a `FynBusEventMap` interface with module augmentation
without breaking v1 call sites.

## Architecture

- **Kernel-level, not a separate package** (roadmap Q1 → resolved). It is ~2 small
  files with zero dependencies, and it needs lifecycle integration (auto-cleanup
  on shutdown) that only the kernel can provide. Isolated in its own module
  (`core/kernel/src/fyn-bus.ts` + facade), so extracting a package later stays
  cheap (design for deletion).
- **Separate instances from `kernel.events`** — the lifecycle bus stays private to
  kernel concerns; FynBus channels each own a `FynEventTarget`. No name-collision
  risk, no app traffic in lifecycle dispatch. `FynEventTarget.on()` gains nothing
  and loses nothing — the facade wraps `addEventListener` and returns the
  unsubscribe closure it already needs for cleanup tracking.
- **Telemetry hook**: each emit/request is mirrored to `KernelTelemetry` as a
  cheap structured event (topic, channel, source — never payloads). This feeds
  the parked DevTools Event Monitor (FYM-33) for free.

```
FynMeshKernel
├── events: FynEventTarget            (existing — lifecycle only, unchanged)
├── bus: FynBusRoot                   (new)
│   └── channels: Map<string, ChannelState>
│       └── ChannelState { events: FynEventTarget, handlers: Map<topic, RpcEntry> }
└── per-app: runtime.bus = FynAppBusFacade(root, appName)
    └── tracked subscriptions → disposed on FYNAPP_SHUTDOWN
```

## Resolved roadmap questions

1. **Kernel-level or separate package?** Kernel-level module; extractable later.
2. **How to type events across FynApp boundaries?** Strings + `unknown` payload
   generics in v1; typed event-map augmentation deferred to FYM-17.
3. **Should events persist for late subscribers?** No. State belongs to the
   registry; the bus is ephemeral by contract. Sticky emits are a possible later
   opt-in, only with a concrete driving use case.

## Testing (with FYM-14/15)

- Unit: emit/on/once delivery, unsubscribe (fn + AbortSignal), self-filtering,
  handler-error isolation, channel isolation, duplicate `handle()` throws,
  request→late handler resolution, timeout rejection, handler rejection propagation,
  facade cleanup on shutdown (no leaked listeners/handlers).
- Demo (FYM-18): two FynApps — one `handle`s a query and emits notifications, the
  other `request`s and subscribes — exercising cross-app pub/sub and RPC without
  any middleware involvement.

## Rollout

| Ticket  | Scope                                                              |
| ------- | ------------------------------------------------------------------ |
| FYM-14  | `FynBusRoot` + channels + emit/on/once + per-app facade + cleanup  |
| FYM-15  | request/handle, waiter list, timeout                                |
| FYM-18  | two-app demo page                                                   |
| FYM-16  | (parked) richer channel scoping/namespacing                         |
| FYM-17  | (parked) typed event contracts                                      |

Existing demos and middleware are untouched. Whether basic-counter or
design-tokens should later adopt FynBus is an explicit follow-up decision, not
part of this work.
