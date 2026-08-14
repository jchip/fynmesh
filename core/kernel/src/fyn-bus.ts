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
import { noOpTelemetry, captureEvent } from "./kernel-telemetry";
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
  /**
   * Stop waiting for the response: rejects with BUS_REQUEST_ABORTED, the
   * signal's reason as cause. Does NOT cancel an already-invoking handler —
   * it runs to completion and its result is discarded. Compose with
   * AbortSignal.timeout(ms) for a full response deadline.
   */
  signal?: AbortSignal;
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
   * options.signal stops the wait at any point (BUS_REQUEST_ABORTED); an
   * already-invoking handler still runs, its result discarded.
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
export interface FynBusRoot {
  emitFrom(source: string, channelName: string, topic: string, payload: unknown): void;
  subscribeFrom(
    source: string,
    channelName: string,
    topic: string,
    handler: BusHandler<any>,
    options: SubscribeOptions | undefined,
    once: boolean,
    onAutoRemove?: () => void,
  ): Unsubscribe;
  requestFrom(
    source: string,
    channelName: string,
    topic: string,
    payload: unknown,
    options?: RequestOptions,
    onCancel?: (cancel: () => void) => () => void,
  ): Promise<any>;
  registerHandler(
    source: string,
    channelName: string,
    topic: string,
    handler: RpcHandler,
  ): Unsubscribe;
  forApp(name: string, version?: string): FynBusFacade;
  disposeApp(name: string, version?: string): void;
  forKernel(): FynBus;
}

/**
 * Root bus owned by the kernel — a closure over the per-channel state and the
 * per-app facade cache. See the note on `FynBusFacade`.
 */
