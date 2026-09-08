const PreloadPriority = {
  /** Critical: modulepreload with fetchpriority="high" */
  CRITICAL: "critical",
  /** Important: modulepreload with fetchpriority="auto" */
  IMPORTANT: "important",
  /** Deferred: prefetch (idle time only) */
  DEFERRED: "deferred",
  /** None: no preloading */
  NONE: "none"
};

const useMiddleware = (meta, unit) => {
  unit.__middlewareMeta = [].concat(meta);
  return unit;
};
const noOpFynUnit = {
  initialize: () => ({ status: "ready" }),
  execute: () => {
  }
};
const noOpMiddlewareUser = noOpFynUnit;

const fynMeshShareScope = "fynmesh";

var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
const KernelErrorCode = {
  // Module Loading Errors (1xxx)
  MODULE_NOT_FOUND: 1001,
  MODULE_LOAD_FAILED: 1002,
  EXPOSE_MODULE_NOT_FOUND: 1003,
  DEPENDENCY_NOT_FOUND: 1004,
  // Middleware Errors (2xxx)
  MIDDLEWARE_NOT_FOUND: 2001,
  MIDDLEWARE_SETUP_FAILED: 2002,
  MIDDLEWARE_APPLY_FAILED: 2003,
  MIDDLEWARE_FILTER_ERROR: 2004,
  // Bootstrap Errors (3xxx)
  BOOTSTRAP_FAILED: 3001,
  REGISTRY_RESOLVER_MISSING: 3002,
  // Manifest Errors (4xxx)
  MANIFEST_FETCH_FAILED: 4001,
  MANIFEST_PARSE_FAILED: 4002,
  // Federation Errors (5xxx)
  FEDERATION_NOT_LOADED: 5001,
  FEDERATION_ENTRY_FAILED: 5002,
  // FynBus Errors (6xxx)
  BUS_DISPOSED: 6001,
  BUS_INVALID_CHANNEL: 6002,
  BUS_HANDLER_EXISTS: 6003,
  BUS_REQUEST_TIMEOUT: 6004,
  BUS_REQUEST_ABORTED: 6005
};
class KernelError extends Error {
  constructor(code, message, options) {
    super(message);
    __publicField$2(this, "code");
    __publicField$2(this, "context");
    __publicField$2(this, "cause");
    this.name = "KernelError";
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  /**
   * Get a formatted error message with context
   */
  toDetailedString() {
    let result = `[${this.name}:${this.code}] ${this.message}`;
    if (this.context) {
      result += `
Context: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.cause) {
      result += `
Caused by: ${this.cause.message}`;
    }
    return result;
  }
}
function defineErrorClass(name) {
  return class extends KernelError {
    constructor(code, message, options) {
      const { cause, ...context } = options ?? {};
      super(code, message, { context, cause });
      this.name = name;
    }
  };
}
const ModuleLoadError = defineErrorClass("ModuleLoadError");
const MiddlewareError = defineErrorClass("MiddlewareError");
const BootstrapError = defineErrorClass("BootstrapError");
const ManifestError = defineErrorClass("ManifestError");
const FederationError = defineErrorClass("FederationError");
function isErrorLike(value) {
  return value instanceof Error || typeof value === "object" && value !== null && typeof value.name === "string" && typeof value.message === "string";
}
class FynBusError extends KernelError {
  constructor(code, message, context, cause) {
    super(code, message, {
      context,
      // KernelError chains Error causes; an AbortSignal reason can be any
      // value, so non-Error reasons are wrapped to keep the chain intact
      cause: cause === void 0 || isErrorLike(cause) ? cause : new Error(String(cause))
    });
    this.name = "FynBusError";
  }
}
function ok(value) {
  return { success: true, value };
}
function err(error) {
  return { success: false, error };
}
function isError(result) {
  return !result.success;
}
function isOk(result) {
  return result.success;
}
function unwrap(result) {
  if (result.success) {
    return result.value;
  }
  throw result.error;
}
function unwrapOr(result, defaultValue) {
  if (result.success) {
    return result.value;
  }
  return defaultValue;
}

var __defProp$1 = Object.defineProperty;
var __typeError$2 = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, key + "" , value);
var __accessCheck$2 = (obj, member, msg) => member.has(obj) || __typeError$2("Cannot " + msg);
var __privateGet$2 = (obj, member, getter) => (__accessCheck$2(obj, member, "read from private field"), member.get(obj));
var __privateAdd$2 = (obj, member, value) => member.has(obj) ? __typeError$2("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet$1 = (obj, member, value, setter) => (__accessCheck$2(obj, member, "write to private field"), member.set(obj, value), value);
var _observers, _disposed;
class ObservableState {
  constructor(initial) {
    __publicField$1(this, "value");
    __privateAdd$2(this, _observers, /* @__PURE__ */ new Set());
    __privateAdd$2(this, _disposed, false);
    this.value = initial;
  }
  /** Get current value */
  get() {
    if (__privateGet$2(this, _disposed)) {
      throw new Error("Cannot get value from disposed ObservableState");
    }
    return this.value;
  }
  /** Set new value and notify observers */
  set(value) {
    if (__privateGet$2(this, _disposed)) return;
    const prev = this.value;
    this.value = value;
    __privateGet$2(this, _observers).forEach((fn) => {
      try {
        fn(value, prev);
      } catch (e) {
        console.error("ObservableState observer error:", e);
      }
    });
  }
  /** Functional update */
  update(fn) {
    this.set(fn(this.value));
  }
  /** Subscribe to changes. Callback is called immediately with current value. Returns unsubscribe function. */
  subscribe(fn) {
    if (__privateGet$2(this, _disposed)) {
      throw new Error("Cannot subscribe to disposed ObservableState");
    }
    fn(this.value, void 0);
    __privateGet$2(this, _observers).add(fn);
    return () => __privateGet$2(this, _observers).delete(fn);
  }
  /** Dispose state and clear all observers */
  dispose() {
    __privateSet$1(this, _disposed, true);
    __privateGet$2(this, _observers).clear();
  }
}
_observers = new WeakMap();
_disposed = new WeakMap();

var __typeError$1 = (msg) => {
  throw TypeError(msg);
};
var __accessCheck$1 = (obj, member, msg) => member.has(obj) || __typeError$1("Cannot " + msg);
var __privateGet$1 = (obj, member, getter) => (__accessCheck$1(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd$1 = (obj, member, value) => member.has(obj) ? __typeError$1("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck$1(obj, member, "write to private field"), member.set(obj, value), value);
var _parent, _states, _pendingWaiters;
const _MiddlewareStateRegistry = class _MiddlewareStateRegistry {
  constructor(parent) {
    __privateAdd$1(this, _parent);
    __privateAdd$1(this, _states, /* @__PURE__ */ new Map());
    __privateAdd$1(this, _pendingWaiters, /* @__PURE__ */ new Map());
    __privateSet(this, _parent, parent);
  }
  /**
   * Provide/register state in this scope.
   * @param key Unique key for this state
   * @param initial Initial value
   * @returns ObservableState for updates
   */
  provide(key, initial) {
    if (__privateGet$1(this, _states).has(key)) {
      return __privateGet$1(this, _states).get(key);
    }
    const state = new ObservableState(initial);
    __privateGet$1(this, _states).set(key, state);
    const waiters = __privateGet$1(this, _pendingWaiters).get(key);
    if (waiters) {
      waiters.forEach(({ resolve }) => resolve(state));
      __privateGet$1(this, _pendingWaiters).delete(key);
    }
    return state;
  }
  /**
   * Lookup state by key. Walks up hierarchy if not found locally.
   * @param key State key to find
   * @returns ObservableState or undefined if not found
   */
  lookup(key) {
    if (__privateGet$1(this, _states).has(key)) {
      return __privateGet$1(this, _states).get(key);
    }
    return __privateGet$1(this, _parent)?.lookup(key);
  }
  /**
   * Check if state exists in this scope or parent scopes.
   */
  has(key) {
    if (__privateGet$1(this, _states).has(key)) return true;
    return __privateGet$1(this, _parent)?.has(key) ?? false;
  }
  /**
   * Async wait for state to be provided.
   * @param key State key to wait for
   * @param timeout Timeout in ms (default 30000)
   * @returns Promise resolving to ObservableState
   */
  waitFor(key, timeout = 3e4) {
    const existing = this.lookup(key);
    if (existing) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (state) => {
          clearTimeout(timer);
          resolve(state);
        },
        reject
      };
      const timer = setTimeout(() => {
        const waiters2 = __privateGet$1(this, _pendingWaiters).get(key);
        const idx = waiters2?.indexOf(waiter) ?? -1;
        if (idx >= 0) {
          waiters2.splice(idx, 1);
          if (waiters2.length === 0) __privateGet$1(this, _pendingWaiters).delete(key);
        }
        reject(new Error(`Timeout waiting for state: ${key}`));
      }, timeout);
      const waiters = __privateGet$1(this, _pendingWaiters).get(key);
      if (waiters) {
        waiters.push(waiter);
      } else {
        __privateGet$1(this, _pendingWaiters).set(key, [waiter]);
      }
    });
  }
  /**
   * Remove state from this scope.
   * @param key State key to remove
   * @returns true if removed, false if not found
   */
  remove(key) {
    const state = __privateGet$1(this, _states).get(key);
    if (state) {
      state.dispose();
      __privateGet$1(this, _states).delete(key);
      return true;
    }
    return false;
  }
  /**
   * Clear all state in this scope.
   */
  clear() {
    __privateGet$1(this, _states).forEach((state) => state.dispose());
    __privateGet$1(this, _states).clear();
    __privateGet$1(this, _pendingWaiters).forEach((waiters, key) => {
      waiters.forEach(({ reject }) => reject(new Error(`Registry cleared while waiting for: ${key}`)));
    });
    __privateGet$1(this, _pendingWaiters).clear();
  }
  /**
   * Create a child scope that inherits from this registry.
   */
  createScope() {
    return new _MiddlewareStateRegistry(this);
  }
  /**
   * Get all keys in this scope (not including parent).
   */
  keys() {
    return Array.from(__privateGet$1(this, _states).keys());
  }
  /**
   * Get parent registry if exists.
   */
  getParent() {
    return __privateGet$1(this, _parent);
  }
};
_parent = new WeakMap();
_states = new WeakMap();
_pendingWaiters = new WeakMap();
let MiddlewareStateRegistry = _MiddlewareStateRegistry;

class FynEventTarget extends EventTarget {
  /**
   * Add an event listener
   * @param type The event type to listen for
   * @param handler The event handler
   * @param options Optional addEventListener options
   */
  on(type, handler, options) {
    this.addEventListener(type, handler, options);
  }
  /**
   * Add a one-time event listener
   * @param type The event type to listen for
   * @param handler The event handler
   * @param options Optional addEventListener options
   */
  once(type, handler, options) {
    const xh = (evt) => {
      this.removeEventListener(type, xh);
      return typeof handler === "function" ? handler(evt) : handler.handleEvent(evt);
    };
    this.addEventListener(type, xh, options);
  }
}

var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var _buffer;
const DEFAULT_MAX_BUFFER_SIZE = 500;
class ConsoleTelemetryTransport {
  async send(batch) {
    console.log("[telemetry]", batch);
  }
}
class KernelTelemetryImpl {
  constructor(config) {
    __privateAdd(this, _buffer, []);
    __publicField(this, "transport");
    __publicField(this, "maxBufferSize");
    this.transport = config?.transport ?? new ConsoleTelemetryTransport();
    this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }
  capture(entry) {
    const full = { ...entry, ts: Date.now() };
    if (__privateGet(this, _buffer).length >= this.maxBufferSize) {
      __privateGet(this, _buffer).shift();
    }
    __privateGet(this, _buffer).push(full);
  }
  capErr(name, data, error) {
    const err = error instanceof Error ? error : new Error(String(error));
    this.capture({
      type: "error",
      name,
      data,
      error: { message: err.message, stack: err.stack }
    });
  }
  scope(prefix) {
    return {
      capture: (entry) => this.capture({ ...entry, name: `${prefix}.${entry.name}` }),
      capErr: (name, data, error) => this.capErr(`${prefix}.${name}`, data, error),
      scope: (sub) => this.scope(`${prefix}.${sub}`),
      flush: () => this.flush()
    };
  }
  /** Buffer length; the ring-buffer tests assert on it. */
  get bufferSize() {
    return __privateGet(this, _buffer).length;
  }
  flush() {
    if (__privateGet(this, _buffer).length === 0) return;
    const batch = __privateGet(this, _buffer).splice(0);
    const failed = (err) => console.error("[telemetry] transport.send failed:", err);
    try {
      void Promise.resolve(this.transport.send(batch)).catch(failed);
    } catch (err) {
      failed(err);
    }
  }
}
_buffer = new WeakMap();
function captureEvent(tel, name, data) {
  tel.capture({ type: "event", name, data });
}
const noOpTelemetry = {
  capture() {
  },
  capErr() {
  },
  scope() {
    return noOpTelemetry;
  },
  flush() {
  }
};

const KERNEL_BUS_SOURCE = "kernel";
const DEFAULT_REQUEST_TIMEOUT = 1e4;
async function invokeRpcHandler(handler, payload, meta) {
  return handler(payload, meta);
}
const FynBusRoot = function(telemetry) {
  const tel = telemetry ?? noOpTelemetry;
  const channels = /* @__PURE__ */ new Map();
  const facades = /* @__PURE__ */ new Map();
  let kernelFacade;
  const getChannel = (name) => {
    let state = channels.get(name);
    if (!state) {
      state = { events: new FynEventTarget(), handlers: /* @__PURE__ */ new Map(), waiters: /* @__PURE__ */ new Map() };
      channels.set(name, state);
    }
    return state;
  };
  const emitFrom = (source, channelName, topic, payload) => {
    const meta = Object.freeze({ topic, source, channel: channelName });
    captureEvent(tel, "emit", { topic, channel: channelName, source });
    const detail = { payload, meta };
    getChannel(channelName).events.dispatchEvent(new CustomEvent(topic, { detail }));
  };
  const subscribeFrom = (source, channelName, topic, handler, options, once, onAutoRemove) => {
    const { events } = getChannel(channelName);
    const signal = options?.signal;
    const onAbort = () => onAutoRemove?.();
    signal?.addEventListener("abort", onAbort, { once: true });
    const listener = (evt) => {
      const { payload, meta } = evt.detail;
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
        console.error(`FynBus: handler error on topic "${topic}"`, error);
        tel.capErr(
          "handler",
          { topic, channel: channelName, subscriber: source },
          error
        );
      }
    };
    const unsubscribe = () => {
      signal?.removeEventListener("abort", onAbort);
      events.removeEventListener(topic, listener);
    };
    events.addEventListener(topic, listener, { signal });
    return unsubscribe;
  };
  const requestFrom = (source, channelName, topic, payload, options, onCancel) => {
    let state = getChannel(channelName);
    const meta = Object.freeze({ topic, source, channel: channelName });
    const where = `FynBus: request "${topic}" on channel "${channelName}"`;
    const ctx = { topic, channel: channelName, source };
    captureEvent(tel, "request", ctx);
    const signal = options?.signal;
    return new Promise((resolve, reject) => {
      const abortError = () => new FynBusError(
        KernelErrorCode.BUS_REQUEST_ABORTED,
        `${where} aborted by caller`,
        ctx,
        signal?.reason
      );
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      let done = false;
      let timer;
      let removeWaiter;
      let removeAbort;
      let untrack;
      const settle = (finish) => {
        if (done) {
          return;
        }
        done = true;
        if (timer !== void 0) {
          clearTimeout(timer);
        }
        removeWaiter?.();
        removeAbort?.();
        untrack?.();
        finish();
      };
      const invoke = (handler) => {
        if (timer !== void 0) {
          clearTimeout(timer);
          timer = void 0;
        }
        invokeRpcHandler(handler, payload, meta).then(
          (value) => settle(() => resolve(value)),
          (error) => settle(() => reject(error))
        );
      };
      if (signal) {
        const onAbort = () => settle(() => reject(abortError()));
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbort = () => signal.removeEventListener("abort", onAbort);
      }
      if (onCancel) {
        untrack = onCancel(
          () => settle(
            () => reject(
              new FynBusError(
                KernelErrorCode.BUS_DISPOSED,
                `${where} cancelled \u2014 bus for "${source}" was disposed`,
                ctx
              )
            )
          )
        );
      }
      const existing = state.handlers.get(topic);
      if (existing) {
        invoke(existing);
        return;
      }
      let waiting = state.waiters.get(topic);
      if (!waiting) {
        waiting = /* @__PURE__ */ new Set();
        state.waiters.set(topic, waiting);
      }
      let set = waiting;
      const waiter = (handler) => invoke(handler);
      removeWaiter = () => {
        set.delete(waiter);
        if (set.size === 0 && state.waiters.get(topic) === set) {
          state.waiters.delete(topic);
        }
      };
      const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT;
      timer = setTimeout(() => {
        settle(
          () => reject(
            new FynBusError(
              KernelErrorCode.BUS_REQUEST_TIMEOUT,
              `${where} timed out after ${timeout}ms waiting for a handler`,
              { ...ctx, timeout }
            )
          )
        );
      }, timeout);
      set.add(waiter);
    });
  };
  const registerHandler = (source, channelName, topic, handler) => {
    let state = getChannel(channelName);
    if (state.handlers.has(topic)) {
      throw new FynBusError(
        KernelErrorCode.BUS_HANDLER_EXISTS,
        `FynBus: a handler is already registered for topic "${topic}" on channel "${channelName}"`,
        { topic, channel: channelName }
      );
    }
    state.handlers.set(topic, handler);
    captureEvent(tel, "handle", { topic, channel: channelName, source });
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
  };
  const forApp = (name, version) => {
    const key = version ? `${name}@${version}` : name;
    let facade = facades.get(key);
    if (!facade) {
      facade = FynBusFacade(self, name);
      facades.set(key, facade);
    }
    return facade;
  };
  const disposeApp = (name, version) => {
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
  const forKernel = () => {
    if (!kernelFacade) {
      kernelFacade = FynBusFacade(self, KERNEL_BUS_SOURCE);
    }
    return kernelFacade;
  };
  const self = {
    channels,
    facades,
    emitFrom,
    subscribeFrom,
    requestFrom,
    registerHandler,
    forApp,
    disposeApp,
    forKernel
  };
  return self;
};
const FynBusFacade = function(root, source, channelName = "", shared) {
  const state = shared ?? { subs: /* @__PURE__ */ new Set(), disposed: false };
  const assertActive = () => {
    if (state.disposed) {
      throw new FynBusError(
        KernelErrorCode.BUS_DISPOSED,
        `FynBus for "${source}" has been disposed`,
        { source, channel: channelName }
      );
    }
  };
  const track = (unsub) => {
    const tracked = () => {
      state.subs.delete(tracked);
      unsub();
    };
    state.subs.add(tracked);
    return tracked;
  };
  const subscribe = (topic, handler, options, once) => {
    let tracked;
    const raw = root.subscribeFrom(
      source,
      channelName,
      topic,
      handler,
      options,
      once,
      // Auto-removal (fired once / aborted signal) drops the tracking entry
      () => state.subs.delete(tracked)
    );
    tracked = track(raw);
    if (options?.signal?.aborted) {
      state.subs.delete(tracked);
    }
    return tracked;
  };
  const facade = {
    state,
    emit(topic, payload) {
      assertActive();
      root.emitFrom(source, channelName, topic, payload);
    },
    on(topic, handler, options) {
      assertActive();
      return subscribe(topic, handler, options, false);
    },
    once(topic, handler, options) {
      assertActive();
      return subscribe(topic, handler, options, true);
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
        }
      );
    },
    handle(topic, handler) {
      assertActive();
      return track(root.registerHandler(source, channelName, topic, handler));
    },
    channel(name) {
      assertActive();
      if (!name) {
        throw new FynBusError(
          KernelErrorCode.BUS_INVALID_CHANNEL,
          `FynBus: channel name must be a non-empty string`,
          { source }
        );
      }
      return FynBusFacade(root, source, name, state);
    },
    dispose() {
      state.disposed = true;
      for (const unsub of [...state.subs]) {
        unsub();
      }
      state.subs.clear();
    }
  };
  return facade;
};

export { BootstrapError, ConsoleTelemetryTransport, DEFAULT_REQUEST_TIMEOUT, FederationError, FynBusError, FynBusFacade, FynBusRoot, KERNEL_BUS_SOURCE, KernelError, KernelErrorCode, KernelTelemetryImpl, ManifestError, MiddlewareError, MiddlewareStateRegistry, ModuleLoadError, ObservableState, PreloadPriority, captureEvent, err, fynMeshShareScope, isError, isOk, noOpFynUnit, noOpMiddlewareUser, noOpTelemetry, ok, unwrap, unwrapOr, useMiddleware };
