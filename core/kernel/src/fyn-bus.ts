/**
 * FynBus - Inter-FynApp messaging (epic FYM-2)
 *
 * Design: notes/FYNBUS_DESIGN.md
 *
 * The bus carries ephemeral messages between FynApps. It is NOT a state store:
 * late subscribers do not see past messages. Anything a late joiner must
 * observe belongs in MiddlewareStateRegistry + ObservableState.
 *
 * Kept separate from kernel.events, which stays a kernel-internal lifecycle bus.
 */

import { FynEventTarget } from "./event-target";
import { FynBusError, KernelErrorCode } from "./errors";
import { noOpTelemetry } from "./kernel-telemetry";
import type { KernelTelemetry } from "./types";

export type Unsubscribe = () => void;

/** Source name stamped on messages emitted through kernel.bus */
export const KERNEL_BUS_SOURCE = "kernel";

/** Platform-stamped metadata delivered alongside every payload */
export interface FynBusMeta {
  topic: string;
  /** Sender FynApp name, or "kernel" */
  source: string;
  /** Channel name, "" for the root bus */
  channel: string;
}

export type BusHandler<T = unknown> = (payload: T, meta: FynBusMeta) => void;

export interface SubscribeOptions {
  /** Also receive this bus's own emits. Default false. */
  self?: boolean;
  /** Alternative unsubscribe, mirrors EventTarget */
  signal?: AbortSignal;
}

export interface RequestOptions {
  /** ms to wait for a handler to appear before rejecting. Default 10s. */
  timeout?: number;
}

/** FynApps load independently; requests wait this long for a late handler */
export const DEFAULT_REQUEST_TIMEOUT = 10_000;

export type RequestHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  meta: FynBusMeta,
) => TRes | Promise<TRes>;

/**
 * Messaging API available to FynApps as `runtime.bus` and to kernel-side
 * code as `kernel.bus`.
 */
export interface FynBus {
  /** Deliver payload synchronously to current subscribers of topic */
  emit<T = unknown>(topic: string, payload?: T): void;
  /** Subscribe to a topic; returns an unsubscribe function */
  on<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe;
  /** Subscribe for a single delivery (self-filtered emits don't consume it) */
  once<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe;
  /**
   * Send a request; resolves with the handler's response, rejects with the
   * handler's error. Waits up to options.timeout for a handler to appear
   * (late-loading FynApps are normal), then rejects with BUS_REQUEST_TIMEOUT.
   */
  request<TRes = unknown, TReq = unknown>(
    topic: string,
    payload?: TReq,
    options?: RequestOptions,
  ): Promise<TRes>;
  /**
   * Register the single responder for a topic. A second handle() on the same
   * topic throws BUS_HANDLER_EXISTS; the returned unsubscribe frees the topic.
   */
  handle<TReq = unknown, TRes = unknown>(
    topic: string,
    handler: RequestHandler<TReq, TRes>,
  ): Unsubscribe;
  /** Scoped view: topics on a named channel are invisible to other channels */
  channel(name: string): FynBus;
}

type BusEventDetail = { payload: unknown; meta: FynBusMeta };

type RpcHandler = RequestHandler<any, any>;

type ChannelState = {
  events: FynEventTarget;
  /** RPC: exactly one handler per topic */
  handlers: Map<string, RpcHandler>;
  /** Requests parked until a handler registers (cleared by timeout) */
  waiters: Map<string, Set<(handler: RpcHandler) => void>>;
};

/** Async wrapper so a synchronously-throwing handler becomes a rejection */
async function invokeRpcHandler(
  handler: RpcHandler,
  payload: unknown,
  meta: FynBusMeta,
): Promise<any> {
  return handler(payload, meta);
}

/** Subscription tracking shared between an app facade and its channel views */
type FacadeState = {
  subs: Set<Unsubscribe>;
  disposed: boolean;
};

/**
 * Root bus owned by the kernel. Holds per-channel state and per-app facades.
 * FynApps never see this class - they get a FynBusFacade via runtime.bus.
 */
export class FynBusRoot {
  private channels = new Map<string, ChannelState>();
  private facades = new Map<string, FynBusFacade>();
  private kernelFacade?: FynBusFacade;
  private telemetry: KernelTelemetry;

  constructor(telemetry?: KernelTelemetry) {
    this.telemetry = telemetry ?? noOpTelemetry;
  }

  private getChannel(name: string): ChannelState {
    let state = this.channels.get(name);
    if (!state) {
      state = { events: new FynEventTarget(), handlers: new Map(), waiters: new Map() };
      this.channels.set(name, state);
    }
    return state;
  }

  emitFrom(source: string, channelName: string, topic: string, payload: unknown): void {
    // Frozen: meta is shared across subscribers and platform-stamped identity
    // must not be tamperable by one of them
    const meta: FynBusMeta = Object.freeze({ topic, source, channel: channelName });
    // Unprefixed name by convention: the kernel passes telemetry.scope("bus")
    this.telemetry.capture({
      type: "event",
      name: "emit",
      data: { topic, channel: channelName, source },
    });
    const detail: BusEventDetail = { payload, meta };
    this.getChannel(channelName).events.dispatchEvent(new CustomEvent(topic, { detail }));
  }