export const FynBusRoot = function (telemetry?: KernelTelemetry): FynBusRoot {
  const tel = telemetry ?? noOpTelemetry;
  const channels = new Map<string, ChannelState>();
  const facades = new Map<string, FynBusFacade>();
  let kernelFacade: FynBusFacade | undefined;

  const getChannel = (name: string): ChannelState => {
    let state = channels.get(name);
    if (!state) {
      state = { events: new FynEventTarget(), handlers: new Map(), waiters: new Map() };
      channels.set(name, state);
    }
    return state;
  };

  const emitFrom = (source: string, channelName: string, topic: string, payload: unknown): void => {
    // Frozen: meta is shared across subscribers and platform-stamped identity
    // must not be tamperable by one of them
    const meta: FynBusMeta = Object.freeze({ topic, source, channel: channelName });
    // Unprefixed name by convention: the kernel passes tel.scope("bus")
    captureEvent(tel, "emit", { topic, channel: channelName, source });
    const detail: BusEventDetail = { payload, meta };
    getChannel(channelName).events.dispatchEvent(new CustomEvent(topic, { detail }));
  };

  const subscribeFrom = (
    source: string,
    channelName: string,
    topic: string,
    handler: BusHandler<any>,
    options: SubscribeOptions | undefined,
    once: boolean,
    onAutoRemove?: () => void,
  ): Unsubscribe => {
    const { events } = getChannel(channelName);
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
        tel.capErr(
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
  };

  const requestFrom = (
    source: string,
    channelName: string,
    topic: string,
    payload: unknown,
    options?: RequestOptions,
    onCancel?: (cancel: () => void) => () => void,
  ): Promise<any> => {
    let state = getChannel(channelName);
    const meta: FynBusMeta = Object.freeze({ topic, source, channel: channelName });
    // Every error and tel point below identifies the request the same
    // way, so the description and the context are each built once.
    const where = `FynBus: request "${topic}" on channel "${channelName}"`;
    const ctx = { topic, channel: channelName, source };
    captureEvent(tel, "request", ctx);

    const signal = options?.signal;
    return new Promise((resolve, reject) => {
      const abortError = () =>
        new FynBusError(
          KernelErrorCode.BUS_REQUEST_ABORTED,
          `${where} aborted by caller`,
          ctx,
          signal?.reason,
        );
      if (signal?.aborted) {
        // Mirrors fetch(): a dead signal rejects before parking or invoking
        reject(abortError());
        return;
      }

      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let removeWaiter: (() => void) | undefined;
      let removeAbort: (() => void) | undefined;
      let untrack: (() => void) | undefined;
      // Detach every hook exactly once, then settle; a late competing
      // settle (e.g. the handler's result after an abort) is dropped
      const settle = (finish: () => void) => {
        if (done) {
          return;
        }
        done = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        removeWaiter?.();
        removeAbort?.();
        untrack?.();
        finish();
      };

      // Once invoking, the handler always runs to completion — abort and
      // dispose only stop the requester from waiting (result discarded).
      // The park timer stops here: timeout covers only the wait for a handler.
      const invoke = (handler: RpcHandler) => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
        invokeRpcHandler(handler, payload, meta).then(
          (value) => settle(() => resolve(value)),
          (error) => settle(() => reject(error)),
        );
      };

      if (signal) {
        const onAbort = () => settle(() => reject(abortError()));
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbort = () => signal.removeEventListener("abort", onAbort);
      }
      if (onCancel) {
        // Dispose of the requester's facade stops the wait, parked or in-flight
        untrack = onCancel(() =>
          settle(() =>
            reject(
              new FynBusError(
                KernelErrorCode.BUS_DISPOSED,
                `${where} cancelled — bus for "${source}" was disposed`,
                ctx,
              ),
            ),
          ),
        );
      }

      const existing = state.handlers.get(topic);
      if (existing) {
        invoke(existing);
        return;
      }

      let waiting = state.waiters.get(topic);
      if (!waiting) {
        waiting = new Set();
        state.waiters.set(topic, waiting);
      }
      let set = waiting;
      const waiter = (handler: RpcHandler) => invoke(handler);
      removeWaiter = () => {
        set.delete(waiter);
        if (set.size === 0 && state.waiters.get(topic) === set) {
          state.waiters.delete(topic);
        }
      };
      const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT;
      timer = setTimeout(() => {
        settle(() =>
          reject(
            new FynBusError(
              KernelErrorCode.BUS_REQUEST_TIMEOUT,
              `${where} timed out after ${timeout}ms waiting for a handler`,
              { ...ctx, timeout },
            ),
          ),
        );
      }, timeout);
      set.add(waiter);
    });
  };

  const registerHandler = (source: string, channelName: string, topic: string, handler: RpcHandler): Unsubscribe => {
    let state = getChannel(channelName);
    if (state.handlers.has(topic)) {
      throw new FynBusError(
        KernelErrorCode.BUS_HANDLER_EXISTS,
        `FynBus: a handler is already registered for topic "${topic}" on channel "${channelName}"`,
        { topic, channel: channelName },
      );
    }
    state.handlers.set(topic, handler);
    captureEvent(tel, "handle", { topic, channel: channelName, source });

    // Release requests that arrived before the handler
    let waiting = state.waiters.get(topic);
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
  const forApp = (name: string, version?: string): FynBusFacade => {
    const key = version ? `${name}@${version}` : name;
    let facade = facades.get(key);
    if (!facade) {
      facade = FynBusFacade(self, name);
      facades.set(key, facade);
    }
    return facade;
  };

  /**
   * Remove all subscriptions of an app; called by the kernel on shutdown.
   * With a version, disposes exactly that facade; without one, disposes
   * EVERY facade for that app name (bare and all versions).
   */
  const disposeApp = (name: string, version?: string): void => {
    if (version) {
      const key = `${name}@${version}`;
      let facade = facades.get(key);
      if (facade) {
        facade.dispose();
        facades.delete(key);
      }
      return;
    }
    const prefix = `${name}@`;
    for (const [key, facade] of [...facades]) {
      if (key === name || key.startsWith(prefix)) {
        facade.dispose();
        facades.delete(key);
      }
    }
  };

  /**
   * Facade for kernel-side callers (host page, middleware); a singleton so
   * all kernel-side code shares one subscription tracker. Never disposed —
   * it is intentionally not in the facades map, so disposeApp("kernel") is
   * a no-op.
   */
  const forKernel = (): FynBus => {
    if (!kernelFacade) {
      kernelFacade = FynBusFacade(self, KERNEL_BUS_SOURCE);
    }
    return kernelFacade;
  };

  // `channels`/`facades` are carried for the stress tests, which assert leak
  // invariants against them. Deliberately absent from FynBusRoot: declaring
  // them would put them in the public .d.ts, where the property mangler has to
  // reserve the names. The tests run against src, so they see them regardless.
  const self = {
    channels,
    facades,
    emitFrom,
    subscribeFrom,
    requestFrom,
    registerHandler,
    forApp,
    disposeApp,
    forKernel,
  };
  return self as FynBusRoot;
} as unknown as {
  (telemetry?: KernelTelemetry): FynBusRoot;
  new (telemetry?: KernelTelemetry): FynBusRoot;
};

/**
 * Per-source view of the bus. Stamps meta.source on emits, filters self-echo
 * by default, and tracks subscriptions so dispose() can remove them all.
 *
 * A closure rather than a class: `source`, `channelName` and the shared
 * subscription state are read on nearly every call, and as closure variables
 * they cost one character each instead of a property lookup per use. Channel
 * views are made by calling the factory again with the owning facade's state,
 * so dispose() still covers them.
 */
export interface FynBusFacade extends FynBus {
  /** Unsubscribe everything registered through this facade and its channels */
  dispose(): void;
}

export const FynBusFacade = function (
  root: FynBusRoot,
  source: string,
  channelName: string = "",
  shared?: FacadeState,
): FynBusFacade {
  const state: FacadeState = shared ?? { subs: new Set(), disposed: false };

  const assertActive = (): void => {
    if (state.disposed) {
      throw new FynBusError(
        KernelErrorCode.BUS_DISPOSED,
        `FynBus for "${source}" has been disposed`,
        { source, channel: channelName },
      );
    }
  };

  const track = (unsub: Unsubscribe): Unsubscribe => {
    const tracked = () => {
      state.subs.delete(tracked);
      unsub();
    };
    state.subs.add(tracked);
    return tracked;
  };

  const subscribe = (
    topic: string,
    handler: BusHandler<any>,
    options: SubscribeOptions | undefined,
    once: boolean,
  ): Unsubscribe => {
    let tracked: Unsubscribe;
    const raw = root.subscribeFrom(
      source,
      channelName,
      topic,
      handler,
      options,
      once,
      // Auto-removal (fired once / aborted signal) drops the tracking entry
      () => state.subs.delete(tracked),
    );
    tracked = track(raw);
    if (options?.signal?.aborted) {
      // Pre-aborted signal: the listener was never registered and the abort
      // event won't re-fire — don't keep a tracking entry for it
      state.subs.delete(tracked);
    }
    return tracked;
  };

  // `state` is likewise carried but undeclared — see FynBusRoot above.
  const facade: FynBusFacade & { state: FacadeState } = {
    state,

    emit(topic, payload) {
      assertActive();
      root.emitFrom(source, channelName, topic, payload);
    },

    on(topic, handler, options) {
      assertActive();
      return subscribe(topic, handler as BusHandler<any>, options, false);
    },

    once(topic, handler, options) {
      assertActive();
      return subscribe(topic, handler as BusHandler<any>, options, true);
    },

    request(topic, payload, options) {
      assertActive();
      return root.requestFrom(
        source,
        channelName,
        topic,
        payload,
        options,
        // Track the request so dispose() stops its wait (parked or in-flight);
        // the returned untrack drops the canceller once the request settles
        (cancel) => {
          const tracked = track(cancel);
          return () => state.subs.delete(tracked);
        },
      );
    },

    handle(topic, handler) {
      assertActive();
      return track(root.registerHandler(source, channelName, topic, handler as RpcHandler));
    },

    channel(name) {
      assertActive();
      if (!name) {
        throw new FynBusError(
          KernelErrorCode.BUS_INVALID_CHANNEL,
          `FynBus: channel name must be a non-empty string`,
          { source },
        );
      }
      // Channel names are flat: always resolved from the root, never nested.
      // Channel views share this facade's tracking, so dispose() covers them.
      return FynBusFacade(root, source, name, state);
    },

    dispose() {
      state.disposed = true;
      for (const unsub of [...state.subs]) {
        unsub();
      }
      state.subs.clear();
    },
  };
  return facade;
} as unknown as {
  (root: FynBusRoot, source: string, channelName?: string, shared?: FacadeState): FynBusFacade;
  new (root: FynBusRoot, source: string, channelName?: string, shared?: FacadeState): FynBusFacade;
};
