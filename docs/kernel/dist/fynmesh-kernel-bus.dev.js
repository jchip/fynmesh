(function () {
  'use strict';

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
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const KernelErrorCode = {
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
      __publicField(this, "code");
      __publicField(this, "context");
      __publicField(this, "cause");
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

  function install(kernel, hooks) {
    const busRoot = new FynBusRoot(hooks.tel.scope("bus"));
    const k = kernel;
    k.busRoot = busRoot;
    k.bus = busRoot.forKernel();
    hooks.runtime.push((fynApp, runtime) => {
      runtime.bus = busRoot.forApp(fynApp.name, fynApp.version);
    });
    hooks.appGone.push((fynApp) => busRoot.disposeApp(fynApp.name, fynApp.version));
  }
  const busAddon = { name: "bus", install };

  function installGlobal(addon) {
    const kernel = globalThis.fynMeshKernel;
    if (!kernel?.use) {
      throw new Error(
        `FynMesh add-on "${addon.name}" loaded before the kernel: load the core kernel bundle first`
      );
    }
    kernel.use(addon);
  }

  installGlobal(busAddon);

})();