  subscribeFrom(
    source: string,
    channelName: string,
    topic: string,
    handler: BusHandler<any>,
    options: SubscribeOptions | undefined,
    once: boolean,
    onAutoRemove?: () => void,
  ): Unsubscribe {
    const { events } = this.getChannel(channelName);
    const signal = options?.signal;
    // Fired once() and signal aborts remove the listener without going
    // through the facade's unsubscribe — the hook lets it drop its tracking
    const onAbort = () => onAutoRemove?.();
    signal?.addEventListener("abort", onAbort, { once: true });
    const listener = (evt: Event) => {
      const { payload, meta } = (evt as CustomEvent<BusEventDetail>).detail;
      if (!options?.self && meta.source === source) {
        return;
      }
      if (once) {
        unsubscribe();
        onAutoRemove?.();
      }
      try {
        handler(payload, meta);
      } catch (error) {
        // Error isolation: one throwing handler must not break delivery to
        // the others, nor make emit() throw at the sender
        console.error(`FynBus: handler error on topic "${topic}"`, error);
        this.telemetry.captureError(
          "handler",
          { topic, channel: channelName, subscriber: source },
          error,
        );
      }
    };
    const unsubscribe = () => {
      // Drop the abort hook too — a long-lived signal shared across many
      // subscribe/unsubscribe cycles must not accumulate stale listeners
      signal?.removeEventListener("abort", onAbort);
      events.removeEventListener(topic, listener);
    };
    events.addEventListener(topic, listener, { signal });
    return unsubscribe;
  }

  requestFrom(
    source: string,
    channelName: string,
    topic: string,
    payload: unknown,
    options?: RequestOptions,
    onParked?: (cancel: () => void) => () => void,
  ): Promise<any> {
    const state = this.getChannel(channelName);
    const meta: FynBusMeta = Object.freeze({ topic, source, channel: channelName });
    this.telemetry.capture({
      type: "event",
      name: "request",
      data: { topic, channel: channelName, source },
    });

    const existing = state.handlers.get(topic);
    if (existing) {
      // In-flight invocations always settle; only PARKED requests are
      // cancellable by dispose
      return invokeRpcHandler(existing, payload, meta);
    }

    const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT;
    return new Promise((resolve, reject) => {
      let waiting = state.waiters.get(topic);
      if (!waiting) {
        waiting = new Set();
        state.waiters.set(topic, waiting);
      }
      const set = waiting;
      let untrack: (() => void) | undefined;
      const removeWaiter = () => {
        set.delete(waiter);
        if (set.size === 0 && state.waiters.get(topic) === set) {
          state.waiters.delete(topic);
        }
      };
      const timer = setTimeout(() => {
        removeWaiter();
        untrack?.();
        reject(
          new FynBusError(
            KernelErrorCode.BUS_REQUEST_TIMEOUT,
            `FynBus: request "${topic}" on channel "${channelName}" timed out after ${timeout}ms waiting for a handler`,
            { topic, channel: channelName, source, timeout },
          ),
        );
      }, timeout);
      const waiter = (handler: RpcHandler) => {
        clearTimeout(timer);
        untrack?.();
        invokeRpcHandler(handler, payload, meta).then(resolve, reject);
      };
      set.add(waiter);
      if (onParked) {
        // Dispose of the requester's facade rejects parked requests
        untrack = onParked(() => {
          clearTimeout(timer);
          removeWaiter();
          reject(
            new FynBusError(
              KernelErrorCode.BUS_DISPOSED,
              `FynBus: request "${topic}" on channel "${channelName}" cancelled — bus for "${source}" was disposed`,
              { topic, channel: channelName, source },
            ),
          );
        });
      }
    });
  }

  registerHandler(source: string, channelName: string, topic: string, handler: RpcHandler): Unsubscribe {
    const state = this.getChannel(channelName);
    if (state.handlers.has(topic)) {
      throw new FynBusError(
        KernelErrorCode.BUS_HANDLER_EXISTS,
        `FynBus: a handler is already registered for topic "${topic}" on channel "${channelName}"`,
        { topic, channel: channelName },
      );
    }
    state.handlers.set(topic, handler);
    this.telemetry.capture({
      type: "event",
      name: "handle",
      data: { topic, channel: channelName, source },
    });

    // Release requests that arrived before the handler
    const waiting = state.waiters.get(topic);
    if (waiting) {
      state.waiters.delete(topic);
      for (const waiter of waiting) {
        waiter(handler);
      }
    }

    return () => {
      if (state.handlers.get(topic) === handler) {
        state.handlers.delete(topic);
      }
    };
  }

