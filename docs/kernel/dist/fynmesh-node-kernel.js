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

const fynMeshShareScope = "fynmesh";

const MIDDLEWARE_EXPOSE_PREFIX = "./middleware";
const MIDDLEWARE_EXPORT_PREFIX = "__middleware__";
function urlJoin(baseUrl, urlPath) {
  const fillSlash = urlPath.startsWith("/") || baseUrl.endsWith("/") ? "" : "/";
  return `${baseUrl}${fillSlash}${urlPath}`;
}
function isFynAppMiddlewareProvider(fynApp) {
  return Object.keys(fynApp.exposes).some((key) => key.startsWith(MIDDLEWARE_EXPOSE_PREFIX));
}
function getTargetMiddlewares(fynApp, autoApply) {
  if (!autoApply) return [];
  return isFynAppMiddlewareProvider(fynApp) ? autoApply.mw : autoApply.fynapp;
}
function findExecutionOverride(fynApp, fynUnit, autoApply) {
  return getTargetMiddlewares(fynApp, autoApply).find(
    (mwReg) => mwReg.mw.canOverrideExecution?.(fynApp, fynUnit)
  ) ?? null;
}
function createMiddlewareCallContext(mwReg, fynUnit, fynApp, runtime, kernel, config, status, info) {
  return {
    meta: {
      info: info ?? {
        name: mwReg.mw.name,
        provider: mwReg.hostFynApp.name,
        version: mwReg.hostFynApp.version
      },
      config: config ?? {}
    },
    fynUnit,
    fynApp,
    reg: mwReg,
    runtime,
    kernel,
    status: status ?? ""
  };
}
async function executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel) {
  console.debug(`\u{1F3AD} Middleware ${executionOverride.mw.name} is overriding execution for ${fynApp.name}`);
  const context = createMiddlewareCallContext(executionOverride, fynUnit, fynApp, runtime, kernel, {}, "ready");
  if (executionOverride.mw.overrideInitialize && fynUnit.initialize) {
    console.debug(`\u{1F3AD} Middleware overriding initialize for ${fynApp.name}`);
    const initResult = await executionOverride.mw.overrideInitialize(context);
    console.debug(`\u{1F3AD} Initialize result:`, initResult);
  }
  if (executionOverride.mw.overrideExecute && typeof fynUnit.execute === "function") {
    console.debug(`\u{1F3AD} Middleware overriding execute for ${fynApp.name}`);
    await executionOverride.mw.overrideExecute(context);
  }
}
function getFederation() {
  const Federation = globalThis.Federation;
  if (!Federation) {
    throw new Error("Federation.js is not loaded.");
  }
  return Federation;
}
async function parseMiddlewareString(middlewareStr, config, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency) {
  const parts = middlewareStr.trim().split(" ");
  if (parts.length < 3 || parts[0] !== "-FYNAPP_MIDDLEWARE") {
    return null;
  }
  const [, packageName, middlewarePath, semver] = parts;
  const middlewareName = middlewarePath.split("/").pop() || middlewarePath;
  console.debug("\u{1F50D} Middleware string - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");
  if (loadMiddlewareFromDependency) {
    await loadMiddlewareFromDependency(packageName, middlewarePath);
  }
  const reg = getMiddleware(middlewareName, packageName, { version: semver });
  if (reg.regKey === "") {
    console.debug("\u274C No middleware found for", middlewareName, packageName);
    return null;
  }
  return createMiddlewareCallContext(reg, fynUnit, fynApp, runtime, kernel, config, "", {
    name: middlewareName,
    provider: packageName,
    version: semver || "*"
  });
}

