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
    const meta: FynBusMeta = { topic, source, channel: channelName };
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
  ): Unsubscribe {
    const { events } = this.getChannel(channelName);
    const listener = (evt: Event) => {
      const { payload, meta } = (evt as CustomEvent<BusEventDetail>).detail;
      if (!options?.self && meta.source === source) {
        return;
      }
      if (once) {
        unsubscribe();
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
    const unsubscribe = () => events.removeEventListener(topic, listener);
    events.addEventListener(topic, listener, { signal: options?.signal });
    return unsubscribe;
  }

  requestFrom(
    source: string,
    channelName: string,
    topic: string,
    payload: unknown,
    options?: RequestOptions,
  ): Promise<any> {
    const state = this.getChannel(channelName);
    const meta: FynBusMeta = { topic, source, channel: channelName };
    this.telemetry.capture({
      type: "event",
      name: "request",
      data: { topic, channel: channelName, source },
    });

    const existing = state.handlers.get(topic);
    if (existing) {
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
      const timer = setTimeout(() => {
        set.delete(waiter);
        if (set.size === 0) {
          state.waiters.delete(topic);
        }
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
        invokeRpcHandler(handler, payload, meta).then(resolve, reject);
      };
      set.add(waiter);
    });
  }

  registerHandler(channelName: string, topic: string, handler: RpcHandler): Unsubscribe {
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
      data: { topic, channel: channelName },
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

  /** Remove all subscriptions of an app; called by the kernel on shutdown */
  disposeApp(name: string, version?: string): void {
    const key = version ? `${name}@${version}` : name;
    const facade = this.facades.get(key);
    if (facade) {
      facade.dispose();
      this.facades.delete(key);
    }
  }

  /** Facade for kernel-side callers (host page, middleware); never disposed */
  forKernel(): FynBus {
    return new FynBusFacade(this, KERNEL_BUS_SOURCE);
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
    return this.track(
      this.root.subscribeFrom(this.source, this.channelName, topic, handler, options, false),
    );
  }

  once<T = unknown>(
    topic: string,
    handler: BusHandler<T>,
    options?: SubscribeOptions,
  ): Unsubscribe {
    this.assertActive();
    return this.track(
      this.root.subscribeFrom(this.source, this.channelName, topic, handler, options, true),
    );
  }

  request<TRes = unknown, TReq = unknown>(
    topic: string,
    payload?: TReq,
    options?: RequestOptions,
  ): Promise<TRes> {
    this.assertActive();
    return this.root.requestFrom(this.source, this.channelName, topic, payload, options);
  }

  handle<TReq = unknown, TRes = unknown>(
    topic: string,
    handler: RequestHandler<TReq, TRes>,
  ): Unsubscribe {
    this.assertActive();
    return this.track(this.root.registerHandler(this.channelName, topic, handler as RpcHandler));
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

  private track(unsub: Unsubscribe): Unsubscribe {
    const tracked = () => {
      this.state.subs.delete(tracked);
      unsub();
    };
    this.state.subs.add(tracked);
    return tracked;
  }
}
