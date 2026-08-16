/**
 * Preload priority levels for resource loading.
 *
 * A frozen object rather than a TS `enum`, for the same reason as
 * `KernelErrorCode` in errors.ts: an enum compiles to a runtime IIFE that no
 * bundler can drop, so all four member names ship in the browser kernel even
 * though every read is a constant. As a plain object the reads inline to their
 * string values and the table itself is tree-shaken away.
 *
 * The companion type alias keeps `PreloadPriority` usable in type position.
 */
const PreloadPriority = {
    /** Critical: modulepreload with fetchpriority="high" */
    CRITICAL: 'critical',
    /** Important: modulepreload with fetchpriority="auto" */
    IMPORTANT: 'important',
    /** Deferred: prefetch (idle time only) */
    DEFERRED: 'deferred',
    /** None: no preloading */
    NONE: 'none',
};

/**
 * Attach middleware metadata to a FynUnit
 *
 * @param meta Middleware metadata (single or array)
 * @param unit The FynUnit to attach middleware to
 * @returns The same unit with __middlewareMeta attached
 *
 * @example
 * ```typescript
 * export const main = useMiddleware(
 *   [
 *     { mw: import('pkg/middleware'), config: { theme: 'dark' } },
 *   ],
 *   {
 *     execute(runtime) { return { type: 'component', component: MyComponent }; }
 *   }
 * );
 * ```
 */
const useMiddleware = (meta, unit) => {
    unit.__middlewareMeta = [].concat(meta);
    return unit;
};
/**
 * A no-op FynUnit for middleware-only usage patterns
 */
const noOpFynUnit = {
    initialize: () => ({ status: "ready" }),
    execute: () => { },
};
/**
 * @deprecated Use noOpFynUnit instead
 */
const noOpMiddlewareUser = noOpFynUnit;
// example usage of useMiddleware
/*
export const main = useMiddleware(
  {
    info: {
      name: "react-context",
      version: "^1.0.0",
      provider: "fynapp-react-lib",
    },
    config: { theme: "light" },
  },
  noOpMiddlewareUser,
);
*/

/**
 * Default share scope name for the FynMesh kernel
 */
const fynMeshShareScope = "fynmesh";

/**
 * Kernel Error Module
 * Standardized error types for FynMesh Kernel with error codes
 */
/**
 * Error codes for kernel errors.
 *
 * A frozen object rather than a TS `enum`, for size: a *numeric* enum emits a
 * reverse map (`E[E.MODULE_NOT_FOUND = 1001] = "MODULE_NOT_FOUND"`), so every
 * member's name ships twice — 1,007 B across these 19 members. Nothing looks a
 * name up from a code, so that half was dead weight. (`const enum`, which would
 * inline instead, is unavailable here: `isolatedModules` is on.)
 *
 * The companion type alias keeps `KernelErrorCode` usable in type position
 * exactly as the enum was.
 */
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
    BUS_REQUEST_ABORTED: 6005,
};
/**
 * Base error class for all kernel errors
 */
class KernelError extends Error {
    code;
    context;
    cause;
    constructor(code, message, options) {
        super(message);
        this.name = "KernelError";
        this.code = code;
        this.context = options?.context;
        this.cause = options?.cause;
        // Maintains proper stack trace for where error was thrown
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
            result += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
        }
        if (this.cause) {
            result += `\nCaused by: ${this.cause.message}`;
        }
        return result;
    }
}
/**
 * Builds a KernelError subclass whose options bag becomes `context`.
 *
 * The five classes below were byte-for-byte the same shape — a constructor, a
 * `super()`, a hand-written literal copying each option onto `context`, and a
 * `this.name` assignment — differing only in the name and the option keys. That
 * is five constructors and five repacking literals in the bundle for behaviour
 * expressible once. The generic parameter keeps each class's option names
 * type-checked at call sites, so the collapse costs no type safety.
 *
 * Unlike the hand-written versions, `context` now holds only the keys actually
 * passed rather than every key with `undefined` values. Nothing observes the
 * difference: readers index single fields, and `toDetailedString`'s
 * JSON.stringify omits undefined either way.
 */