var __defProp$3 = Object.defineProperty;
var __typeError$3 = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp$3 = (obj, key, value) => key in obj ? __defProp$3(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$3 = (obj, key, value) => __defNormalProp$3(obj, key + "" , value);
var __accessCheck$3 = (obj, member, msg) => member.has(obj) || __typeError$3("Cannot " + msg);
var __privateGet$3 = (obj, member, getter) => (__accessCheck$3(obj, member, "read from private field"), member.get(obj));
var __privateAdd$3 = (obj, member, value) => member.has(obj) ? __typeError$3("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet$1 = (obj, member, value, setter) => (__accessCheck$3(obj, member, "write to private field"), member.set(obj, value), value);
var _observers, _disposed;
class ObservableState {
  constructor(initial) {
    __publicField$3(this, "value");
    __privateAdd$3(this, _observers, /* @__PURE__ */ new Set());
    __privateAdd$3(this, _disposed, false);
    this.value = initial;
  }
  /** Get current value */
  get() {
    if (__privateGet$3(this, _disposed)) {
      throw new Error("Cannot get value from disposed ObservableState");
    }
    return this.value;
  }
  /** Set new value and notify observers */
  set(value) {
    if (__privateGet$3(this, _disposed)) return;
    const prev = this.value;
    this.value = value;
    __privateGet$3(this, _observers).forEach((fn) => {
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
    if (__privateGet$3(this, _disposed)) {
      throw new Error("Cannot subscribe to disposed ObservableState");
    }
    fn(this.value, void 0);
    __privateGet$3(this, _observers).add(fn);
    return () => __privateGet$3(this, _observers).delete(fn);
  }
  /** Dispose state and clear all observers */
  dispose() {
    __privateSet$1(this, _disposed, true);
    __privateGet$3(this, _observers).clear();
  }
}
_observers = new WeakMap();
_disposed = new WeakMap();

var __typeError$2 = (msg) => {
  throw TypeError(msg);
};
var __accessCheck$2 = (obj, member, msg) => member.has(obj) || __typeError$2("Cannot " + msg);
var __privateGet$2 = (obj, member, getter) => (__accessCheck$2(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd$2 = (obj, member, value) => member.has(obj) ? __typeError$2("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck$2(obj, member, "write to private field"), member.set(obj, value), value);
var _parent, _states, _pendingWaiters;
const _MiddlewareStateRegistry = class _MiddlewareStateRegistry {
  constructor(parent) {
    __privateAdd$2(this, _parent);
    __privateAdd$2(this, _states, /* @__PURE__ */ new Map());
    __privateAdd$2(this, _pendingWaiters, /* @__PURE__ */ new Map());
    __privateSet(this, _parent, parent);
  }
  /**
   * Provide/register state in this scope.
   * @param key Unique key for this state
   * @param initial Initial value
   * @returns ObservableState for updates
   */
  provide(key, initial) {
    if (__privateGet$2(this, _states).has(key)) {
      return __privateGet$2(this, _states).get(key);
    }
    const state = new ObservableState(initial);
    __privateGet$2(this, _states).set(key, state);
    const waiters = __privateGet$2(this, _pendingWaiters).get(key);
    if (waiters) {
      waiters.forEach(({ resolve }) => resolve(state));
      __privateGet$2(this, _pendingWaiters).delete(key);
    }
    return state;
  }
  /**
   * Lookup state by key. Walks up hierarchy if not found locally.
   * @param key State key to find
   * @returns ObservableState or undefined if not found
   */
  lookup(key) {
    if (__privateGet$2(this, _states).has(key)) {
      return __privateGet$2(this, _states).get(key);
    }
    return __privateGet$2(this, _parent)?.lookup(key);
  }
  /**
   * Check if state exists in this scope or parent scopes.
   */
  has(key) {
    if (__privateGet$2(this, _states).has(key)) return true;
    return __privateGet$2(this, _parent)?.has(key) ?? false;
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
        const waiters2 = __privateGet$2(this, _pendingWaiters).get(key);
        const idx = waiters2?.indexOf(waiter) ?? -1;
        if (idx >= 0) {
          waiters2.splice(idx, 1);
          if (waiters2.length === 0) __privateGet$2(this, _pendingWaiters).delete(key);
        }
        reject(new Error(`Timeout waiting for state: ${key}`));
      }, timeout);
      const waiters = __privateGet$2(this, _pendingWaiters).get(key);
      if (waiters) {
        waiters.push(waiter);
      } else {
        __privateGet$2(this, _pendingWaiters).set(key, [waiter]);
      }
    });
  }
  /**
   * Remove state from this scope.
   * @param key State key to remove
   * @returns true if removed, false if not found
   */
  remove(key) {
    const state = __privateGet$2(this, _states).get(key);
    if (state) {
      state.dispose();
      __privateGet$2(this, _states).delete(key);
      return true;
    }
    return false;
  }
  /**
   * Clear all state in this scope.
   */
  clear() {
    __privateGet$2(this, _states).forEach((state) => state.dispose());
    __privateGet$2(this, _states).clear();
    __privateGet$2(this, _pendingWaiters).forEach((waiters, key) => {
      waiters.forEach(({ reject }) => reject(new Error(`Registry cleared while waiting for: ${key}`)));
    });
    __privateGet$2(this, _pendingWaiters).clear();
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
    return Array.from(__privateGet$2(this, _states).keys());
  }
  /**
   * Get parent registry if exists.
   */
  getParent() {
    return __privateGet$2(this, _parent);
  }
};
_parent = new WeakMap();
_states = new WeakMap();
_pendingWaiters = new WeakMap();
let MiddlewareStateRegistry = _MiddlewareStateRegistry;

var __defProp$2 = Object.defineProperty;
var __defNormalProp$2 = (obj, key, value) => key in obj ? __defProp$2(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$2 = (obj, key, value) => __defNormalProp$2(obj, typeof key !== "symbol" ? key + "" : key, value);
const KernelErrorCode = {
  EXPOSE_MODULE_NOT_FOUND: 1003,
  DEPENDENCY_NOT_FOUND: 1004,
  // Middleware Errors (2xxx)
  MIDDLEWARE_NOT_FOUND: 2001,
  MIDDLEWARE_SETUP_FAILED: 2002,
  MIDDLEWARE_APPLY_FAILED: 2003,
  MIDDLEWARE_FILTER_ERROR: 2004,
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

var __defProp$1 = Object.defineProperty;
var __typeError$1 = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck$1 = (obj, member, msg) => member.has(obj) || __typeError$1("Cannot " + msg);
var __privateGet$1 = (obj, member, getter) => (__accessCheck$1(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd$1 = (obj, member, value) => member.has(obj) ? __typeError$1("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var _buffer;
const DEFAULT_MAX_BUFFER_SIZE = 500;
class ConsoleTelemetryTransport {
  async send(batch) {
    console.log("[telemetry]", batch);
  }
}
class KernelTelemetryImpl {
  constructor(config) {
    __privateAdd$1(this, _buffer, []);
    __publicField$1(this, "transport");
    __publicField$1(this, "maxBufferSize");
    this.transport = config?.transport ?? new ConsoleTelemetryTransport();
    this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
  }
  capture(entry) {
    const full = { ...entry, ts: Date.now() };
    if (__privateGet$1(this, _buffer).length >= this.maxBufferSize) {
      __privateGet$1(this, _buffer).shift();
    }
    __privateGet$1(this, _buffer).push(full);
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
    return __privateGet$1(this, _buffer).length;
  }
  flush() {
    if (__privateGet$1(this, _buffer).length === 0) return;
    const batch = __privateGet$1(this, _buffer).splice(0);
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

const ManifestResolver = function(telemetry) {
  const tel = telemetry ?? noOpTelemetry;
  const manifestCache = /* @__PURE__ */ new Map();
  const nodeMeta = /* @__PURE__ */ new Map();
  const preloadedEntries = /* @__PURE__ */ new Map();
  let registryResolver;
  let preloadCallback;
  const calculateDistBase = (res) => res.distBase || new URL(res.url, location.href).pathname.replace(/\/[^/]*$/, "/");
  const preloadEntryFile = (distBase, depth) => {
    const entryUrl = `${distBase}fynapp-entry.js`;
    if (preloadedEntries.has(entryUrl)) {
      return;
    }
    preloadedEntries.set(entryUrl, depth);
    if (preloadCallback) {
      console.debug(`\u26A1 Preloading entry file: ${entryUrl} (depth: ${depth})`);
      preloadCallback(entryUrl, depth);
    }
  };
  const updateNodeMeta = (key, res, manifest) => {
    nodeMeta.set(key, {
      name: res.name,
      version: manifest.version || res.version,
      url: res.url,
      distBase: calculateDistBase(res)
    });
  };
  const reportResolved = (t0, name, version) => {
    tel.capture({ type: "metric", name: "resolve.duration", value: Date.now() - t0, data: { name } });
    captureEvent(tel, "resolved", { name, version });
  };
  const cacheResolved = (t0, name, res, manifest) => {
    const version = manifest.version || res.version;
    const key = `${res.name}@${version}`;
    manifestCache.set(key, manifest);
    updateNodeMeta(key, res, manifest);
    reportResolved(t0, name, version);
    return { key, res, manifest };
  };
  const fetchJson = async (url) => {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  };
  const resolveAndFetch = async (name, range) => {
    const t0 = Date.now();
    if (!registryResolver) {
      throw new Error("No registry resolver configured");
    }
    const res = await registryResolver(name, range);
    const resolvedVersion = res.version;
    const cacheKey = `${res.name}@${resolvedVersion}`;
    const cached = manifestCache.get(cacheKey);
    if (cached) {
      updateNodeMeta(cacheKey, { ...res, version: resolvedVersion }, cached);
      reportResolved(t0, name, cached.version || resolvedVersion);
      return { key: cacheKey, res, manifest: cached };
    }
    try {
      const entryUrl = res.url.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
      const entryModule = await getFederation().import(entryUrl);
      if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
        return cacheResolved(t0, name, res, entryModule.__FYNAPP_MANIFEST__);
      }
    } catch (embeddedErr) {
    }
    let manifest;
    try {
      manifest = await fetchJson(res.url);
    } catch (err1) {
      try {
        manifest = await fetchJson(
          res.url.replace(/fynapp\.manifest\.json$/, "federation.json")
        );
      } catch (err2) {
        manifest = { name, version: res.version, requires: [] };
      }
    }
    return cacheResolved(t0, name, res, manifest);
  };
  const buildGraph = async (requests) => {
    const adj = /* @__PURE__ */ new Map();
    const indegree = /* @__PURE__ */ new Map();
    const nodes = /* @__PURE__ */ new Set();
    const visit = async (name, range, parentKey, depth = 0) => {
      const { key, manifest } = await resolveAndFetch(name, range);
      const isNewNode = !nodes.has(key);
      if (isNewNode) {
        nodes.add(key);
        indegree.set(key, indegree.get(key) ?? 0);
      }
      if (parentKey) {
        const set = adj.get(key) || /* @__PURE__ */ new Set();
        if (!set.has(parentKey)) {
          set.add(parentKey);
          adj.set(key, set);
          indegree.set(parentKey, (indegree.get(parentKey) ?? 0) + 1);
        }
      }
      if (!isNewNode) {
        return key;
      }
      const visitDep = async (depName, semver) => {
        preloadEntryFile(calculateDistBase(await registryResolver(depName, semver)), depth + 1);
        await visit(depName, semver, key, depth + 1);
      };
      for (const req of manifest.requires || []) {
        await visitDep(req.name, req.range);
      }
      const importExposed = manifest["import-exposed"];
      if (importExposed && typeof importExposed === "object") {
        for (const [packageName, modules] of Object.entries(importExposed)) {
          let semver;
          if (modules && typeof modules === "object") {
            for (const moduleInfo of Object.values(modules)) {
              if (moduleInfo && typeof moduleInfo === "object" && "semver" in moduleInfo) {
                semver = moduleInfo.semver;
                break;
              }
            }
          }
          await visitDep(packageName, semver);
        }
      }
      const sharedProviders = manifest["shared-providers"];
      if (sharedProviders && typeof sharedProviders === "object") {
        console.debug(`\u{1F4E6} Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
        for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
          let semver;
          if (providerInfo && typeof providerInfo === "object" && "semver" in providerInfo) {
            semver = providerInfo.semver;
          }
          console.debug(`  \u2192 Loading shared provider: ${packageName}@${semver || "latest"}`);
          await visitDep(packageName, semver);
        }
      }
      return key;
    };
    for (const r of requests) {
      await visit(r.name, r.range);
    }
    console.debug("buildGraph completed, nodes:", Array.from(nodes));
    captureEvent(tel, "graph.built", { nodes: nodes.size });
    return { nodes, adj, indegree };
  };
  const topoBatches = (graph) => {
    const { nodes, adj } = graph;
    const indegree = new Map(graph.indegree);
    const q = [];
    for (const n of nodes) {
      if ((indegree.get(n) ?? 0) === 0) q.push(n);
    }
    const order = [];
    const batches = [];
    while (q.length) {
      const batch = q.splice(0, q.length);
      batches.push(batch);
      for (const u of batch) {
        order.push(u);
        for (const v of adj.get(u) ?? []) {
          indegree.set(v, (indegree.get(v) ?? 0) - 1);
          if ((indegree.get(v) ?? 0) === 0) q.push(v);
        }
      }
    }
    if (order.length < nodes.size) {
      const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
      console.warn(`\u26A0\uFE0F Dependency cycle detected among: ${cyclic.join(", ")} - proceeding with best-effort loading`);
      batches.push(cyclic);
    }
    return batches;
  };
  return {
    // Exposed because the manifest-resolution tests seed and assert them
    // directly; they are the caching behaviour those tests exist to cover.
    manifestCache,
    nodeMeta,
    setRegistryResolver: (resolver) => {
      registryResolver = resolver;
    },
    setPreloadCallback: (callback) => {
      preloadCallback = callback;
    },
    async warmPreload(requests) {
      if (!preloadCallback || !registryResolver) return;
      for (const r of requests) {
        preloadEntryFile(calculateDistBase(await registryResolver(r.name, r.range)), 0);
      }
    },
    getDistBase: calculateDistBase,
    resolveAndFetch,
    buildGraph,
    topoBatches
  };
};

const DEFAULT_BOOTSTRAP_TIMEOUT = 3e4;
const BootstrapCoordinator = function(events, timeoutMs, telemetry) {
  const tel = telemetry ?? noOpTelemetry;
  const deferredBootstraps = [];
  const fynAppBootstrapStatus = /* @__PURE__ */ new Map();
  const fynAppProviderModes = /* @__PURE__ */ new Map();
  let bootstrappingApp = null;
  let timeout = timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT;
  const findProviderForMiddleware = (middlewareName, excludeFynApp) => {
    for (const [fynAppName, modes] of fynAppProviderModes.entries()) {
      if (fynAppName === excludeFynApp) continue;
      if (modes.get(middlewareName) === "provider") {
        return fynAppName;
      }
    }
    return null;
  };
  const areBootstrapDependenciesSatisfied = (fynApp) => {
    let modes = fynAppProviderModes.get(fynApp.name);
    if (!modes) {
      return true;
    }
    for (const [middlewareName, mode] of modes.entries()) {
      if (mode === "consumer") {
        const providerName = findProviderForMiddleware(middlewareName, fynApp.name);
        if (providerName && !fynAppBootstrapStatus.has(providerName)) {
          console.debug(
            `\u23F3 ${fynApp.name} waiting for provider ${providerName} to bootstrap (mw: ${middlewareName})`
          );
          return false;
        }
      }
    }
    return true;
  };
  const finishBootstrapAndResumeNext = () => {
    bootstrappingApp = null;
    const nextIndex = deferredBootstraps.findIndex(
      (d) => areBootstrapDependenciesSatisfied(d.fynApp)
    );
    if (nextIndex >= 0) {
      const next = deferredBootstraps.splice(nextIndex, 1)[0];
      console.debug(`\u{1F504} Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
      captureEvent(tel, "resumed", { app: next.fynApp.name });
      next.resolve();
    } else if (deferredBootstraps.length > 0) {
      console.debug(`\u23F8\uFE0F ${deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`);
    }
  };
  events.on("FYNAPP_BOOTSTRAPPED", (event) => {
    const { name } = event.detail;
    console.debug(`\u2705 FynApp ${name} bootstrap complete, checking deferred bootstraps`);
    captureEvent(tel, "completed", { app: name });
    fynAppBootstrapStatus.set(name, "bootstrapped");
    finishBootstrapAndResumeNext();
  });
  events.on("FYNAPP_BOOTSTRAP_FAILED", (event) => {
    const { name, error } = event.detail;
    console.debug(`\u274C FynApp ${name} bootstrap failed, checking deferred bootstraps`);
    if (error) {
      tel.capErr("failed", { app: name }, error);
    } else {
      tel.capture({ type: "error", name: "failed", data: { app: name } });
    }
    finishBootstrapAndResumeNext();
  });
  return {
    events,
    deferredBootstraps,
    fynAppBootstrapStatus,
    fynAppProviderModes,
    areBootstrapDependenciesSatisfied,
    findProviderForMiddleware,
    get bootstrappingApp() {
      return bootstrappingApp;
    },
    set bootstrappingApp(value) {
      bootstrappingApp = value;
    },
    setTimeout(value) {
      timeout = value;
    },
    canBootstrap: (fynApp) => bootstrappingApp === null && areBootstrapDependenciesSatisfied(fynApp),
    acquireBootstrapLock(fynAppName) {
      if (bootstrappingApp !== null) {
        return false;
      }
      bootstrappingApp = fynAppName;
      console.debug(`\u{1F512} ${fynAppName} acquired bootstrap lock`);
      captureEvent(tel, "lock.acquired", { app: fynAppName });
      return true;
    },
    releaseBootstrapLock() {
      bootstrappingApp = null;
    },
    /**
     * Defer a bootstrap until dependencies are ready.
     * If timeout is reached, the FynApp is skipped with an error.
     */
    deferBootstrap(fynApp) {
      const reason = bootstrappingApp !== null ? `${bootstrappingApp} is currently bootstrapping` : `waiting for provider dependencies`;
      console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name} (${reason})`);
      captureEvent(tel, "deferred", { app: fynApp.name, reason });
      return new Promise((resolve) => {
        const deferred = {
          fynApp,
          resolve: () => {
            if (deferred.timeoutId) {
              clearTimeout(deferred.timeoutId);
            }
            resolve();
          }
        };
        deferred.timeoutId = setTimeout(() => {
          const idx = deferredBootstraps.indexOf(deferred);
          if (idx >= 0) {
            deferredBootstraps.splice(idx, 1);
          }
          const message = `Bootstrap timeout (${timeout}ms): ${fynApp.name} timed out waiting for ${reason}`;
          console.error(`\u23F0 ${message}. Skipping this FynApp - the party goes on!`);
          tel.capErr(
            "timeout",
            { app: fynApp.name, timeout, reason },
            new Error(message)
          );
          events.dispatchEvent(
            new CustomEvent("FYNAPP_BOOTSTRAP_TIMEOUT", {
              detail: { name: fynApp.name, version: fynApp.version, reason, timeout }
            })
          );
          resolve();
        }, timeout);
        deferredBootstraps.push(deferred);
      });
    },
    registerProviderMode(fynAppName, middlewareName, mode) {
      let modes = fynAppProviderModes.get(fynAppName);
      if (!modes) {
        modes = /* @__PURE__ */ new Map();
        fynAppProviderModes.set(fynAppName, modes);
      }
      modes.set(middlewareName, mode);
      console.debug(`\u{1F4DD} ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
    },
    clear() {
      bootstrappingApp = null;
      for (const deferred of deferredBootstraps) {
        if (deferred.timeoutId) {
          clearTimeout(deferred.timeoutId);
        }
      }
      deferredBootstraps.length = 0;
      fynAppBootstrapStatus.clear();
      fynAppProviderModes.clear();
    }
  };
};

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;
const parse = (version) => {
  const m = VERSION_RE.exec(version.trim());
  if (!m) {
    return void 0;
  }
  const specified = m[3] !== void 0 ? 3 : m[2] !== void 0 ? 2 : 1;
  return {
    parts: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)],
    specified,
    pre: m[4] ?? ""
  };
};
const comparePre = (a, b) => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const as = a.split(".");
  const bs = b.split(".");
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const x = as[i];
    const y = bs[i];
    if (x === void 0) return -1;
    if (y === void 0) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
};
const compareParsed = (a, b) => {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] !== b.parts[i]) {
      return a.parts[i] < b.parts[i] ? -1 : 1;
    }
  }
  return comparePre(a.pre, b.pre);
};
const compareVersions = (a, b) => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  return compareParsed(pa, pb);
};
const isWildcard = (range) => {
  const r = range.trim();
  return r === "" || r === "*" || r === "x" || r === "X";
};
const caretLimit = (v) => {
  if (v.parts[0] !== 0) return [v.parts[0] + 1, 0, 0];
  if (v.parts[1] !== 0 || v.specified < 2) return [0, v.parts[1] + 1, 0];
  return [0, 0, v.parts[2] + 1];
};
const tildeLimit = (v) => {
  if (v.specified === 1) return [v.parts[0] + 1, 0, 0];
  return [v.parts[0], v.parts[1] + 1, 0];
};
const asBound = (parts) => ({
  parts,
  specified: 3,
  pre: ""
});
const PLACEHOLDER_RE = /^(x|X|\*)$/;
const normalizeOperand = (raw) => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return trimmed;
  }
  const [core, ...suffix] = trimmed.split(/(?=[-+])/);
  const segments = core.split(".");
  const kept = [];
  for (const segment of segments) {
    if (PLACEHOLDER_RE.test(segment)) {
      break;
    }
    kept.push(segment);
  }
  if (kept.length === 0) {
    return "*";
  }
  return kept.length === segments.length ? kept.join(".") + suffix.join("") : kept.join(".");
};
const COMPARATOR_RE = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/;
const satisfiesComparator = (v, comparator) => {
  const raw = comparator.trim();
  if (isWildcard(raw)) {
    return true;
  }
  const m = COMPARATOR_RE.exec(raw);
  if (!m) {
    return void 0;
  }
  const op = m[1] ?? "=";
  const operandStr = normalizeOperand(m[2]);
  if (isWildcard(operandStr)) {
    return true;
  }
  const operand = parse(operandStr);
  if (!operand) {
    return void 0;
  }
  switch (op) {
    case "^":
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(caretLimit(operand))) < 0;
    case "~":
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(tildeLimit(operand))) < 0;
    case ">":
      return compareParsed(v, operand) > 0;
    case ">=":
      return compareParsed(v, operand) >= 0;
    case "<":
      return compareParsed(v, operand) < 0;
    case "<=":
      return compareParsed(v, operand) <= 0;
    default: {
      if (operand.specified === 3) {
        return compareParsed(v, operand) === 0;
      }
      const upper = operand.specified === 1 ? [operand.parts[0] + 1, 0, 0] : [operand.parts[0], operand.parts[1] + 1, 0];
      return compareParsed(v, operand) >= 0 && compareParsed(v, asBound(upper)) < 0;
    }
  }
};
const alternatives = (range) => range.split("||").map((alt) => alt.trim().split(/\s+/).filter(Boolean)).map((parts) => parts.length === 0 ? ["*"] : parts);
const isSupportedRange = (range) => {
  if (typeof range !== "string") {
    return false;
  }
  if (isWildcard(range)) {
    return true;
  }
  const probe = parse("0.0.0");
  return alternatives(range).every(
    (alt) => alt.every((comparator) => satisfiesComparator(probe, comparator) !== void 0)
  );
};
const satisfiesRange = (version, range) => {
  const v = parse(version);
  if (!v) {
    return false;
  }
  if (isWildcard(range)) {
    return true;
  }
  return alternatives(range).some(
    (alt) => alt.every((comparator) => satisfiesComparator(v, comparator) === true)
  );
};
const maxSatisfying = (versions, range) => {
  let best;
  for (const version of versions) {
    if (satisfiesRange(version, range) && (best === void 0 || compareVersions(version, best) > 0)) {
      best = version;
    }
  }
  return best;
};