  /**
   * Per-app facade, cached by name@version so side-by-side versions get
   * independent lifecycles while sharing the app name as message source.
   */
  forApp(name: string, version?: string): FynBusFacade {
    const key = version ? `${name}@${version}` : name;
    let facade = this.facades.get(key);
    if (!facade) {
      facade = new FynBusFacade(this, name);
      this.facades.set(key, facade);
    }
    return facade;
  }

  /**
   * Remove all subscriptions of an app; called by the kernel on shutdown.
   * With a version, disposes exactly that facade; without one, disposes
   * EVERY facade for that app name (bare and all versions).
   */
  disposeApp(name: string, version?: string): void {
    if (version) {
      const key = `${name}@${version}`;
      const facade = this.facades.get(key);
      if (facade) {
        facade.dispose();
        this.facades.delete(key);
      }
      return;
    }
    const prefix = `${name}@`;
    for (const [key, facade] of [...this.facades]) {
      if (key === name || key.startsWith(prefix)) {
        facade.dispose();
        this.facades.delete(key);
      }
    }
  }

  /**
   * Facade for kernel-side callers (host page, middleware); a singleton so
   * all kernel-side code shares one subscription tracker. Never disposed —
   * it is intentionally not in the facades map, so disposeApp("kernel") is
   * a no-op.
   */
  forKernel(): FynBus {
    if (!this.kernelFacade) {
      this.kernelFacade = new FynBusFacade(this, KERNEL_BUS_SOURCE);
    }
    return this.kernelFacade;
  }
}

/**
 * Per-source view of the bus. Stamps meta.source on emits, filters self-echo
 * by default, and tracks subscriptions so dispose() can remove them all.
 */
export class FynBusFacade implements FynBus {
  private state: FacadeState;

  constructor(
    private root: FynBusRoot,
    private source: string,
    private channelName: string = "",
    state?: FacadeState,
  ) {
    this.state = state ?? { subs: new Set(), disposed: false };
  }

  private assertActive(): void {
    if (this.state.disposed) {
      throw new FynBusError(
        KernelErrorCode.BUS_DISPOSED,
        `FynBus for "${this.source}" has been disposed`,
        { source: this.source, channel: this.channelName },
      );
    }
  }

  emit<T = unknown>(topic: string, payload?: T): void {
    this.assertActive();
    this.root.emitFrom(this.source, this.channelName, topic, payload);
  }

  on<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe {
    this.assertActive();
    return this.subscribe(topic, handler, options, false);
  }

  once<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe {
    this.assertActive();
    return this.subscribe(topic, handler, options, true);
  }

  request<TRes = unknown, TReq = unknown>(
    topic: string,
    payload?: TReq,
    options?: RequestOptions,
  ): Promise<TRes> {
    this.assertActive();
    return this.root.requestFrom(
      this.source,
      this.channelName,
      topic,
      payload,
      options,
      // Track parked requests so dispose() rejects them; the returned
      // untrack drops the canceller once the waiter settles naturally
      (cancel) => {
        const tracked = this.track(cancel);
        return () => this.state.subs.delete(tracked);
      },
    );
  }

  handle<TReq = unknown, TRes = unknown>(
    topic: string,
    handler: RequestHandler<TReq, TRes>,
  ): Unsubscribe {
    this.assertActive();
    return this.track(
      this.root.registerHandler(this.source, this.channelName, topic, handler as RpcHandler),
    );
  }

  channel(name: string): FynBus {
    this.assertActive();
    if (!name) {
      throw new FynBusError(
        KernelErrorCode.BUS_INVALID_CHANNEL,
        `FynBus: channel name must be a non-empty string`,
        { source: this.source },
      );
    }
    // Channel names are flat: always resolved from the root, never nested.
    // Channel views share the owning facade's tracking, so dispose() covers them.
    return new FynBusFacade(this.root, this.source, name, this.state);
  }

  /** Unsubscribe everything registered through this facade and its channels */
  dispose(): void {
    this.state.disposed = true;
    for (const unsub of [...this.state.subs]) {
      unsub();
    }
    this.state.subs.clear();
  }

  private subscribe(
    topic: string,
    handler: BusHandler<any>,
    options: SubscribeOptions | undefined,
    once: boolean,
  ): Unsubscribe {
    let tracked: Unsubscribe;
    const raw = this.root.subscribeFrom(
      this.source,
      this.channelName,
      topic,
      handler,
      options,
      once,
      // Auto-removal (fired once / aborted signal) drops the tracking entry
      () => this.state.subs.delete(tracked),
    );
    tracked = this.track(raw);
    if (options?.signal?.aborted) {
      // Pre-aborted signal: the listener was never registered and the abort
      // event won't re-fire — don't keep a tracking entry for it
      this.state.subs.delete(tracked);
    }
    return tracked;
  }

  private track(unsub: Unsubscribe): Unsubscribe {
    const tracked = () => {
      this.state.subs.delete(tracked);
      unsub();
    };
    this.state.subs.add(tracked);
    return tracked;
  }
}