function defineErrorClass(name) {
    return class extends KernelError {
        constructor(code, message, options) {
            const { cause, ...context } = options ?? {};
            super(code, message, { context, cause });
            this.name = name;
        }
    };
}
/** Error for module loading failures */
const ModuleLoadError = defineErrorClass("ModuleLoadError");
/** Error for middleware-related failures */
const MiddlewareError = defineErrorClass("MiddlewareError");
/** Error for bootstrap failures */
const BootstrapError = defineErrorClass("BootstrapError");
/** Error for manifest resolution failures */
const ManifestError = defineErrorClass("ManifestError");
/** Error for federation-related failures */
const FederationError = defineErrorClass("FederationError");
/**
 * Error for FynBus messaging failures
 */
/**
 * Error or close enough to chain as a cause. Duck-typed rather than
 * `instanceof Error`: an AbortSignal reason may be a DOMException from
 * another realm (jsdom, iframe), where instanceof fails.
 */
function isErrorLike(value) {
    return (value instanceof Error ||
        (typeof value === "object" &&
            value !== null &&
            typeof value.name === "string" &&
            typeof value.message === "string"));
}
class FynBusError extends KernelError {
    constructor(code, message, context, cause) {
        super(code, message, {
            context,
            // KernelError chains Error causes; an AbortSignal reason can be any
            // value, so non-Error reasons are wrapped to keep the chain intact
            cause: cause === undefined || isErrorLike(cause) ? cause : new Error(String(cause)),
        });
        this.name = "FynBusError";
    }
}
/**
 * Helper to create success result
 */
function ok(value) {
    return { success: true, value };
}
/**
 * Helper to create error result
 */
function err(error) {
    return { success: false, error };
}
/**
 * Check if a result is an error
 */
function isError(result) {
    return !result.success;
}
/**
 * Check if a result is success
 */
function isOk(result) {
    return result.success;
}
/**
 * Unwrap a result, throwing if it's an error
 */
function unwrap(result) {
    if (result.success) {
        return result.value;
    }
    throw result.error;
}
/**
 * Unwrap a result with a default value
 */
function unwrapOr(result, defaultValue) {
    if (result.success) {
        return result.value;
    }
    return defaultValue;
}

/**
 * Observable state container with subscription support.
 * Enables reactive state sharing between middleware providers and consumers.
 */