const DummyMiddlewareReg = {
  regKey: ""
};
const MiddlewareManager = function(telemetry) {
  const tel = telemetry ?? noOpTelemetry;
  const scannedModules = /* @__PURE__ */ new Set();
  const ambiguousDefaultWarned = /* @__PURE__ */ new Set();
  let middlewares = {};
  let autoApply;
  const registerMiddleware = (mwReg) => {
    const { regKey, hostFynApp } = mwReg;
    const versionMap = middlewares[regKey] || /* @__PURE__ */ Object.create(null);
    if (versionMap[hostFynApp.version]) {
      console.debug(
        `\u26A0\uFE0F Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`
      );
      return;
    }
    console.log(`\u{1F527} Registering mw: ${regKey}, autoApplyScope:`, mwReg.mw.autoApplyScope);
    versionMap[hostFynApp.version] = mwReg;
    if (!versionMap.default) {
      versionMap.default = mwReg;
    } else if (!ambiguousDefaultWarned.has(regKey)) {
      ambiguousDefaultWarned.add(regKey);
      const others = Object.keys(versionMap).filter(
        (key) => key !== "default" && key !== versionMap.default.hostFynApp.version
      );
      console.warn(
        `\u26A0\uFE0F Middleware '${regKey}' now has more than one version registered. A lookup that asks for no version resolves to the first version registered (${versionMap.default.hostFynApp.version}), not the highest; also registered: ${others.join(", ")}. Declare a version range on the middleware to choose deliberately.`
      );
    }
    middlewares[regKey] = versionMap;
    const autoApplyScope = mwReg.mw.autoApplyScope || [];
    if (autoApplyScope.length > 0) {
      if (!autoApply) {
        autoApply = { fynapp: [], mw: [] };
      }
      if (autoApplyScope.includes("all") || autoApplyScope.includes("fynapp")) {
        autoApply.fynapp.push(mwReg);
      }
      if (autoApplyScope.includes("all") || autoApplyScope.includes("middleware")) {
        autoApply.mw.push(mwReg);
      }
      console.debug(`\u{1F3AF} Registered auto-apply middleware for [${autoApplyScope.join(", ")}]: ${regKey}@${hostFynApp.version}`);
    } else {
      console.debug(`\u2705 Registered explicit-use mw: ${regKey}@${hostFynApp.version}`);
    }
    captureEvent(tel, "registered", { key: regKey, version: hostFynApp.version, autoApply: autoApplyScope.length > 0 });
  };
  const hasScannedModule = (scanCacheKey) => scannedModules.has(scanCacheKey);
  const resolveFromVersionMap = (versionMap, regKey, wanted) => {
    const fallback = versionMap.default;
    if (!wanted || wanted === "*" || wanted.trim() === "") {
      return fallback;
    }
    if (wanted !== "default" && versionMap[wanted]) {
      return versionMap[wanted];
    }
    const registered = Object.keys(versionMap).filter((key) => key !== "default");
    if (!isSupportedRange(wanted)) {
      console.warn(
        `\u26A0\uFE0F Middleware '${regKey}': '${wanted}' is not a version range this kernel can read (registered: ${registered.join(", ") || "none"}). Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}).`
      );
      return fallback;
    }
    const best = maxSatisfying(registered, wanted);
    if (best) {
      return versionMap[best];
    }
    console.warn(
      `\u26A0\uFE0F Middleware version mismatch for '${regKey}': asked for '${wanted}', but the registered version(s) are ${registered.join(", ") || "none"}. Falling back to the default version (${fallback?.hostFynApp.version ?? "none"}), so this FynApp will run a version of the middleware it did not ask for.`
    );
    return fallback;
  };
  return {
    registerMiddleware,
    getMiddleware(name, provider, opts) {
      const wanted = opts?.version;
      if (provider) {
        const key = `${provider}::${name}`;
        const versionMap = middlewares[key];
        if (versionMap) {
          const mwReg = resolveFromVersionMap(versionMap, key, wanted);
          if (mwReg) {
            return mwReg;
          }
        }
      }
      const matches = [];
      for (const key of Object.keys(middlewares)) {
        if (key.endsWith(`::${name}`)) {
          matches.push(key);
        }
      }
      for (const key of matches) {
        const mwReg = resolveFromVersionMap(middlewares[key], key, wanted);
        if (mwReg) {
          if (matches.length > 1) {
            console.error(
              `\u274C Middleware '${name}' is registered by more than one provider (${matches.join(", ")}), and this lookup named no provider, so the kernel used '${key}'. Name the provider on the middleware declaration to pin which one runs.`
            );
          }
          return mwReg;
        }
      }
      return DummyMiddlewareReg;
    },
    getAutoApply: () => autoApply,
    scanAndRegisterMiddleware(fynApp, exposeName, exposedModule) {
      const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;
      if (hasScannedModule(scanCacheKey)) {
        console.debug(
          `\u23ED\uFE0F  Skipping middleware scan for '${exposeName}' - already scanned for`,
          fynApp.name,
          fynApp.version
        );
        return [];
      }
      scannedModules.add(scanCacheKey);
      const mwExports = [];
      for (const [exportName, exportValue] of Object.entries(exposedModule)) {
        if (exportName.startsWith(MIDDLEWARE_EXPORT_PREFIX)) {
          const mw = exportValue;
          const mwName = mw.name;
          registerMiddleware({
            regKey: `${fynApp.name}::${mwName}`,
            fullKey: `${fynApp.name}@${fynApp.version}::${mwName}`,
            hostFynApp: fynApp,
            exposeName,
            exportName,
            mw
          });
          mwExports.push(exportName);
        }
      }
      console.debug(
        `\u2705 Expose module '${exposeName}' loaded for`,
        fynApp.name,
        fynApp.version,
        mwExports.length > 0 ? "middlewares registered:" : "",
        mwExports.join(", ")
      );
      captureEvent(tel, "scan.completed", { app: fynApp.name, expose: exposeName, count: mwExports.length });
      return mwExports;
    },
    initializeFromRuntime(runtime) {
      if (runtime.middlewares) {
        middlewares = runtime.middlewares;
      }
      if (runtime.autoApply) {
        autoApply = runtime.autoApply;
      }
    },
    exportToRuntime: () => ({
      middlewares,
      autoApply
    }),
    clear() {
      middlewares = {};
      autoApply = void 0;
      scannedModules.clear();
      ambiguousDefaultWarned.clear();
    }
  };
};