class ObservableState {
    value;
    #observers = new Set();
    #disposed = false;
    constructor(initial) {
        this.value = initial;
    }
    /** Get current value */
    get() {
        if (this.#disposed) {
            throw new Error("Cannot get value from disposed ObservableState");
        }
        return this.value;
    }
    /** Set new value and notify observers */
    set(value) {
        if (this.#disposed)
            return;
        const prev = this.value;
        this.value = value;
        this.#observers.forEach((fn) => {
            try {
                fn(value, prev);
            }
            catch (e) {
                // Error isolation: one throwing observer must not stop the others
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
        if (this.#disposed) {
            throw new Error("Cannot subscribe to disposed ObservableState");
        }
        fn(this.value, undefined); // Immediate call with current value
        this.#observers.add(fn);
        return () => this.#observers.delete(fn);
    }
    /** Dispose state and clear all observers */
    dispose() {
        this.#disposed = true;
        this.#observers.clear();
    }
}

/**
 * Registry for middleware shared state with hierarchical scoping.
 * Supports late-join discovery and reactive updates.
 */
class MiddlewareStateRegistry {
    #parent;
    #states = new Map();
    #pendingWaiters = new Map();
    constructor(parent) {
        this.#parent = parent;
    }
    /**
     * Provide/register state in this scope.
     * @param key Unique key for this state
     * @param initial Initial value
     * @returns ObservableState for updates
     */
    provide(key, initial) {
        if (this.#states.has(key)) {
            // Return existing state if already provided
            return this.#states.get(key);
        }
        const state = new ObservableState(initial);
        this.#states.set(key, state);
        // Notify any waiters
        const waiters = this.#pendingWaiters.get(key);
        if (waiters) {
            waiters.forEach(({ resolve }) => resolve(state));
            this.#pendingWaiters.delete(key);
        }
        return state;
    }
    /**
     * Lookup state by key. Walks up hierarchy if not found locally.
     * @param key State key to find
     * @returns ObservableState or undefined if not found
     */
    lookup(key) {
        // Check local scope first
        if (this.#states.has(key)) {
            return this.#states.get(key);
        }
        // Walk up hierarchy
        return this.#parent?.lookup(key);
    }
    /**
     * Check if state exists in this scope or parent scopes.
     */
    has(key) {
        if (this.#states.has(key))
            return true;
        return this.#parent?.has(key) ?? false;
    }
    /**
     * Async wait for state to be provided.
     * @param key State key to wait for
     * @param timeout Timeout in ms (default 30000)
     * @returns Promise resolving to ObservableState
     */
    waitFor(key, timeout = 30000) {
        // Check if already exists
        const existing = this.lookup(key);
        if (existing) {
            return Promise.resolve(existing);
        }
        return new Promise((resolve, reject) => {
            // Identity of the parked entry, so the timeout below can drop exactly
            // this one. Matching on the promise's `resolve` never worked: what is
            // stored is the wrapper, so every timed-out waiter leaked.
            const waiter = {
                resolve: (state) => {
                    clearTimeout(timer);
                    resolve(state);
                },
                reject,
            };
            const timer = setTimeout(() => {
                const waiters = this.#pendingWaiters.get(key);
                const idx = waiters?.indexOf(waiter) ?? -1;
                if (idx >= 0) {
                    waiters.splice(idx, 1);
                    if (waiters.length === 0)
                        this.#pendingWaiters.delete(key);
                }
                reject(new Error(`Timeout waiting for state: ${key}`));
            }, timeout);
            const waiters = this.#pendingWaiters.get(key);
            if (waiters) {
                waiters.push(waiter);
            }
            else {
                this.#pendingWaiters.set(key, [waiter]);
            }
        });
    }
    /**
     * Remove state from this scope.
     * @param key State key to remove
     * @returns true if removed, false if not found
     */
    remove(key) {
        const state = this.#states.get(key);
        if (state) {
            state.dispose();
            this.#states.delete(key);
            return true;
        }
        return false;
    }
    /**
     * Clear all state in this scope.
     */
    clear() {
        this.#states.forEach(state => state.dispose());
        this.#states.clear();
        // Reject any pending waiters
        this.#pendingWaiters.forEach((waiters, key) => {
            waiters.forEach(({ reject }) => reject(new Error(`Registry cleared while waiting for: ${key}`)));
        });
        this.#pendingWaiters.clear();
    }
    /**
     * Create a child scope that inherits from this registry.
     */
    createScope() {
        return new MiddlewareStateRegistry(this);
    }
    /**
     * Get all keys in this scope (not including parent).
     */
    keys() {
        return Array.from(this.#states.keys());
    }
    /**
     * Get parent registry if exists.
     */
    getParent() {
        return this.#parent;
    }
}

/**
 * Extended EventTarget class for the FynMesh kernel
 * Adds convenient methods for event handling
 */
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

/**
 * Kernel Telemetry Implementation
 * Ring-buffer backed telemetry with pluggable transports and scoping
 */
const DEFAULT_MAX_BUFFER_SIZE = 500;
/**
 * Console transport — writes batched entries to console.log
 */
class ConsoleTelemetryTransport {
    async send(batch) {
        console.log("[telemetry]", batch);
    }
}
/**
 * Default KernelTelemetry implementation with a bounded ring buffer.
 * When the buffer reaches maxBufferSize, oldest entries are dropped.
 */
class KernelTelemetryImpl {
    #buffer = [];
    transport;
    maxBufferSize;
    constructor(config) {
        this.transport = config?.transport ?? new ConsoleTelemetryTransport();
        this.maxBufferSize = config?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
    }
    capture(entry) {
        const full = { ...entry, ts: Date.now() };
        if (this.#buffer.length >= this.maxBufferSize) {
            // Drop oldest — shift is O(n) but acceptable for the buffer sizes we use
            this.#buffer.shift();
        }
        this.#buffer.push(full);
    }
    capErr(name, data, error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.capture({
            type: "error",
            name,
            data,
            error: { message: err.message, stack: err.stack },
        });
    }
    scope(prefix) {
        return {
            capture: (entry) => this.capture({ ...entry, name: `${prefix}.${entry.name}` }),
            capErr: (name, data, error) => this.capErr(`${prefix}.${name}`, data, error),
            scope: (sub) => this.scope(`${prefix}.${sub}`),
            flush: () => this.flush(),
        };
    }
    /** Buffer length; the ring-buffer tests assert on it. */
    get bufferSize() {
        return this.#buffer.length;
    }
    flush() {
        if (this.#buffer.length === 0)
            return;
        const batch = this.#buffer.splice(0);
        // Fire-and-forget. Call send() synchronously (callers and tests rely on the
        // timing), but never leak: a synchronous throw is caught here and an async
        // rejection by .catch.
        const failed = (err) => console.error("[telemetry] transport.send failed:", err);
        try {
            void Promise.resolve(this.transport.send(batch)).catch(failed);
        }
        catch (err) {
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
function captureEvent(tel, name, data) {
    tel.capture({ type: "event", name, data });
}
/**
 * No-op telemetry instance for when telemetry is not configured.
 * All methods are silent no-ops.
 */
const noOpTelemetry = {
    capture() { },
    capErr() { },
    scope() { return noOpTelemetry; },
    flush() { },
};

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
/** Source name stamped on messages emitted through kernel.bus */
const KERNEL_BUS_SOURCE = "kernel";
/** FynApps load independently; requests wait this long for a late handler */
const DEFAULT_REQUEST_TIMEOUT = 10_000;
/** Async wrapper so a synchronously-throwing handler becomes a rejection */
async function invokeRpcHandler(handler, payload, meta) {
    return handler(payload, meta);
}
/**
 * Root bus owned by the kernel — a closure over the per-channel state and the
 * per-app facade cache. See the note on `FynBusFacade`.
 */
const FynBusRoot = function (telemetry) {
    const tel = telemetry ?? noOpTelemetry;
    const channels = new Map();
    const facades = new Map();
    let kernelFacade;
    const getChannel = (name) => {
        let state = channels.get(name);
        if (!state) {
            state = { events: new FynEventTarget(), handlers: new Map(), waiters: new Map() };
            channels.set(name, state);
        }
        return state;
    };
    const emitFrom = (source, channelName, topic, payload) => {
        // Frozen: meta is shared across subscribers and platform-stamped identity
        // must not be tamperable by one of them
        const meta = Object.freeze({ topic, source, channel: channelName });
        // Unprefixed name by convention: the kernel passes tel.scope("bus")
        captureEvent(tel, "emit", { topic, channel: channelName, source });
        const detail = { payload, meta };
        getChannel(channelName).events.dispatchEvent(new CustomEvent(topic, { detail }));
    };
    const subscribeFrom = (source, channelName, topic, handler, options, once, onAutoRemove) => {
        const { events } = getChannel(channelName);
        const signal = options?.signal;
        // Fired once() and signal aborts remove the listener without going
        // through the facade's unsubscribe — the hook lets it drop its tracking
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
            }
            catch (error) {
                // Error isolation: one throwing handler must not break delivery to
                // the others, nor make emit() throw at the sender
                console.error(`FynBus: handler error on topic "${topic}"`, error);
                tel.capErr("handler", { topic, channel: channelName, subscriber: source }, error);
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
    const requestFrom = (source, channelName, topic, payload, options, onCancel) => {
        let state = getChannel(channelName);
        const meta = Object.freeze({ topic, source, channel: channelName });
        // Every error and tel point below identifies the request the same
        // way, so the description and the context are each built once.
        const where = `FynBus: request "${topic}" on channel "${channelName}"`;
        const ctx = { topic, channel: channelName, source };
        captureEvent(tel, "request", ctx);
        const signal = options?.signal;
        return new Promise((resolve, reject) => {
            const abortError = () => new FynBusError(KernelErrorCode.BUS_REQUEST_ABORTED, `${where} aborted by caller`, ctx, signal?.reason);
            if (signal?.aborted) {
                // Mirrors fetch(): a dead signal rejects before parking or invoking
                reject(abortError());
                return;
            }
            let done = false;
            let timer;
            let removeWaiter;
            let removeAbort;
            let untrack;
            // Detach every hook exactly once, then settle; a late competing
            // settle (e.g. the handler's result after an abort) is dropped
            const settle = (finish) => {
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
            const invoke = (handler) => {
                if (timer !== undefined) {
                    clearTimeout(timer);
                    timer = undefined;
                }
                invokeRpcHandler(handler, payload, meta).then((value) => settle(() => resolve(value)), (error) => settle(() => reject(error)));
            };
            if (signal) {
                const onAbort = () => settle(() => reject(abortError()));
                signal.addEventListener("abort", onAbort, { once: true });
                removeAbort = () => signal.removeEventListener("abort", onAbort);
            }
            if (onCancel) {
                // Dispose of the requester's facade stops the wait, parked or in-flight
                untrack = onCancel(() => settle(() => reject(new FynBusError(KernelErrorCode.BUS_DISPOSED, `${where} cancelled — bus for "${source}" was disposed`, ctx))));
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
            const waiter = (handler) => invoke(handler);
            removeWaiter = () => {
                set.delete(waiter);
                if (set.size === 0 && state.waiters.get(topic) === set) {
                    state.waiters.delete(topic);
                }
            };
            const timeout = options?.timeout ?? DEFAULT_REQUEST_TIMEOUT;
            timer = setTimeout(() => {
                settle(() => reject(new FynBusError(KernelErrorCode.BUS_REQUEST_TIMEOUT, `${where} timed out after ${timeout}ms waiting for a handler`, { ...ctx, timeout })));
            }, timeout);
            set.add(waiter);
        });
    };
    const registerHandler = (source, channelName, topic, handler) => {
        let state = getChannel(channelName);
        if (state.handlers.has(topic)) {
            throw new FynBusError(KernelErrorCode.BUS_HANDLER_EXISTS, `FynBus: a handler is already registered for topic "${topic}" on channel "${channelName}"`, { topic, channel: channelName });
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
    };
    /**
     * Per-app facade, cached by name@version so side-by-side versions get
     * independent lifecycles while sharing the app name as message source.
     */
    const forApp = (name, version) => {
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
    /**
     * Facade for kernel-side callers (host page, middleware); a singleton so
     * all kernel-side code shares one subscription tracker. Never disposed —
     * it is intentionally not in the facades map, so disposeApp("kernel") is
     * a no-op.
     */
    const forKernel = () => {
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
    return self;
};
const FynBusFacade = function (root, source, channelName = "", shared) {
    const state = shared ?? { subs: new Set(), disposed: false };
    const assertActive = () => {
        if (state.disposed) {
            throw new FynBusError(KernelErrorCode.BUS_DISPOSED, `FynBus for "${source}" has been disposed`, { source, channel: channelName });
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
        const raw = root.subscribeFrom(source, channelName, topic, handler, options, once, 
        // Auto-removal (fired once / aborted signal) drops the tracking entry
        () => state.subs.delete(tracked));
        tracked = track(raw);
        if (options?.signal?.aborted) {
            // Pre-aborted signal: the listener was never registered and the abort
            // event won't re-fire — don't keep a tracking entry for it
            state.subs.delete(tracked);
        }
        return tracked;
    };
    // `state` is likewise carried but undeclared — see FynBusRoot above.
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
            return root.requestFrom(source, channelName, topic, payload, options, 
            // Track the request so dispose() stops its wait (parked or in-flight);
            // the returned untrack drops the canceller once the request settles
            (cancel) => {
                const tracked = track(cancel);
                return () => state.subs.delete(tracked);
            });
        },
        handle(topic, handler) {
            assertActive();
            return track(root.registerHandler(source, channelName, topic, handler));
        },
        channel(name) {
            assertActive();
            if (!name) {
                throw new FynBusError(KernelErrorCode.BUS_INVALID_CHANNEL, `FynBus: channel name must be a non-empty string`, { source });
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
};

export { BootstrapError, ConsoleTelemetryTransport, DEFAULT_REQUEST_TIMEOUT, FederationError, FynBusError, FynBusFacade, FynBusRoot, KERNEL_BUS_SOURCE, KernelError, KernelErrorCode, KernelTelemetryImpl, ManifestError, MiddlewareError, MiddlewareStateRegistry, ModuleLoadError, ObservableState, PreloadPriority, captureEvent, err, fynMeshShareScope, isError, isOk, noOpFynUnit, noOpMiddlewareUser, noOpTelemetry, ok, unwrap, unwrapOr, useMiddleware };
//# sourceMappingURL=index.js.map