const ModuleLoader = function(telemetry, busProvider) {
  const tel = telemetry ?? noOpTelemetry;
  const loadExposeModule = async (fynApp, exposeName, loadMiddlewares, middlewareScanner) => {
    const container = fynApp.entry.container;
    if (!container?.$E[exposeName]) {
      const error = new ModuleLoadError(
        KernelErrorCode.EXPOSE_MODULE_NOT_FOUND,
        `No expose module '${exposeName}' found for ${fynApp.name}@${fynApp.version}`,
        {
          fynAppName: fynApp.name,
          fynAppVersion: fynApp.version,
          exposeName
        }
      );
      tel.capErr(
        "expose.not_found",
        { app: fynApp.name, expose: exposeName },
        error
      );
      console.debug(`\u274C ${error.message}`);
      return err(error);
    }
    const factory = await fynApp.entry.get(exposeName);
    const exposedModule = typeof factory === "function" ? factory() : void 0;
    if (loadMiddlewares && exposedModule && typeof exposedModule === "object") {
      if (middlewareScanner) {
        middlewareScanner(fynApp, exposeName, exposedModule);
      }
      fynApp.exposes[exposeName] = exposedModule;
      if (exposedModule.__name) {
        fynApp.exposes[exposedModule.__name] = exposedModule;
      }
      return ok(exposedModule);
    }
    return ok(exposedModule);
  };
  const loadMiddlewareFromDependency = async (packageName, middlewarePath, apps, middlewareScanner) => {
    console.debug(`\u{1F4E6} Loading middleware from dependency: ${packageName}/${middlewarePath}`);
    const dependencyApp = apps.get(packageName);
    if (!dependencyApp) {
      const error = new ModuleLoadError(
        KernelErrorCode.DEPENDENCY_NOT_FOUND,
        `Dependency package ${packageName} not found in runtime`,
        {
          fynAppName: packageName,
          exposeName: middlewarePath
        }
      );
      tel.capErr(
        "dependency.not_found",
        { package: packageName, path: middlewarePath },
        error
      );
      console.debug(`\u274C ${error.message}`);
      return err(error);
    }
    const lastSlashIndex = middlewarePath.lastIndexOf("/");
    const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
    const exposeName = `./${exposeModule}`;
    console.debug(`\u{1F4E6} Loading middleware module ${exposeName} from ${packageName} (full path: ${middlewarePath})`);
    const result = await loadExposeModule(dependencyApp, exposeName, true, middlewareScanner);
    if (!result.success) {
      return err(result.error);
    }
    return ok(void 0);
  };
  const loadFynAppBasics = async (fynAppEntry, apps, middlewareScanner) => {
    const container = fynAppEntry.container;
    if (!container?.name || !container?.version) {
      throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
    }
    if (container.$SS) {
      console.debug("\u{1F680} FynApp entry already initialized", container.name, container.version);
    } else {
      console.debug("\u{1F680} Initializing FynApp entry", container.name, container.version);
      fynAppEntry.init();
    }
    captureEvent(tel, "fynapp.init", { app: container.name, version: container.version });
    console.debug("\u{1F680} Loading FynApp basics for", container.name, container.version);
    const fynApp = {
      name: container.name,
      version: container.version || "1.0.0",
      packageName: container.name,
      entry: fynAppEntry,
      middlewareContext: /* @__PURE__ */ new Map(),
      exposes: {}
    };
    if (container && container.$E["./config"]) {
      const factory = await fynAppEntry.get("./config");
      fynApp.config = factory();
    }
    if (fynAppEntry.setup) {
      console.debug("\u{1F680} Invoking entry.setup for", fynApp.name, fynApp.version);
      await fynAppEntry.setup();
    }
    const mainResult = await loadExposeModule(fynApp, "./main", true, middlewareScanner);
    if (!mainResult.success) {
      console.debug(`\u26A0\uFE0F Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
    }
    const manifest = container.__FYNAPP_MANIFEST__ || null;
    const importExposed = manifest?.["import-exposed"];
    if (importExposed && typeof importExposed === "object") {
      console.debug("\u{1F4E6} Loading middleware dependencies for", fynApp.name);
      const loadErrors = [];
      for (const [packageName, modules] of Object.entries(importExposed)) {
        if (modules && typeof modules === "object") {
          for (const [modulePath, moduleInfo] of Object.entries(modules)) {
            if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
              console.debug(`\u{1F4E6} Proactively loading mw: ${packageName}/${modulePath}`);
              const depResult = await loadMiddlewareFromDependency(
                packageName,
                modulePath,
                apps,
                middlewareScanner
              );
              if (!depResult.success) {
                loadErrors.push(depResult.error);
              }
            }
          }
        }
      }
      if (loadErrors.length > 0) {
        console.debug(
          `\u26A0\uFE0F ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`,
          loadErrors.map((e) => e.message)
        );
      }
    }
    console.debug("\u2705 FynApp basics loaded for", fynApp.name, fynApp.version);
    captureEvent(tel, "fynapp.basics_loaded", { app: fynApp.name, version: fynApp.version });
    apps.add(fynApp);
    return fynApp;
  };
  const mkRuntime = (fynApp) => {
    return {
      fynApp,
      // Reuse the FynApp's middlewareContext to maintain consistency
      // This is critical for deferred loading scenarios where middlewares are resumed
      middlewareContext: fynApp.middlewareContext || /* @__PURE__ */ new Map(),
      bus: busProvider?.(fynApp)
    };
  };
  const invokeFynUnit = async (fynUnit, fynApp, autoApply, kernel) => {
    const runtime = mkRuntime(fynApp);
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);
    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
      return;
    }
    if (fynUnit.initialize) {
      console.debug("\u{1F680} Invoking unit.initialize for", fynApp.name, fynApp.version);
      const initResult = await fynUnit.initialize(runtime);
      console.debug("\u{1F680} Initialize result:", initResult);
    }
    if (fynUnit.execute) {
      console.debug("\u{1F680} Invoking unit.execute for", fynApp.name, fynApp.version);
      captureEvent(tel, "fynunit.execute", { app: fynApp.name });
      const executeResult = await fynUnit.execute(runtime);
      if (executeResult) {
        console.debug(`\u{1F4E6} FynUnit returned result:`, typeof executeResult === "object" ? executeResult.type : typeof executeResult);
      }
    }
  };
  return { loadExposeModule, loadMiddlewareFromDependency, loadFynAppBasics, mkRuntime, invokeFynUnit };
};

const noOpFynUnit = {
  initialize: () => ({ status: "ready" }),
  execute: () => {
  }
};

function deferKeyOf(ccs) {
  return ccs.map((c) => c.reg.fullKey).sort().join("|");
}
function middlewareFailure(code, summary, mwReg, fynApp, error) {
  const cause = error instanceof Error ? error : void 0;
  const mwError = new MiddlewareError(code, `${summary}: ${cause ? cause.message : String(error)}`, {
    middlewareName: mwReg.mw.name,
    provider: mwReg.hostFynApp.name,
    fynAppName: fynApp.name,
    cause
  });
  console.error(`\u274C ${mwError.message}`);
  return mwError;
}
const MiddlewareExecutor = function(telemetry) {
  const tel = telemetry ?? noOpTelemetry;
  const middlewareReady = /* @__PURE__ */ new Map();
  let deferInvoke = [];
  const initializedRuntimes = /* @__PURE__ */ new WeakSet();
  const markDeferResumeMode = (ccs, resumeMode) => {
    const key = deferKeyOf(ccs);
    for (const item of deferInvoke) {
      if (item.key === key) {
        item.resumeMode = resumeMode;
      }
    }
  };
  const setMiddlewareReady = (fullKey, share) => {
    middlewareReady.set(fullKey, share);
  };
  const checkSingleMiddlewareReady = (cc) => {
    if (middlewareReady.has(cc.reg.fullKey)) {
      cc.runtime.share = middlewareReady.get(cc.reg.fullKey);
      cc.status = "ready";
      return true;
    }
    return false;
  };
  const checkMiddlewareReady = (ccs) => {
    return ccs.map((cc) => checkSingleMiddlewareReady(cc)).every(Boolean);
  };
  const checkDeferCalls = (status, ccs) => {
    if (status === "defer") {
      if (checkMiddlewareReady(ccs)) {
        return "retry";
      }
      const incomingKey = deferKeyOf(ccs);
      const exists = deferInvoke.some((d) => d.key === incomingKey);
      if (!exists) {
        deferInvoke.push({
          callContexts: ccs,
          resumeMode: "full",
          key: incomingKey
        });
      }
      return "defer";
    }
    return "ready";
  };
  const processReadyMiddleware = (readyKey, share) => {
    setMiddlewareReady(readyKey, share);
    const resumes = [];
    const waiting = [];
    for (const group of deferInvoke) {
      const allReady = group.callContexts.map((deferCC) => {
        if (deferCC.reg.fullKey === readyKey) {
          deferCC.runtime.share = share;
          deferCC.status = "ready";
        }
        return deferCC.status === "ready" || deferCC.status === "skip";
      }).every(Boolean);
      (allReady ? resumes : waiting).push(group);
    }
    deferInvoke = waiting;
    return { resumes };
  };
  const validateRetryCount = (ccs, tries) => {
    if (tries > 1) {
      const mwError = new MiddlewareError(
        KernelErrorCode.MIDDLEWARE_SETUP_FAILED,
        `Middleware setup failed after 2 tries for ${ccs.map((cc) => cc.reg.regKey).join(", ")}`,
        {
          middlewareName: ccs[0]?.reg.mw.name,
          provider: ccs[0]?.reg.hostFynApp.name,
          fynAppName: ccs[0]?.fynApp.name
        }
      );
      console.error(`\u{1F6A8} ${mwError.message}`);
      throw mwError;
    }
  };
  const setupMiddlewares = async (ccs, signalReady) => {
    let middlewareSetupStatus = "ready";
    let hasDeferredMiddleware = false;
    for (const cc of ccs) {
      const { fynApp, reg } = cc;
      const mw = reg.mw;
      checkSingleMiddlewareReady(cc);
      if (mw.setup) {
        console.debug("\u{1F680} Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
        const result = await mw.setup(cc);
        captureEvent(tel, "setup.completed", { mw: reg.regKey, app: fynApp.name });
        if (result?.status === "ready" && !middlewareReady.has(cc.reg.fullKey)) {
          if (signalReady) {
            await signalReady(cc, result?.share);
          }
        }
        if (result?.status === "defer") {
          middlewareSetupStatus = "defer";
          hasDeferredMiddleware = true;
        }
        checkSingleMiddlewareReady(cc);
      }
    }
    return { middlewareSetupStatus, hasDeferredMiddleware };
  };
  const initializeFynUnit = async (ccs, fynUnit, fynApp, runtime, providerModeRegistrar, skipFynUnit) => {
    if (skipFynUnit || !fynUnit.initialize) {
      return { allowDegraded: false, initDeferStatus: "ready" };
    }
    if (initializedRuntimes.has(runtime)) {
      return { allowDegraded: false, initDeferStatus: "ready" };
    }
    console.debug("\u{1F680} Invoking unit.initialize for", fynApp.name, fynApp.version);
    const result = await fynUnit.initialize(runtime);
    initializedRuntimes.add(runtime);
    const allowDegraded = Boolean(result?.deferOk);
    if (result?.mode && providerModeRegistrar) {
      for (const cc of ccs) {
        providerModeRegistrar(fynApp.name, cc.reg.mw.name, result.mode);
      }
      console.debug(`\u{1F4DD} ${fynApp.name} registered as ${result.mode} for middleware(s)`);
    }
    const initDeferStatus = checkDeferCalls(result?.status, ccs);
    return { allowDegraded, initDeferStatus };
  };
  const applyReadyMiddlewares = async (ccs, fynApp) => {
    for (const cc of ccs) {
      if (cc.status !== "ready") continue;
      const mw = cc.reg.mw;
      if (!mw.apply) continue;
      console.debug("\u{1F680} Invoking middleware", cc.reg.regKey, "apply for", fynApp.name, fynApp.version);
      await mw.apply(cc);
    }
  };
  const executeWithOverride = async (fynUnit, fynApp, runtime, kernel, autoApply) => {
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);
    let didExecute = false;
    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
      didExecute = true;
    } else if (fynUnit.execute) {
      console.debug("\u{1F680} Invoking unit.execute for", fynApp.name, fynApp.version);
      await fynUnit.execute(runtime);
      didExecute = true;
    }
    if (didExecute) {
      captureEvent(tel, "execute.completed", { app: fynApp.name, override: !!executionOverride });
    }
  };
  const callMiddlewares = async (ccs, options = {}, tries = 0) => {
    if (ccs.length === 0) {
      console.debug("\u26A0\uFE0F No middleware contexts to call, skipping middleware setup");
      return "ready";
    }
    if (tries === 0) {
      captureEvent(tel, "call.started", { count: ccs.length, app: ccs[0]?.fynApp?.name });
    }
    validateRetryCount(ccs, tries);
    const { middlewareSetupStatus, hasDeferredMiddleware } = await setupMiddlewares(ccs, options.signalReady);
    const fynUnit = ccs[0].fynUnit;
    const fynApp = ccs[0].fynApp;
    const runtime = ccs[0].runtime;
    const postSetupStatus = checkDeferCalls(middlewareSetupStatus, ccs);
    if (postSetupStatus === "retry") {
      return await callMiddlewares(ccs, options, tries + 1);
    }
    const { allowDegraded, initDeferStatus } = await initializeFynUnit(
      ccs,
      fynUnit,
      fynApp,
      runtime,
      options.providerModeRegistrar,
      options.skipFynUnit
    );
    if (initDeferStatus === "defer" && !allowDegraded) {
      captureEvent(tel, "call.deferred", { app: fynApp?.name });
      return "defer";
    }
    if (initDeferStatus === "retry") {
      return await callMiddlewares(ccs, options, tries + 1);
    }
    if (hasDeferredMiddleware && postSetupStatus === "defer" && !allowDegraded && !options.skipFynUnit) {
      captureEvent(tel, "call.deferred", { app: fynApp?.name });
      return "defer";
    }
    await applyReadyMiddlewares(ccs, fynApp);
    if (options.skipFynUnit) {
      return "ready";
    }
    if (allowDegraded && postSetupStatus === "defer") {
      markDeferResumeMode(ccs, "middleware_only");
    }
    await executeWithOverride(fynUnit, fynApp, runtime, ccs[0].kernel, options.autoApply);
    return "ready";
  };
  const unusableMiddlewareMeta = (fynApp, meta) => {
    const shape = meta && typeof meta === "object" ? Object.entries(meta).map(([k, v]) => `${k}: ${v === null ? "null" : typeof v}`).join(", ") : typeof meta;
    return new MiddlewareError(
      KernelErrorCode.MIDDLEWARE_NOT_FOUND,
      `${fynApp.name} declared a middleware the kernel cannot read: {${shape}}. \`mw\` must be the id string that rollup-plugin-federation writes for an import tagged \`with { type: "fynapp-middleware" }\`. Getting a Promise here means those import attributes were stripped before the plugin saw them - check that the build's TypeScript transform preserves them (create-fynapp's setupTypeScriptPlugins does).`,
      { fynAppName: fynApp.name }
    );
  };
  const useMiddlewareOnFynUnit = async (fynUnit, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApply) => {
    if (!fynUnit.__middlewareMeta) {
      return "";
    }
    const runtime = createRuntime();
    console.debug("\u{1F50D} Processing middleware metadata:", fynUnit.__middlewareMeta);
    const ccs = [];
    for (const meta of fynUnit.__middlewareMeta) {
      console.debug("\u{1F50D} Processing meta item:", meta);
      let cc = null;
      if (typeof meta === "string") {
        cc = await parseMiddlewareString(
          meta,
          {},
          fynUnit,
          fynApp,
          kernel,
          runtime,
          getMiddleware,
          loadMiddlewareFromDependency
        );
      } else if (meta && typeof meta === "object") {
        console.debug("\u{1F50D} Object format meta:", meta);
        if (meta.mw && typeof meta.mw === "string") {
          cc = await parseMiddlewareString(
            meta.mw,
            meta.config || {},
            fynUnit,
            fynApp,
            kernel,
            runtime,
            getMiddleware,
            loadMiddlewareFromDependency
          );
        } else if (meta.info) {
          const info = meta.info;
          console.debug("\u{1F50D} Legacy format - name:", info.name, "provider:", info.provider);
          const reg = getMiddleware(info.name, info.provider, { version: info.version });
          if (reg.regKey === "") {
            console.debug("\u274C No middleware found for", info.name, info.provider);
            continue;
          }
          cc = {
            meta,
            fynUnit,
            fynApp,
            reg,
            kernel,
            runtime,
            status: ""
          };
        } else {
          throw unusableMiddlewareMeta(fynApp, meta);
        }
      } else {
        throw unusableMiddlewareMeta(fynApp, meta);
      }
      if (cc) {
        ccs.push(cc);
      } else {
        console.error(
          `\u26A0\uFE0F ${fynApp.name}: no middleware resolved for declaration`,
          meta,
          "- this FynApp will not execute unless another declaration resolves"
        );
      }
    }
    if (fynUnit.__middlewareMeta.length > 0 && ccs.length === 0) {
      console.error(
        `\u274C ${fynApp.name} declared ${fynUnit.__middlewareMeta.length} middleware(s) and resolved none, so its execute will not run and it will render nothing`
      );
    }
    console.debug("\u2705 Created", ccs.length, "middleware call contexts");
    return callMiddlewares(ccs, { autoApply });
  };
  const applyAutoScopeMiddlewares = async (fynApp, fynUnit, kernel, autoApply, createRuntime, signalReady) => {
    const errors = [];
    console.log(`\u{1F3AF} Auto-apply check for ${fynApp.name}: autoApply exists?`, !!autoApply);
    if (!autoApply) {
      console.log(`\u23ED\uFE0F No auto-apply middlewares registered yet for ${fynApp.name}`);
      return errors;
    }
    const targetMiddlewares = getTargetMiddlewares(fynApp, autoApply);
    for (const mwReg of targetMiddlewares) {
      if (mwReg.mw.shouldApply) {
        try {
          const shouldApply = mwReg.mw.shouldApply(fynApp);
          if (!shouldApply) {
            console.debug(`\u23ED\uFE0F Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
            continue;
          }
        } catch (error) {
          errors.push(
            middlewareFailure(
              KernelErrorCode.MIDDLEWARE_FILTER_ERROR,
              `Error in shouldApply for ${mwReg.regKey}`,
              mwReg,
              fynApp,
              error
            )
          );
          continue;
        }
      }
      console.debug(
        `\u{1F504} Auto-applying ${mwReg.mw.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`
      );
      const unit = fynUnit || noOpFynUnit;
      const context = createMiddlewareCallContext(mwReg, unit, fynApp, createRuntime(), kernel, {}, "ready");
      try {
        if (mwReg.mw.setup) {
          const result = await mwReg.mw.setup(context);
          if (result?.status === "ready" && signalReady) {
            await signalReady(context, result.share);
          }
        }
        if (mwReg.mw.apply) {
          await mwReg.mw.apply(context);
        }
      } catch (error) {
        tel.capErr(
          "auto_apply.failed",
          { mw: mwReg.regKey, app: fynApp.name },
          error
        );
        errors.push(
          middlewareFailure(
            KernelErrorCode.MIDDLEWARE_APPLY_FAILED,
            `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}`,
            mwReg,
            fynApp,
            error
          )
        );
      }
    }
    return errors;
  };
  const clear = () => {
    middlewareReady.clear();
    deferInvoke = [];
  };
  return {
    middlewareReady,
    get deferInvoke() {
      return deferInvoke;
    },
    setMiddlewareReady,
    checkSingleMiddlewareReady,
    checkMiddlewareReady,
    checkDeferCalls,
    processReadyMiddleware,
    callMiddlewares,
    useMiddlewareOnFynUnit,
    applyAutoScopeMiddlewares,
    clear
  };
};

const keysOf = (fynApp) => [`${fynApp.name}@${fynApp.version}`, fynApp.name];
const FynAppRegistry = function(initial) {
  let apps = initial || {};
  return {
    initialize(next) {
      apps = next;
    },
    add(fynApp) {
      for (const key of keysOf(fynApp)) apps[key] = fynApp;
    },
    get: (key) => apps[key],
    has: (key) => !!apps[key],
    remove(fynApp, lookupName) {
      if (lookupName) delete apps[lookupName];
      for (const key of keysOf(fynApp)) delete apps[key];
    }
  };
};

const FynAppLifecycle = function() {
  const states = /* @__PURE__ */ new Map();
  const key = (name, version) => `${name}@${version}`;
  return {
    set(name, version, status, error) {
      const k = key(name, version);
      const now = Date.now();
      const state = {
        name,
        version,
        status,
        error: status === "failed" ? error : void 0,
        updatedAt: now,
        mountedAt: status === "mounted" ? now : states.get(k)?.mountedAt
      };
      states.set(k, state);
      return state;
    },
    get: (name, version) => states.get(key(name, version)),
    find(nameOrKey) {
      const direct = states.get(nameOrKey);
      if (direct) return direct;
      let match;
      for (const state of states.values()) {
        if (state.name === nameOrKey && (!match || state.updatedAt >= match.updatedAt)) {
          match = state;
        }
      }
      return match;
    },
    list: () => [...states.values()],
    remove(name, version) {
      states.delete(key(name, version));
    }
  };
};

const KERNEL_VERSION = "1.1.2";

var __defProp = Object.defineProperty;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _globalMiddlewareRegistry, _regionRegistries, _FynMeshKernelCore_instances, autoApply_fn, runtimeFor_fn, appData_fn, disposeBus_fn, callUnitHook_fn, emitLifecycle_fn, transitionLifecycle_fn;
class FynMeshKernelCore {
  constructor(telemetryConfig) {
    __privateAdd(this, _FynMeshKernelCore_instances);
    __publicField(this, "events");
    __publicField(this, "version", KERNEL_VERSION);
    __publicField(this, "shareScopeName", fynMeshShareScope);
    /** Inter-FynApp messaging (see notes/FYNBUS_DESIGN.md) */
    __publicField(this, "bus");
    __publicField(this, "busRoot");
    __publicField(this, "runTime");
    // Middleware state registries
    __privateAdd(this, _globalMiddlewareRegistry, new MiddlewareStateRegistry());
    __privateAdd(this, _regionRegistries, /* @__PURE__ */ new Map());
    // Telemetry
    __publicField(this, "tel");
    // Extracted modules
    __publicField(this, "manifestResolver");
    __publicField(this, "bootstrapCoordinator");
    __publicField(this, "mwMgr");
    __publicField(this, "loader");
    __publicField(this, "middlewareExecutor");
    __publicField(this, "fynAppRegistry");
    __publicField(this, "fynAppLifecycle");
    this.events = new FynEventTarget();
    this.runTime = {
      apps: {},
      middlewares: {}
    };
    this.fynAppRegistry = new FynAppRegistry(this.runTime.apps);
    this.fynAppLifecycle = new FynAppLifecycle();
    this.tel = telemetryConfig ? new KernelTelemetryImpl(telemetryConfig) : noOpTelemetry;
    this.busRoot = new FynBusRoot(this.tel.scope("bus"));
    this.bus = this.busRoot.forKernel();
    this.manifestResolver = new ManifestResolver(this.tel.scope("manifest"));
    this.bootstrapCoordinator = new BootstrapCoordinator(this.events, void 0, this.tel.scope("bootstrap"));
    this.mwMgr = new MiddlewareManager(this.tel.scope("middleware"));
    this.loader = new ModuleLoader(
      this.tel.scope("loader"),
      (fynApp) => this.busRoot.forApp(fynApp.name, fynApp.version)
    );
    this.middlewareExecutor = new MiddlewareExecutor(this.tel.scope("executor"));
    this.events.on("MIDDLEWARE_READY", (event) => {
      this.handleMiddlewareReady(event);
    });
  }
  /**
   * Send an event to the kernel
   */
  async emitAsync(event) {
    return this.events.dispatchEvent(event);
  }
  /**
   * Install a registry resolver (browser: demo server paths)
   */
  setRegistryResolver(resolver) {
    this.manifestResolver.setRegistryResolver(resolver);
  }
  /**
   * Set callback for preloading entry files
   */
  setPreloadCallback(callback) {
    this.manifestResolver.setPreloadCallback(callback);
  }
  /**
   * Programmatic API for middlewares to signal readiness
   */
  async signalMiddlewareReady(cc, detail = {}) {
    const event = new CustomEvent("MIDDLEWARE_READY", {
      detail: {
        name: detail.name || cc.reg.mw.name,
        status: detail.status || "ready",
        share: detail.share,
        cc
      }
    });
    await this.emitAsync(event);
  }
  /**
   * Handle middleware ready event
   */
  async handleMiddlewareReady(event) {
    const { name, status, cc, share } = event.detail;
    const _share = share || {};
    const { resumes } = this.middlewareExecutor.processReadyMiddleware(
      cc.reg.fullKey,
      _share
    );
    for (const resume of resumes) {
      await this.middlewareExecutor.callMiddlewares(
        resume.callContexts,
        {
          signalReady: async (cc2, share2) => this.signalMiddlewareReady(cc2, { share: share2 }),
          providerModeRegistrar: (fynAppName, middlewareName, mode) => this.bootstrapCoordinator.registerProviderMode(fynAppName, middlewareName, mode),
          autoApply: this.runTime.autoApply,
          skipFynUnit: resume.resumeMode === "middleware_only" ? true : void 0
        }
      );
    }
    console.debug(
      `\u2705 Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`
    );
  }
  /**
   * Load FynApps by name using manifests and a dependency graph.
   *
   * Throws on structural errors (no registry resolver configured, dependency
   * graph build failures). Per-app load failures are isolated — a `null` result
   * from `loadFynApp` does not abort the batch. See
   * `FynMeshKernel.loadFynAppsByName` for the full error contract.
   */
  async loadFynAppsByName(requests, options) {
    captureEvent(this.tel, "load_batch.started", { count: requests.length });
    await this.manifestResolver.warmPreload(requests);
    const graph = await this.manifestResolver.buildGraph(requests);
    const batches = this.manifestResolver.topoBatches(graph);
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 4, 8));
    const allMeta = this.manifestResolver.nodeMeta;
    for (const batch of batches) {
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
          while (next < batch.length) {
            const meta = allMeta.get(batch[next++]);
            const baseUrl = meta.distBase || meta.url.replace(/\/[^/]*$/, "/");
            console.debug(`\u{1F4E6} Loading ${meta.name}@${meta.version} from ${baseUrl}`);
            await this.loadFynApp(baseUrl);
          }
        })
      );
    }
    this.tel.capture({ type: "event", name: "load_batch.completed" });
  }
  /**
   * Register a middleware implementation
   */
  registerMiddleware(mwReg) {
    this.mwMgr.registerMiddleware(mwReg);
    const exported = this.mwMgr.exportToRuntime();
    this.runTime.middlewares = exported.middlewares;
    this.runTime.autoApply = exported.autoApply;
  }
  /**
   * Get middleware by name and provider
   */
  getMiddleware(name, provider, opts) {
    return this.mwMgr.getMiddleware(name, provider, opts);
  }
  /**
   * Get middleware state registry for global or region scope
   */
  getMiddlewareRegistry(scope) {
    if (scope === "global") {
      return __privateGet(this, _globalMiddlewareRegistry);
    }
    const regionId = scope.region;
    if (!__privateGet(this, _regionRegistries).has(regionId)) {
      __privateGet(this, _regionRegistries).set(
        regionId,
        __privateGet(this, _globalMiddlewareRegistry).createScope()
      );
    }
    return __privateGet(this, _regionRegistries).get(regionId);
  }
  /**
   * Initialize the kernel runtime data
   */
  initRunTime(data) {
    this.runTime = { ...data };
    this.fynAppRegistry.initialize(this.runTime.apps);
    this.mwMgr.initializeFromRuntime(data);
    return this.runTime;
  }
  /**
   * Create middleware scanner callback that delegates to MiddlewareManager
   * This is the single source of truth for middleware scanning
   */
  createMiddlewareScanner() {
    return (fynApp, exposeName, exposedModule) => this.mwMgr.scanAndRegisterMiddleware(fynApp, exposeName, exposedModule);
  }
  /**
   * Load FynApp basics
   */
  async loadFynAppBasics(fynAppEntry) {
    return this.loader.loadFynAppBasics(
      fynAppEntry,
      this.fynAppRegistry,
      this.createMiddlewareScanner()
    );
  }
  /**
   * Check if a FynApp is already loaded by examining the registry
   * Returns the existing FynApp instance if found, null otherwise
   */
  checkAlreadyLoaded(fynAppEntry) {
    const fynAppName = fynAppEntry.container?.name;
    const fynAppVersion = fynAppEntry.container?.version;
    const fynAppKey = fynAppName && fynAppVersion ? `${fynAppName}@${fynAppVersion}` : fynAppName;
    if (fynAppKey && this.fynAppRegistry.has(fynAppKey)) {
      console.debug(`\u2705 FynApp ${fynAppKey} already loaded, returning existing instance`);
      return this.fynAppRegistry.get(fynAppKey);
    }
    return null;
  }
  /**
   * Validate and normalize a main export into a FynUnit
   * - Functions are wrapped as { execute: fn }
   * - Objects with execute method pass through
   * - Invalid exports throw descriptive errors
   */
  validateFynUnit(mainExport, fynAppName) {
    if (typeof mainExport === "function") {
      return { execute: mainExport };
    }
    if (mainExport && typeof mainExport.execute === "function") {
      return mainExport;
    }
    throw new Error(
      `${fynAppName}: main export must be a function or have an execute method. Got: ${typeof mainExport}${mainExport ? ` with keys: ${Object.keys(mainExport).join(", ")}` : ""}`
    );
  }
  /**
   * Check bootstrap readiness and handle deferral if needed
   * Returns true if bootstrap should proceed, false if it should be skipped
   */
  async checkBootstrapReadiness(fynApp) {
    if (!this.bootstrapCoordinator.canBootstrap(fynApp)) {
      console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name}`);
      await this.bootstrapCoordinator.deferBootstrap(fynApp);
      console.debug(`\u25B6\uFE0F Resuming bootstrap of ${fynApp.name}`);
    }
    if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
      console.debug(`\u23F8\uFE0F Deferring bootstrap of ${fynApp.name} (bootstrap lock busy)`);
      await this.bootstrapCoordinator.deferBootstrap(fynApp);
      console.debug(`\u25B6\uFE0F Resuming bootstrap of ${fynApp.name} (retry lock acquisition)`);
      if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
        console.error(`\u23F0 ${fynApp.name} unable to acquire bootstrap lock after deferral; skipping bootstrap`);
        return false;
      }
    }
    return true;
  }
  /**
   * Load all middleware modules exposed by a FynApp
   */
  async loadMiddlewareModules(fynApp) {
    const middlewareScanner = this.createMiddlewareScanner();
    for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
      if (exposeName.startsWith(MIDDLEWARE_EXPOSE_PREFIX)) {
        await this.loader.loadExposeModule(
          fynApp,
          exposeName,
          true,
          middlewareScanner
        );
      }
    }
  }
  /**
   * Prepare the main export for execution: validate it, apply auto-scope middlewares,
   * and return the validated FynUnit
   * Returns null if no main export exists (middleware-only FynApp)
   */
  async prepareMainExport(fynApp) {
    const mainExport = fynApp.exposes["./main"]?.main;
    if (!mainExport) {
      return null;
    }
    console.debug("\u{1F680} Bootstrapping FynApp", fynApp.name, fynApp.version);
    const fynUnit = this.validateFynUnit(mainExport, fynApp.name);
    const middlewareErrors = await this.middlewareExecutor.applyAutoScopeMiddlewares(
      fynApp,
      fynUnit,
      this,
      __privateMethod(this, _FynMeshKernelCore_instances, autoApply_fn).call(this),
      () => __privateMethod(this, _FynMeshKernelCore_instances, runtimeFor_fn).call(this, fynApp),
      async (cc, share) => this.signalMiddlewareReady(cc, { share })
    );
    if (middlewareErrors.length > 0) {
      console.warn(
        `\u26A0\uFE0F ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`,
        middlewareErrors.map((e) => e.toDetailedString())
      );
    }
    return fynUnit;
  }
  /**
   * Execute a FynUnit directly (Path B: no explicit middleware meta)
   */
  async executeFynUnit(fynUnit, fynApp) {
    await this.loader.invokeFynUnit(
      fynUnit,
      fynApp,
      __privateMethod(this, _FynMeshKernelCore_instances, autoApply_fn).call(this),
      this
    );
  }
  /**
   * Bootstrap a fynapp
   */
  async bootstrapFynApp(fynApp) {
    this.fynAppLifecycle.set(fynApp.name, fynApp.version, "bootstrapping");
    if (!await this.checkBootstrapReadiness(fynApp)) {
      return;
    }
    captureEvent(this.tel, "bootstrap.started", __privateMethod(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
    try {
      await this.loadMiddlewareModules(fynApp);
      const fynUnit = await this.prepareMainExport(fynApp);
      if (fynUnit) {
        if (fynUnit.__middlewareMeta && fynUnit.__middlewareMeta.length > 0) {
          const middlewareScanner = this.createMiddlewareScanner();
          await this.middlewareExecutor.useMiddlewareOnFynUnit(
            fynUnit,
            fynApp,
            this,
            () => __privateMethod(this, _FynMeshKernelCore_instances, runtimeFor_fn).call(this, fynApp),
            (name, provider, opts) => this.getMiddleware(name, provider, opts),
            async (packageName, middlewarePath) => {
              await this.loader.loadMiddlewareFromDependency(
                packageName,
                middlewarePath,
                this.fynAppRegistry,
                middlewareScanner
              );
            },
            __privateMethod(this, _FynMeshKernelCore_instances, autoApply_fn).call(this)
          );
        } else {
          await this.executeFynUnit(fynUnit, fynApp);
        }
      }
      console.debug("\u2705 FynApp bootstrapped", fynApp.name, fynApp.version);
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "mounted");
      captureEvent(this.tel, "bootstrap.completed", __privateMethod(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
      await __privateMethod(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_BOOTSTRAPPED", fynApp);
    } catch (error) {
      this.tel.capErr("bootstrap.failed", { app: fynApp.name }, error);
      this.fynAppLifecycle.set(fynApp.name, fynApp.version, "failed", error);
      console.error(`\u274C Bootstrap failed for ${fynApp.name}:`, error);
      __privateMethod(this, _FynMeshKernelCore_instances, disposeBus_fn).call(this, fynApp);
      await __privateMethod(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_BOOTSTRAP_FAILED", fynApp, { error });
      this.bootstrapCoordinator.releaseBootstrapLock();
    }
  }
  /**
   * Shutdown a FynApp - calls shutdown() on its FynUnits and removes from registry
   * @param name - Can be either "name" or "name@version" format
   */
  async shutdownFynApp(name) {
    const fynApp = this.fynAppRegistry.get(name);
    if (!fynApp) {
      console.debug(`\u26A0\uFE0F shutdownFynApp: FynApp "${name}" not found`);
      return false;
    }
    console.debug(`\u{1F6D1} Shutting down FynApp ${name}`);
    captureEvent(this.tel, "shutdown.started", { app: name });
    this.fynAppLifecycle.set(fynApp.name, fynApp.version, "shutdown");
    try {
      await __privateMethod(this, _FynMeshKernelCore_instances, callUnitHook_fn).call(this, fynApp, "shutdown");
      this.removeFromRegistry(fynApp, name);
      __privateMethod(this, _FynMeshKernelCore_instances, disposeBus_fn).call(this, fynApp);
      await __privateMethod(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, "FYNAPP_SHUTDOWN", fynApp);
      captureEvent(this.tel, "shutdown.completed", __privateMethod(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
      console.debug(`\u2705 FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
      return true;
    } catch (error) {
      this.tel.capErr("shutdown.failed", { app: name }, error);
      console.error(`\u274C Error during shutdown of ${name}:`, error);
      this.removeFromRegistry(fynApp, name);
      __privateMethod(this, _FynMeshKernelCore_instances, disposeBus_fn).call(this, fynApp);
      return false;
    }
  }
  /**
   * Suspend a mounted FynApp (only mounted -> suspended is valid).
   */
  async suspendFynApp(name) {
    return __privateMethod(this, _FynMeshKernelCore_instances, transitionLifecycle_fn).call(this, name, {
      from: "mounted",
      to: "suspended",
      hook: "suspend",
      event: "FYNAPP_SUSPENDED"
    });
  }
  /**
   * Resume a suspended FynApp (only suspended -> mounted is valid).
   */
  async resumeFynApp(name) {
    return __privateMethod(this, _FynMeshKernelCore_instances, transitionLifecycle_fn).call(this, name, {
      from: "suspended",
      to: "mounted",
      hook: "resume",
      event: "FYNAPP_RESUMED"
    });
  }
  /**
   * Remove a FynApp from the registry by all its keys
   * - the lookup name (could be name or name@version)
   * - the versioned key (name@version)
   * - the canonical name (fynApp.name)
   */
  removeFromRegistry(fynApp, name) {
    this.fynAppRegistry.remove(fynApp, name);
    this.fynAppLifecycle.remove(fynApp.name, fynApp.version);
  }
  /**
   * Get the current lifecycle state of a FynApp (mount tracking).
   */
  getFynAppState(name) {
    return this.fynAppLifecycle.find(name);
  }
  /**
   * List the lifecycle state of every tracked FynApp.
   */
  listFynAppStates() {
    return this.fynAppLifecycle.list();
  }
  /**
   * ***Debug snapshot*** -- `kernel.__I()`.
   *
   * Named after `Federation.__I()`, and a hatch for the same reason: the
   * production kernel mangles property names, and `bootstrapCoordinator` is
   * one of the five fields `build/reserved-names.mjs` deliberately leaves
   * manglable, because reaching for kernel-internal wiring from a host page is
   * unsupported. The cost of that was a reader who could not tell a bootstrap
   * queue that is *idle* from one it cannot *read* -- opposite states that
   * both render as an empty panel. This returns the queue, and only the queue:
   * everything else a tool wants off the kernel is already declared in
   * `types.ts` and therefore already survives.
   *
   * Two things keep it readable in the shipped bundle, and both are load-
   * bearing:
   *
   * - `__I` is held back by `EXTERNAL_CONTRACT` in `build/reserved-names.mjs`,
   *   pinned by `tests/debug-snapshot.test.ts`. Deliberately *not* declared on
   *   `FynMeshKernel` in `types.ts`: that would reserve it by derivation, but
   *   it would also make a debugging hatch part of the kernel's public API,
   *   and it would drag every name in the return type into the reserved list
   *   along with it.
   * - every key below is **quoted**. The kernel's terser config mangles
   *   properties by default and `keep_quoted: true` is the documented escape
   *   hatch for names no declaration describes. Unquote one and the shipped
   *   snapshot carries a one-letter key nothing can read.
   *
   * `v` is an envelope version, stamped from the first commit so a consumer
   * keys off the shape rather than guessing at it.
   *
   * Plain data throughout -- strings, arrays and object literals, no live
   * kernel objects and no functions -- so it survives `structuredClone` and
   * can cross a message boundary into a devtools panel. `holder` is `null`,
   * never absent, when nobody holds the lock: that is the kernel's own way of
   * writing "free", and it is a state, not a gap.
   */
  __I() {
    const bc = this.bootstrapCoordinator;
    return {
      "v": 1,
      "bootstrap": {
        "holder": bc.bootstrappingApp,
        "deferred": bc.deferredBootstraps.map((d) => ({
          "name": d.fynApp.name,
          "version": d.fynApp.version
        })),
        "bootstrapped": [...bc.fynAppBootstrapStatus.keys()],
        "modes": [...bc.fynAppProviderModes.entries()].map(([app, roles]) => ({
          "app": app,
          "roles": [...roles.entries()].map(([middleware, mode]) => ({
            "middleware": middleware,
            "mode": mode
          }))
        }))
      }
    };
  }
  /**
   * Protected helper to build fynapp URL
   */
  buildFynAppUrl(baseUrl, entryFile = "fynapp-entry.js") {
    return urlJoin(baseUrl, entryFile);
  }
}
_globalMiddlewareRegistry = new WeakMap();
_regionRegistries = new WeakMap();
_FynMeshKernelCore_instances = new WeakSet();
/** Auto-apply middleware lists, as the executor and loader expect them. */
autoApply_fn = function() {
  return this.mwMgr.getAutoApply();
};
/** Fresh FynUnit runtime for a FynApp. */
runtimeFor_fn = function(fynApp) {
  return this.loader.mkRuntime(fynApp);
};
/** Telemetry payload identifying a FynApp. */
appData_fn = function(fynApp) {
  return { app: fynApp.name, version: fynApp.version };
};
/** Drop the app's bus subscriptions and handlers. */
disposeBus_fn = function(fynApp) {
  this.busRoot.disposeApp(fynApp.name, fynApp.version);
};
callUnitHook_fn = async function(fynApp, hook) {
  for (const exposeName of Object.keys(fynApp.exposes)) {
    const fynUnit = fynApp.exposes[exposeName]?.main;
    const fn = fynUnit?.[hook];
    if (typeof fn === "function") {
      await fn.call(fynUnit, __privateMethod(this, _FynMeshKernelCore_instances, runtimeFor_fn).call(this, fynApp));
    }
  }
};
/**
 * Emit a FynApp lifecycle event. Every one of them identifies the app the
 * same way — by name and version — so only the event type and any extra
 * detail vary.
 */
emitLifecycle_fn = function(type, fynApp, extra) {
  return this.emitAsync(
    new CustomEvent(type, {
      detail: { name: fynApp.name, version: fynApp.version, ...extra }
    })
  );
};
transitionLifecycle_fn = async function(name, opts) {
  const fynApp = this.fynAppRegistry.get(name);
  if (!fynApp) {
    console.debug(`\u26A0\uFE0F ${opts.hook}FynApp: FynApp "${name}" not found`);
    return false;
  }
  const state = this.fynAppLifecycle.get(fynApp.name, fynApp.version);
  if (state?.status !== opts.from) {
    console.debug(
      `\u26A0\uFE0F ${opts.hook}FynApp: "${name}" is ${state?.status ?? "untracked"}, expected ${opts.from}`
    );
    return false;
  }
  captureEvent(this.tel, `${opts.hook}.started`, __privateMethod(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
  try {
    await __privateMethod(this, _FynMeshKernelCore_instances, callUnitHook_fn).call(this, fynApp, opts.hook);
    this.fynAppLifecycle.set(fynApp.name, fynApp.version, opts.to);
    await __privateMethod(this, _FynMeshKernelCore_instances, emitLifecycle_fn).call(this, opts.event, fynApp);
    captureEvent(this.tel, `${opts.hook}.completed`, __privateMethod(this, _FynMeshKernelCore_instances, appData_fn).call(this, fynApp));
    return true;
  } catch (error) {
    this.tel.capErr(`${opts.hook}.failed`, { app: name }, error);
    console.error(`\u274C Error during ${opts.hook} of ${name}:`, error);
    return false;
  }
};

class NodeKernel extends FynMeshKernelCore {
  /**
   * Load a remote FynApp in a Node.js environment.
   *
   * Unlike the browser kernel there is no Federation runtime precondition, so
   * this method never throws: any load failure (dynamic import / basics /
   * bootstrap) is isolated and resolves to `null`. See
   * `FynMeshKernel.loadFynApp` for the full error contract.
   *
   * @returns the loaded FynApp after bootstrapping, or null on load failure
   */
  async loadFynApp(baseUrl, loadId) {
    const urlPath = this.buildFynAppUrl(baseUrl);
    try {
      captureEvent(this.tel, "fynapp.load_started", { url: baseUrl });
      const fynAppEntry = await import(urlPath);
      const existing = this.checkAlreadyLoaded(fynAppEntry);
      if (existing) {
        return existing;
      }
      const fynApp = await this.loadFynAppBasics(fynAppEntry);
      await this.bootstrapFynApp(fynApp);
      captureEvent(this.tel, "fynapp.loaded", { app: fynApp.name, version: fynApp.version });
      return fynApp;
    } catch (err) {
      this.tel.capErr("fynapp.load_failed", { url: baseUrl }, err);
      console.error(`Failed to load FynApp from ${baseUrl} in Node.js:`, err);
      return null;
    }
  }
}
function createNodeKernel() {
  const kernel = new NodeKernel();
  kernel.initRunTime({
    apps: {},
    middlewares: {}
  });
  return kernel;
}

const fynMeshKernel = createNodeKernel();

export { fynMeshKernel };
