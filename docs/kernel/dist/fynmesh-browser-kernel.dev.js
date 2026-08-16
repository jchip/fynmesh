(function () {
    'use strict';

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
     * Default share scope name for the FynMesh kernel
     */
    const fynMeshShareScope = "fynmesh";

    /** Prefix for middleware expose modules (e.g., "./middleware/design-tokens") */
    const MIDDLEWARE_EXPOSE_PREFIX = "./middleware";
    /** Prefix for middleware export names (e.g., "__middleware__design_tokens") */
    const MIDDLEWARE_EXPORT_PREFIX = "__middleware__";
    function urlJoin(baseUrl, urlPath) {
        const fillSlash = urlPath.startsWith("/") || baseUrl.endsWith("/") ? "" : "/";
        return `${baseUrl}${fillSlash}${urlPath}`;
    }
    /**
     * Check if a FynApp is a middleware provider
     * @param fynApp The FynApp to check
     * @returns true if the FynApp exposes middleware modules
     */
    function isFynAppMiddlewareProvider(fynApp) {
        return Object.keys(fynApp.exposes).some(key => key.startsWith(MIDDLEWARE_EXPOSE_PREFIX));
    }
    /**
     * Get the appropriate middleware list based on FynApp type
     * @param fynApp The FynApp to check
     * @param autoApply The categorized middleware lists
     * @returns The middleware list for the given FynApp type, or empty array if no auto-apply middlewares
     */
    function getTargetMiddlewares(fynApp, autoApply) {
        if (!autoApply)
            return [];
        return isFynAppMiddlewareProvider(fynApp)
            ? autoApply.mw
            : autoApply.fynapp;
    }
    /**
     * Find the first middleware that can override execution for a given FynApp and FynUnit
     * @param fynApp The FynApp being executed
     * @param fynUnit The FynUnit being executed
     * @param autoApply The categorized auto-apply middleware lists
     * @returns The middleware reg that can override execution, or null
     */
    function findExecutionOverride(fynApp, fynUnit, autoApply) {
        // getTargetMiddlewares already yields [] when autoApply is absent
        return (getTargetMiddlewares(fynApp, autoApply).find((mwReg) => mwReg.mw.canOverrideExecution?.(fynApp, fynUnit)) ?? null);
    }
    /**
     * Create a middleware call context object
     * @param mwReg The middleware registration
     * @param fynUnit The FynUnit being processed
     * @param fynApp The FynApp owning the FynUnit
     * @param runtime The FynUnit runtime
     * @param kernel The FynMesh kernel
     * @param config Optional config (defaults to {})
     * @param status Optional status (defaults to "")
     * @returns A fully-constructed FynAppMiddlewareCallContext
     */
    function createMiddlewareCallContext(mwReg, fynUnit, fynApp, runtime, kernel, config, status, 
    /** Overrides the identity taken from `mwReg` — the "-FYNAPP_MIDDLEWARE" string
     * form carries its own name/provider/semver, which may differ from the reg. */
    info) {
        return {
            meta: {
                info: info ?? {
                    name: mwReg.mw.name,
                    provider: mwReg.hostFynApp.name,
                    version: mwReg.hostFynApp.version,
                },
                config: config ?? {},
            },
            fynUnit,
            fynApp,
            reg: mwReg,
            runtime,
            kernel,
            status: status ?? "",
        };
    }
    /**
     * Execute a middleware override for a FynUnit (handles both overrideInitialize and overrideExecute)
     * @param executionOverride The middleware registration that overrides execution
     * @param fynUnit The FynUnit being overridden
     * @param fynApp The FynApp owning the FynUnit
     * @param runtime The FynUnit runtime
     * @param kernel The FynMesh kernel
     */
    async function executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel) {
        console.debug(`🎭 Middleware ${executionOverride.mw.name} is overriding execution for ${fynApp.name}`);
        const context = createMiddlewareCallContext(executionOverride, fynUnit, fynApp, runtime, kernel, {}, "ready");
        if (executionOverride.mw.overrideInitialize && fynUnit.initialize) {
            console.debug(`🎭 Middleware overriding initialize for ${fynApp.name}`);
            const initResult = await executionOverride.mw.overrideInitialize(context);
            console.debug(`🎭 Initialize result:`, initResult);
        }
        if (executionOverride.mw.overrideExecute && typeof fynUnit.execute === "function") {
            console.debug(`🎭 Middleware overriding execute for ${fynApp.name}`);
            await executionOverride.mw.overrideExecute(context);
        }
    }
    /**
     * Get the global Federation instance safely
     * @returns The Federation instance
     * @throws Error if Federation is not loaded
     */
    function getFederation() {
        const Federation = globalThis.Federation;
        if (!Federation) {
            throw new Error("Federation.js is not loaded.");
        }
        return Federation;
    }
    /**
     * Parse middleware string format and create call context
     */
    async function parseMiddlewareString(middlewareStr, config, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency) {
        const parts = middlewareStr.trim().split(' ');
        if (parts.length < 3 || parts[0] !== '-FYNAPP_MIDDLEWARE') {
            return null;
        }
        const [, packageName, middlewarePath, semver] = parts;
        const middlewareName = middlewarePath.split('/').pop() || middlewarePath;
        console.debug("🔍 Middleware string - package:", packageName, "middleware:", middlewarePath, "semver:", semver || "any");
        // Try to load middleware from dependency package first
        if (loadMiddlewareFromDependency) {
            await loadMiddlewareFromDependency(packageName, middlewarePath);
        }
        const reg = getMiddleware(middlewareName, packageName);
        if (reg.regKey === "") {
            console.debug("❌ No middleware found for", middlewareName, packageName);
            return null;
        }
        return createMiddlewareCallContext(reg, fynUnit, fynApp, runtime, kernel, config, "", {
            name: middlewareName,
            provider: packageName,
            version: semver || "*",
        });
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
        EXPOSE_MODULE_NOT_FOUND: 1003,
        DEPENDENCY_NOT_FOUND: 1004,
        MIDDLEWARE_SETUP_FAILED: 2002,
        MIDDLEWARE_APPLY_FAILED: 2003,
        MIDDLEWARE_FILTER_ERROR: 2004,
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

    /**
     * Manifest Resolution Module
     * Handles FynApp manifest fetching, caching, and dependency resolution
     */
    /**
     * Built as a closure over its state rather than a class.
     *
     * The state is per-instance and entirely private, and every helper below is
     * reachable only from within — which is exactly the shape a minifier can act
     * on. Class members can never be renamed below their declared name, inlined, or
     * dropped when unused; closure variables are renamed to one character, and
     * single-use helpers get inlined away entirely. The methods that remain on the
     * returned object are only those the kernel and the tests call.
     *
     * The cast keeps `new ManifestResolver(tel)` working and correctly typed
     * at every existing call site: calling a function with `new` evaluates to the
     * object it returns.
     */
    const ManifestResolver = function (telemetry) {
        const tel = telemetry ?? noOpTelemetry;
        const manifestCache = new Map();
        const nodeMeta = new Map();
        const preloadedEntries = new Map();
        let registryResolver;
        let preloadCallback;
        const calculateDistBase = (res) => res.distBase || new URL(res.url, location.href).pathname.replace(/\/[^/]*$/, "/");
        /** Preload an entry file, deduplicated by URL and tracking its depth. */
        const preloadEntryFile = (distBase, depth) => {
            const entryUrl = `${distBase}fynapp-entry.js`;
            if (preloadedEntries.has(entryUrl)) {
                return;
            }
            preloadedEntries.set(entryUrl, depth);
            if (preloadCallback) {
                console.debug(`⚡ Preloading entry file: ${entryUrl} (depth: ${depth})`);
                preloadCallback(entryUrl, depth);
            }
        };
        const updateNodeMeta = (key, res, manifest) => {
            nodeMeta.set(key, {
                name: res.name,
                version: manifest.version || res.version,
                url: res.url,
                distBase: calculateDistBase(res),
            });
        };
        /** Emit the resolve.duration metric and resolved event for a completed resolution. */
        const reportResolved = (t0, name, version) => {
            tel.capture({ type: "metric", name: "resolve.duration", value: Date.now() - t0, data: { name } });
            captureEvent(tel, "resolved", { name, version });
        };
        /**
         * Cache a freshly obtained manifest under its resolved key and report it.
         * Shared by the embedded-manifest and fetched-manifest paths, which differ
         * only in where the manifest came from.
         */
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
            if (!res.ok)
                throw new Error(`HTTP ${res.status} for ${url}`);
            return res.json();
        };
        const resolveAndFetch = async (name, range) => {
            const t0 = Date.now();
            if (!registryResolver) {
                throw new Error("No registry resolver configured");
            }
            const res = await registryResolver(name, range);
            // Optimize: Create final key once and check cache
            const resolvedVersion = res.version;
            const cacheKey = `${res.name}@${resolvedVersion}`;
            const cached = manifestCache.get(cacheKey);
            if (cached) {
                // Fast path: already cached
                updateNodeMeta(cacheKey, { ...res, version: resolvedVersion }, cached);
                reportResolved(t0, name, cached.version || resolvedVersion);
                return { key: cacheKey, res, manifest: cached };
            }
            // Try to extract embedded manifest from entry file first (zero HTTP overhead)
            // Use Federation.import() to load the SystemJS module and extract the manifest export
            try {
                const entryUrl = res.url.replace(/fynapp\.manifest\.json$/, "fynapp-entry.js");
                const entryModule = await getFederation().import(entryUrl);
                if (entryModule && entryModule.__FYNAPP_MANIFEST__) {
                    return cacheResolved(t0, name, res, entryModule.__FYNAPP_MANIFEST__);
                }
            }
            catch (embeddedErr) {
                // Entry module doesn't exist or doesn't have embedded manifest, fall back to fetching
            }
            let manifest;
            try {
                manifest = await fetchJson(res.url);
            }
            catch (err1) {
                try {
                    // fallback to federation.json in same dist
                    manifest = await fetchJson(res.url.replace(/fynapp\.manifest\.json$/, "federation.json"));
                }
                catch (err2) {
                    // demo fallback: synthesize an empty manifest (no requires) and proceed
                    manifest = { name, version: res.version, requires: [] };
                }
            }
            return cacheResolved(t0, name, res, manifest);
        };
        const buildGraph = async (requests) => {
            const adj = new Map();
            const indegree = new Map();
            const nodes = new Set();
            const visit = async (name, range, parentKey, depth = 0) => {
                const { key, manifest } = await resolveAndFetch(name, range);
                const isNewNode = !nodes.has(key);
                if (isNewNode) {
                    nodes.add(key);
                    indegree.set(key, indegree.get(key) ?? 0);
                }
                if (parentKey) {
                    // Edge: dep (key) -> parent (parentKey)
                    const set = adj.get(key) || new Set();
                    if (!set.has(parentKey)) {
                        set.add(parentKey);
                        adj.set(key, set);
                        indegree.set(parentKey, (indegree.get(parentKey) ?? 0) + 1);
                    }
                }
                // Only process dependencies if this is the first time visiting this node
                if (!isNewNode) {
                    return key;
                }
                // Preload a dependency's entry file, then walk into it. The three
                // dependency sources below differ only in where they get the name and
                // semver from; everything after that is identical.
                const visitDep = async (depName, semver) => {
                    preloadEntryFile(calculateDistBase(await registryResolver(depName, semver)), depth + 1);
                    await visit(depName, semver, key, depth + 1);
                };
                // Process explicit requires field
                for (const req of manifest.requires || []) {
                    await visitDep(req.name, req.range);
                }
                // Process import-exposed dependencies (middleware providers, component libraries, etc.)
                const importExposed = manifest["import-exposed"];
                if (importExposed && typeof importExposed === "object") {
                    for (const [packageName, modules] of Object.entries(importExposed)) {
                        // Extract semver from any module in this package
                        let semver;
                        if (modules && typeof modules === "object") {
                            // Find the first module with a semver
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
                // Process shared-providers dependencies (shared module providers like React)
                const sharedProviders = manifest["shared-providers"];
                if (sharedProviders && typeof sharedProviders === "object") {
                    console.debug(`📦 Processing shared-providers for ${name}@${range}:`, Object.keys(sharedProviders));
                    for (const [packageName, providerInfo] of Object.entries(sharedProviders)) {
                        // Extract semver from the provider info
                        let semver;
                        if (providerInfo && typeof providerInfo === "object" && "semver" in providerInfo) {
                            semver = providerInfo.semver;
                        }
                        console.debug(`  → Loading shared provider: ${packageName}@${semver || 'latest'}`);
                        await visitDep(packageName, semver);
                    }
                }
                return key;
            };
            for (const r of requests) {
                await visit(r.name, r.range);
            }
            console.debug('buildGraph completed, nodes:', Array.from(nodes));
            captureEvent(tel, "graph.built", { nodes: nodes.size });
            return { nodes, adj, indegree };
        };
        const topoBatches = (graph) => {
            const { nodes, adj } = graph;
            const indegree = new Map(graph.indegree);
            const q = [];
            for (const n of nodes) {
                if ((indegree.get(n) ?? 0) === 0)
                    q.push(n);
            }
            const order = [];
            const batches = [];
            while (q.length) {
                // process a batch (all current zero indegree)
                const batch = q.splice(0, q.length);
                batches.push(batch);
                for (const u of batch) {
                    order.push(u);
                    for (const v of adj.get(u) ?? []) {
                        indegree.set(v, (indegree.get(v) ?? 0) - 1);
                        if ((indegree.get(v) ?? 0) === 0)
                            q.push(v);
                    }
                }
            }
            if (order.length < nodes.size) {
                const cyclic = [...nodes].filter((k) => (indegree.get(k) ?? 0) > 0);
                console.warn(`⚠️ Dependency cycle detected among: ${cyclic.join(", ")} - proceeding with best-effort loading`);
                // Add all cyclic nodes as a final batch
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
                if (!preloadCallback || !registryResolver)
                    return;
                for (const r of requests) {
                    preloadEntryFile(calculateDistBase(await registryResolver(r.name, r.range)), 0);
                }
            },
            getDistBase: calculateDistBase,
            resolveAndFetch,
            buildGraph,
            topoBatches,
        };
    };

    /**
     * Bootstrap Coordination Module
     * Handles FynApp bootstrap serialization and dependency coordination
     */
    /** Default bootstrap timeout: 30 seconds */
    const DEFAULT_BOOTSTRAP_TIMEOUT = 30000;
    /**
     * Built as a closure over its state rather than a class — see the note on
     * `ManifestResolver`.
     *
     * The collections are declared once and handed out on the returned object, so
     * internal code reaches them through a one-character closure variable while
     * external readers still see the same live Map/Array. Only `bootstrappingApp`
     * and `timeout` are reassigned primitives, so those get accessors — the
     * telemetry tests set `bootstrappingApp` directly to simulate a busy lock.
     */
    const BootstrapCoordinator = function (events, timeoutMs, telemetry) {
        const tel = telemetry ?? noOpTelemetry;
        const deferredBootstraps = [];
        const fynAppBootstrapStatus = new Map();
        const fynAppProviderModes = new Map();
        let bootstrappingApp = null;
        let timeout = timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT;
        /** Find which FynApp is the provider for a given middleware */
        const findProviderForMiddleware = (middlewareName, excludeFynApp) => {
            for (const [fynAppName, modes] of fynAppProviderModes.entries()) {
                if (fynAppName === excludeFynApp)
                    continue;
                if (modes.get(middlewareName) === "provider") {
                    return fynAppName;
                }
            }
            return null;
        };
        /** Check if a FynApp's bootstrap dependencies are satisfied */
        const areBootstrapDependenciesSatisfied = (fynApp) => {
            // Get this FynApp's provider/consumer modes for each middleware
            let modes = fynAppProviderModes.get(fynApp.name);
            if (!modes) {
                // No provider/consumer info, dependencies are satisfied
                return true;
            }
            // Check each middleware this FynApp uses
            for (const [middlewareName, mode] of modes.entries()) {
                if (mode === "consumer") {
                    // This FynApp is a consumer - find the provider
                    const providerName = findProviderForMiddleware(middlewareName, fynApp.name);
                    if (providerName && !fynAppBootstrapStatus.has(providerName)) {
                        // Provider exists but hasn't bootstrapped yet
                        console.debug(`⏳ ${fynApp.name} waiting for provider ${providerName} to bootstrap (mw: ${middlewareName})`);
                        return false;
                    }
                }
            }
            // All dependencies satisfied
            return true;
        };
        /** Release bootstrap lock and resume the next eligible deferred bootstrap. */
        const finishBootstrapAndResumeNext = () => {
            // Clear the currently bootstrapping app
            bootstrappingApp = null;
            // Find the FIRST deferred bootstrap whose dependencies are now satisfied
            const nextIndex = deferredBootstraps.findIndex((d) => areBootstrapDependenciesSatisfied(d.fynApp));
            // Resume the ready FynApp and remove from queue
            if (nextIndex >= 0) {
                const next = deferredBootstraps.splice(nextIndex, 1)[0];
                console.debug(`🔄 Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
                captureEvent(tel, "resumed", { app: next.fynApp.name });
                next.resolve();
            }
            else if (deferredBootstraps.length > 0) {
                console.debug(`⏸️ ${deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`);
            }
        };
        // Listen for bootstrap completion events
        events.on("FYNAPP_BOOTSTRAPPED", (event) => {
            const { name } = event.detail;
            console.debug(`✅ FynApp ${name} bootstrap complete, checking deferred bootstraps`);
            captureEvent(tel, "completed", { app: name });
            fynAppBootstrapStatus.set(name, "bootstrapped");
            finishBootstrapAndResumeNext();
        });
        // Also advance deferred queue on failures so the kernel doesn't stall.
        // Intentionally does not mark the app as bootstrapped; it only releases the
        // lock and advances apps whose dependencies are already satisfied.
        events.on("FYNAPP_BOOTSTRAP_FAILED", (event) => {
            const { name, error } = event.detail;
            console.debug(`❌ FynApp ${name} bootstrap failed, checking deferred bootstraps`);
            // Only attach an error object when the event actually carries one; fabricating
            // one here would record a misleading coordinator-local stack and message.
            if (error) {
                tel.capErr("failed", { app: name }, error);
            }
            else {
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
                console.debug(`🔒 ${fynAppName} acquired bootstrap lock`);
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
                const reason = bootstrappingApp !== null
                    ? `${bootstrappingApp} is currently bootstrapping`
                    : `waiting for provider dependencies`;
                console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);
                captureEvent(tel, "deferred", { app: fynApp.name, reason });
                return new Promise((resolve) => {
                    const deferred = {
                        fynApp,
                        resolve: () => {
                            // Clear timeout when resolved normally
                            if (deferred.timeoutId) {
                                clearTimeout(deferred.timeoutId);
                            }
                            resolve();
                        },
                    };
                    // Set up timeout - party goes on even if this FynApp times out
                    deferred.timeoutId = setTimeout(() => {
                        // Remove from deferred queue
                        const idx = deferredBootstraps.indexOf(deferred);
                        if (idx >= 0) {
                            deferredBootstraps.splice(idx, 1);
                        }
                        const message = `Bootstrap timeout (${timeout}ms): ${fynApp.name} timed out waiting for ${reason}`;
                        // Log timeout error but don't reject - allow promise to resolve.
                        // This prevents blocking the entire bootstrap process.
                        console.error(`⏰ ${message}. Skipping this FynApp - the party goes on!`);
                        // Capture timeout error for tel
                        tel.capErr("timeout", { app: fynApp.name, timeout, reason }, new Error(message));
                        // Emit timeout event for observability
                        events.dispatchEvent(new CustomEvent("FYNAPP_BOOTSTRAP_TIMEOUT", {
                            detail: { name: fynApp.name, version: fynApp.version, reason, timeout },
                        }));
                        // Resolve instead of reject - party goes on!
                        // The FynApp just won't be bootstrapped.
                        resolve();
                    }, timeout);
                    deferredBootstraps.push(deferred);
                });
            },
            registerProviderMode(fynAppName, middlewareName, mode) {
                let modes = fynAppProviderModes.get(fynAppName);
                if (!modes) {
                    modes = new Map();
                    fynAppProviderModes.set(fynAppName, modes);
                }
                modes.set(middlewareName, mode);
                console.debug(`📝 ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
            },
            clear() {
                bootstrappingApp = null;
                // Clear any pending timeouts
                for (const deferred of deferredBootstraps) {
                    if (deferred.timeoutId) {
                        clearTimeout(deferred.timeoutId);
                    }
                }
                // Emptied in place rather than replaced: the array is also handed out on
                // this object, so callers holding it must see the clear.
                deferredBootstraps.length = 0;
                fynAppBootstrapStatus.clear();
                fynAppProviderModes.clear();
            },
        };
    };

    /**
     * Middleware Management Module
     * Handles middleware registration, versioning, and auto-apply logic
     */
    const DummyMiddlewareReg = {
        regKey: "",
    };
    /**
     * Built as a closure over its state rather than a class — see the note on
     * `ManifestResolver` for why: closure variables mangle to a single character
     * and unused helpers are dropped, neither of which a minifier can do to class
     * members. The cast keeps `new MiddlewareManager(tel)` working at every
     * existing call site.
     */
    const MiddlewareManager = function (telemetry) {
        const tel = telemetry ?? noOpTelemetry;
        const scannedModules = new Set();
        let middlewares = {};
        let autoApply;
        const registerMiddleware = (mwReg) => {
            const { regKey, hostFynApp } = mwReg;
            const versionMap = middlewares[regKey] || Object.create(null);
            // Check if this exact middleware version is already registered
            if (versionMap[hostFynApp.version]) {
                console.debug(`⚠️ Middleware already registered: ${regKey}@${hostFynApp.version} - skipping duplicate registration`);
                return;
            }
            console.log(`🔧 Registering mw: ${regKey}, autoApplyScope:`, mwReg.mw.autoApplyScope);
            versionMap[hostFynApp.version] = mwReg;
            // set default version to the first version
            if (!versionMap.default) {
                versionMap.default = mwReg;
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
                console.debug(`🎯 Registered auto-apply middleware for [${autoApplyScope.join(', ')}]: ${regKey}@${hostFynApp.version}`);
            }
            else {
                console.debug(`✅ Registered explicit-use mw: ${regKey}@${hostFynApp.version}`);
            }
            captureEvent(tel, "registered", { key: regKey, version: hostFynApp.version, autoApply: autoApplyScope.length > 0 });
        };
        const hasScannedModule = (scanCacheKey) => scannedModules.has(scanCacheKey);
        return {
            registerMiddleware,
            getMiddleware(name, provider) {
                // If provider is specified, try exact match first
                if (provider) {
                    const versionMap = middlewares[`${provider}::${name}`];
                    if (versionMap) {
                        const mwReg = versionMap["default"];
                        if (mwReg) {
                            return mwReg;
                        }
                    }
                }
                // Fallback: scan all providers for first available default match
                for (const [key, versionMap] of Object.entries(middlewares)) {
                    if (key.endsWith(`::${name}`)) {
                        const mwReg = versionMap.default;
                        if (mwReg)
                            return mwReg;
                    }
                }
                return DummyMiddlewareReg;
            },
            getAutoApply: () => autoApply,
            scanAndRegisterMiddleware(fynApp, exposeName, exposedModule) {
                const scanCacheKey = `${fynApp.name}@${fynApp.version}::${exposeName}`;
                // Check if we've already scanned this module
                if (hasScannedModule(scanCacheKey)) {
                    console.debug(`⏭️  Skipping middleware scan for '${exposeName}' - already scanned for`, fynApp.name, fynApp.version);
                    return [];
                }
                // Mark as scanned before processing to prevent duplicate scans
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
                            mw,
                        });
                        mwExports.push(exportName);
                    }
                }
                console.debug(`✅ Expose module '${exposeName}' loaded for`, fynApp.name, fynApp.version, mwExports.length > 0 ? "middlewares registered:" : "", mwExports.join(", "));
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
                autoApply: autoApply,
            }),
            clear() {
                middlewares = {};
                autoApply = undefined;
                scannedModules.clear();
            },
        };
    };

    /**
     * Module Loading Module
     * Handles FynApp module loading and execution
     */
    /**
     * Built as a closure over its state rather than a class — see the note on
     * `ManifestResolver`.
     */
    const ModuleLoader = function (telemetry, busProvider) {
        const tel = telemetry ?? noOpTelemetry;
        /**
         * Load an expose module from a FynApp
         * @param fynApp - The FynApp to load the module from
         * @param exposeName - The name of the exposed module (e.g., "./main")
         * @param loadMiddlewares - Whether to scan for and register middlewares
         * @param middlewareScanner - Callback to scan and register middleware (delegates to MiddlewareManager)
         * @returns Result with the loaded module or an error
         */
        const loadExposeModule = async (fynApp, exposeName, loadMiddlewares, middlewareScanner) => {
            const container = fynApp.entry.container;
            if (!container?.$E[exposeName]) {
                const error = new ModuleLoadError(KernelErrorCode.EXPOSE_MODULE_NOT_FOUND, `No expose module '${exposeName}' found for ${fynApp.name}@${fynApp.version}`, {
                    fynAppName: fynApp.name,
                    fynAppVersion: fynApp.version,
                    exposeName,
                });
                tel.capErr("expose.not_found", { app: fynApp.name, expose: exposeName }, error);
                console.debug(`❌ ${error.message}`);
                return err(error);
            }
            const factory = await fynApp.entry.get(exposeName);
            const exposedModule = typeof factory === "function" ? factory() : undefined;
            if (loadMiddlewares && exposedModule && typeof exposedModule === "object") {
                // Delegate middleware scanning to MiddlewareManager via callback
                // This ensures single source of truth for scanning logic and deduplication
                if (middlewareScanner) {
                    middlewareScanner(fynApp, exposeName, exposedModule);
                }
                fynApp.exposes[exposeName] = exposedModule;
                if (exposedModule.__name) {
                    fynApp.exposes[exposedModule.__name] = exposedModule;
                }
                return ok(exposedModule);
            }
            // Module loaded but no middleware processing needed
            return ok(exposedModule);
        };
        /**
         * Load middleware from a dependency package
         * @param packageName - Name of the dependency package
         * @param middlewarePath - Path to the middleware within the package
         * @param apps - Map of loaded FynApps
         * @param middlewareScanner - Callback to scan and register middleware
         * @returns Result indicating success or error with details
         */
        const loadMiddlewareFromDependency = async (packageName, middlewarePath, apps, middlewareScanner) => {
            console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);
            // Find the dependency fynapp
            const dependencyApp = apps.get(packageName);
            if (!dependencyApp) {
                const error = new ModuleLoadError(KernelErrorCode.DEPENDENCY_NOT_FOUND, `Dependency package ${packageName} not found in runtime`, {
                    fynAppName: packageName,
                    exposeName: middlewarePath,
                });
                tel.capErr("dependency.not_found", { package: packageName, path: middlewarePath }, error);
                console.debug(`❌ ${error.message}`);
                return err(error);
            }
            // Extract the expose module from the middleware path
            // The path format is: exposeModule/middlewareName
            // Example: "middleware/design-tokens/design-tokens" -> exposeModule = "middleware/design-tokens"
            const lastSlashIndex = middlewarePath.lastIndexOf('/');
            const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
            const exposeName = `./${exposeModule}`;
            console.debug(`📦 Loading middleware module ${exposeName} from ${packageName} (full path: ${middlewarePath})`);
            const result = await loadExposeModule(dependencyApp, exposeName, true, middlewareScanner);
            if (!result.success) {
                return err(result.error);
            }
            return ok(undefined);
        };
        /**
         * Load the basics of a FynApp
         * @param fynAppEntry - The FynApp entry point
         * @param apps - Map of loaded FynApps
         * @param middlewareScanner - Callback to scan and register middleware
         */
        const loadFynAppBasics = async (fynAppEntry, apps, middlewareScanner) => {
            const container = fynAppEntry.container;
            if (!container?.name || !container?.version) {
                throw new Error(`Invalid FynApp container: ${JSON.stringify(container)}`);
            }
            console.debug("🚀 Initializing FynApp entry", container.name, container.version);
            // Step 1: Initialize the entry
            fynAppEntry.init();
            captureEvent(tel, "fynapp.init", { app: container.name, version: container.version });
            console.debug("🚀 Loading FynApp basics for", container.name, container.version);
            // Step 2: Create FynApp object early for event processing
            const fynApp = {
                name: container.name,
                version: container.version || "1.0.0",
                packageName: container.name,
                entry: fynAppEntry,
                middlewareContext: new Map(),
                exposes: {},
            };
            // Step 3: Load config
            if (container && container.$E["./config"]) {
                const factory = await fynAppEntry.get("./config");
                fynApp.config = factory();
            }
            // Step 4: Invoke entry.setup if it exists
            if (fynAppEntry.setup) {
                console.debug("🚀 Invoking entry.setup for", fynApp.name, fynApp.version);
                await fynAppEntry.setup();
            }
            // Step 5: Load main module
            const mainResult = await loadExposeModule(fynApp, "./main", true, middlewareScanner);
            if (!mainResult.success) {
                // Main module not found is not fatal - some FynApps may not have a main module
                console.debug(`⚠️ Main module not loaded for ${fynApp.name}: ${mainResult.error.message}`);
            }
            // Step 6: Proactively load middleware from dependencies
            // Get the embedded manifest from the container
            // The manifest is exported directly on the container, not as an expose module
            const manifest = container.__FYNAPP_MANIFEST__ || null;
            const importExposed = manifest?.["import-exposed"];
            if (importExposed && typeof importExposed === "object") {
                console.debug("📦 Loading middleware dependencies for", fynApp.name);
                // Collect errors for reporting but continue loading other dependencies
                const loadErrors = [];
                for (const [packageName, modules] of Object.entries(importExposed)) {
                    if (modules && typeof modules === "object") {
                        for (const [modulePath, moduleInfo] of Object.entries(modules)) {
                            // Only load middleware type dependencies
                            if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
                                // The modulePath key is already the correct exposed module path (e.g., "middleware/design-tokens")
                                // which corresponds to the "./middleware/design-tokens" expose
                                console.debug(`📦 Proactively loading mw: ${packageName}/${modulePath}`);
                                const depResult = await loadMiddlewareFromDependency(packageName, modulePath, apps, middlewareScanner);
                                if (!depResult.success) {
                                    loadErrors.push(depResult.error);
                                }
                            }
                        }
                    }
                }
                // Log collected errors but don't fail - middleware deps may be optional
                if (loadErrors.length > 0) {
                    console.debug(`⚠️ ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`, loadErrors.map(e => e.message));
                }
            }
            console.debug("✅ FynApp basics loaded for", fynApp.name, fynApp.version);
            captureEvent(tel, "fynapp.basics_loaded", { app: fynApp.name, version: fynApp.version });
            // Record app in runtime registry for observability
            apps.add(fynApp);
            return fynApp;
        };
        /**
         * Create a FynUnit runtime
         * Reuses the FynApp's middlewareContext to ensure consistency across multiple runtime creations
         */
        const mkRuntime = (fynApp) => {
            return {
                fynApp,
                // Reuse the FynApp's middlewareContext to maintain consistency
                // This is critical for deferred loading scenarios where middlewares are resumed
                middlewareContext: fynApp.middlewareContext || new Map(),
                bus: busProvider?.(fynApp),
            };
        };
        /**
         * Invoke a FynUnit
         */
        const invokeFynUnit = async (fynUnit, fynApp, autoApply, kernel) => {
            const runtime = mkRuntime(fynApp);
            // Check for middleware execution overrides
            const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);
            if (executionOverride) {
                await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
                return;
            }
            // Original execution flow for non-overridden units
            if (fynUnit.initialize) {
                console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
                const initResult = await fynUnit.initialize(runtime);
                console.debug("🚀 Initialize result:", initResult);
            }
            if (fynUnit.execute) {
                console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
                captureEvent(tel, "fynunit.execute", { app: fynApp.name });
                const executeResult = await fynUnit.execute(runtime);
                // Handle execution result - middleware defines contract, kernel just passes through
                if (executeResult) {
                    console.debug(`📦 FynUnit returned result:`, typeof executeResult === 'object' ? executeResult.type : typeof executeResult);
                }
            }
        };
        return { loadExposeModule, loadMiddlewareFromDependency, loadFynAppBasics, mkRuntime, invokeFynUnit };
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
    /**
     * A no-op FynUnit for middleware-only usage patterns
     */
    const noOpFynUnit = {
        initialize: () => ({ status: "ready" }),
        execute: () => { },
    };
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
     * Middleware Execution Module
     * Handles middleware execution, defer/retry logic, and ready state management
     */
    /** Identity of a deferred group: its member keys, order-independent. */
    function deferKeyOf(ccs) {
        return ccs
            .map((c) => c.reg.fullKey)
            .sort()
            .join("|");
    }
    /**
     * Turn a value thrown by middleware into a logged `MiddlewareError`.
     *
     * Every auto-apply failure site built the same thing by hand: the same
     * `instanceof Error` narrowing twice over (once for the message, once for the
     * cause), the same three-key context off `mwReg`, and the same `❌` log line.
     * Only the code and the summary ever differed, so those are the parameters.
     */
    function middlewareFailure(code, summary, mwReg, fynApp, error) {
        const cause = error instanceof Error ? error : undefined;
        const mwError = new MiddlewareError(code, `${summary}: ${cause ? cause.message : String(error)}`, {
            middlewareName: mwReg.mw.name,
            provider: mwReg.hostFynApp.name,
            fynAppName: fynApp.name,
            cause,
        });
        console.error(`❌ ${mwError.message}`);
        return mwError;
    }
    /**
     * Built as a closure over its state rather than a class — see the note on
     * `ManifestResolver`. The defer bookkeeping is read on nearly every path, so
     * making it closure state removes a property lookup from each one.
     */
    const MiddlewareExecutor = function (telemetry) {
        const tel = telemetry ?? noOpTelemetry;
        const middlewareReady = new Map();
        let deferInvoke = [];
        /** Runtimes whose unit.initialize already ran — a deferred group resumes
         * with the same runtime and must not re-run it (FYM-144) */
        const initializedRuntimes = new WeakSet();
        const markDeferResumeMode = (ccs, resumeMode) => {
            const key = deferKeyOf(ccs);
            for (const item of deferInvoke) {
                if (item.key === key) {
                    item.resumeMode = resumeMode;
                }
            }
        };
        /**
         * Set middleware as ready
         */
        const setMiddlewareReady = (fullKey, share) => {
            middlewareReady.set(fullKey, share);
        };
        /**
         * Check if a single middleware is ready
         */
        const checkSingleMiddlewareReady = (cc) => {
            if (middlewareReady.has(cc.reg.fullKey)) {
                cc.runtime.share = middlewareReady.get(cc.reg.fullKey);
                cc.status = "ready";
                return true;
            }
            return false;
        };
        /**
         * Check if all middlewares in the list are ready.
         *
         * Mapped before testing rather than `every`: checkSingleMiddlewareReady also
         * stamps status and share onto each context, so every one must be visited —
         * short-circuiting would leave later contexts unrefreshed.
         */
        const checkMiddlewareReady = (ccs) => {
            return ccs.map((cc) => checkSingleMiddlewareReady(cc)).every(Boolean);
        };
        /**
         * Check and handle deferred calls
         */
        const checkDeferCalls = (status, ccs) => {
            if (status === "defer") {
                if (checkMiddlewareReady(ccs)) {
                    return "retry";
                }
                // Dedupe: avoid pushing identical pending groups
                const incomingKey = deferKeyOf(ccs);
                const exists = deferInvoke.some((d) => d.key === incomingKey);
                if (!exists) {
                    deferInvoke.push({
                        callContexts: ccs,
                        resumeMode: "full",
                        key: incomingKey,
                    });
                }
                return "defer";
            }
            return "ready";
        };
        /**
         * Process ready middlewares when one becomes ready
         */
        const processReadyMiddleware = (readyKey, share) => {
            setMiddlewareReady(readyKey, share);
            // Partition the parked groups into those now fully ready and those still
            // waiting. The previous version collected indices, spliced them out back to
            // front to keep the indices valid, then reversed the result to undo that —
            // three passes and an index dance to express one filter.
            const resumes = [];
            const waiting = [];
            for (const group of deferInvoke) {
                const allReady = group.callContexts
                    .map((deferCC) => {
                    if (deferCC.reg.fullKey === readyKey) {
                        deferCC.runtime.share = share;
                        deferCC.status = "ready";
                    }
                    return deferCC.status === "ready" || deferCC.status === "skip";
                })
                    .every(Boolean);
                (allReady ? resumes : waiting).push(group);
            }
            deferInvoke = waiting;
            return { resumes };
        };
        /**
         * Validate retry count and throw if exceeded
         */
        const validateRetryCount = (ccs, tries) => {
            if (tries > 1) {
                const mwError = new MiddlewareError(KernelErrorCode.MIDDLEWARE_SETUP_FAILED, `Middleware setup failed after 2 tries for ${ccs.map(cc => cc.reg.regKey).join(", ")}`, {
                    middlewareName: ccs[0]?.reg.mw.name,
                    provider: ccs[0]?.reg.hostFynApp.name,
                    fynAppName: ccs[0]?.fynApp.name,
                });
                console.error(`🚨 ${mwError.message}`);
                throw mwError;
            }
        };
        /**
         * Run middleware setup phase and signal readiness
         * @returns {{ middlewareSetupStatus: string; hasDeferredMiddleware: boolean }}
         */
        const setupMiddlewares = async (ccs, signalReady) => {
            let middlewareSetupStatus = "ready";
            let hasDeferredMiddleware = false;
            for (const cc of ccs) {
                const { fynApp, reg } = cc;
                const mw = reg.mw;
                // Checked per context here rather than for the whole group up front: the
                // bulk pass discarded its result and only marked contexts ready, which
                // this call redoes for each one anyway — and does so later, after earlier
                // setups have had a chance to signal readiness, so it is never staler.
                checkSingleMiddlewareReady(cc);
                if (mw.setup) {
                    console.debug("🚀 Invoking middleware", reg.regKey, "setup for", fynApp.name, fynApp.version);
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
                    // A ready signal (sent by setup itself or by us above) populates the
                    // ready map and refreshes deferred contexts, but not this in-flight
                    // cc — refresh it so this first pass's applyReadyMiddlewares and
                    // runtime.share see the readiness (FYM-143)
                    checkSingleMiddlewareReady(cc);
                }
            }
            return { middlewareSetupStatus, hasDeferredMiddleware };
        };
        /**
         * Initialize the FynUnit and handle provider mode registration
         * @returns {{ allowDegraded: boolean; deferResult: string | null }} where deferResult is non-null if the caller should return early
         */
        const initializeFynUnit = async (ccs, fynUnit, fynApp, runtime, providerModeRegistrar, skipFynUnit) => {
            if (skipFynUnit || !fynUnit.initialize) {
                return { allowDegraded: false, initDeferStatus: "ready" };
            }
            // initialize is a one-time declaration per unit runtime (FYM-144)
            if (initializedRuntimes.has(runtime)) {
                return { allowDegraded: false, initDeferStatus: "ready" };
            }
            console.debug("🚀 Invoking unit.initialize for", fynApp.name, fynApp.version);
            const result = await fynUnit.initialize(runtime);
            initializedRuntimes.add(runtime);
            const allowDegraded = Boolean(result?.deferOk);
            if (result?.mode && providerModeRegistrar) {
                for (const cc of ccs) {
                    providerModeRegistrar(fynApp.name, cc.reg.mw.name, result.mode);
                }
                console.debug(`📝 ${fynApp.name} registered as ${result.mode} for middleware(s)`);
            }
            const initDeferStatus = checkDeferCalls(result?.status, ccs);
            return { allowDegraded, initDeferStatus };
        };
        /**
         * Apply middlewares that are currently ready
         */
        const applyReadyMiddlewares = async (ccs, fynApp) => {
            for (const cc of ccs) {
                if (cc.status !== "ready")
                    continue;
                const mw = cc.reg.mw;
                if (!mw.apply)
                    continue;
                console.debug("🚀 Invoking middleware", cc.reg.regKey, "apply for", fynApp.name, fynApp.version);
                await mw.apply(cc);
            }
        };
        /**
         * Execute the FynUnit with possible middleware override
         */
        const executeWithOverride = async (fynUnit, fynApp, runtime, kernel, autoApply) => {
            const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply);
            let didExecute = false;
            if (executionOverride) {
                await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, runtime, kernel);
                didExecute = true;
            }
            else if (fynUnit.execute) {
                console.debug("🚀 Invoking unit.execute for", fynApp.name, fynApp.version);
                await fynUnit.execute(runtime);
                didExecute = true;
            }
            if (didExecute) {
                captureEvent(tel, "execute.completed", { app: fynApp.name, override: !!executionOverride });
            }
        };
        /**
         * Call middlewares with setup and apply - orchestrates the middleware lifecycle
         */
        const callMiddlewares = async (ccs, options = {}, tries = 0) => {
            if (ccs.length === 0) {
                console.debug("⚠️ No middleware contexts to call, skipping middleware setup");
                return "ready";
            }
            if (tries === 0) {
                captureEvent(tel, "call.started", { count: ccs.length, app: ccs[0]?.fynApp?.name });
            }
            validateRetryCount(ccs, tries);
            // Phase 1: Setup middlewares
            const { middlewareSetupStatus, hasDeferredMiddleware } = await setupMiddlewares(ccs, options.signalReady);
            const fynUnit = ccs[0].fynUnit;
            const fynApp = ccs[0].fynApp;
            const runtime = ccs[0].runtime;
            const postSetupStatus = checkDeferCalls(middlewareSetupStatus, ccs);
            if (postSetupStatus === "retry") {
                return await callMiddlewares(ccs, options, tries + 1);
            }
            // Phase 2: Initialize the FynUnit
            const { allowDegraded, initDeferStatus } = await initializeFynUnit(ccs, fynUnit, fynApp, runtime, options.providerModeRegistrar, options.skipFynUnit);
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
            // Phase 3: Apply ready middlewares
            await applyReadyMiddlewares(ccs, fynApp);
            if (options.skipFynUnit) {
                return "ready";
            }
            if (allowDegraded && postSetupStatus === "defer") {
                markDeferResumeMode(ccs, "middleware_only");
            }
            // Phase 4: Execute with possible override
            await executeWithOverride(fynUnit, fynApp, runtime, ccs[0].kernel, options.autoApply);
            return "ready";
        };
        /**
         * Use middleware on FynUnit
         */
        const useMiddlewareOnFynUnit = async (fynUnit, fynApp, kernel, createRuntime, getMiddleware, loadMiddlewareFromDependency, autoApply) => {
            if (!fynUnit.__middlewareMeta) {
                return "";
            }
            const runtime = createRuntime();
            console.debug("🔍 Processing middleware metadata:", fynUnit.__middlewareMeta);
            const ccs = [];
            for (const meta of fynUnit.__middlewareMeta) {
                console.debug("🔍 Processing meta item:", meta);
                let cc = null;
                // Handle new string format: "-FYNAPP_MIDDLEWARE package-name middleware-path [semver]"
                if (typeof meta === 'string') {
                    cc = await parseMiddlewareString(meta, {}, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency);
                }
                else if (meta && typeof meta === 'object') {
                    console.debug("🔍 Object format meta:", meta);
                    // Check for new format with middleware property containing the string
                    if (meta.mw && typeof meta.mw === 'string') {
                        cc = await parseMiddlewareString(meta.mw, meta.config || {}, fynUnit, fynApp, kernel, runtime, getMiddleware, loadMiddlewareFromDependency);
                    }
                    else if (meta.info) {
                        // Handle legacy object format with info property
                        const info = meta.info;
                        console.debug("🔍 Legacy format - name:", info.name, "provider:", info.provider);
                        const reg = getMiddleware(info.name, info.provider);
                        if (reg.regKey === "") {
                            console.debug("❌ No middleware found for", info.name, info.provider);
                            continue;
                        }
                        cc = {
                            meta: meta,
                            fynUnit,
                            fynApp,
                            reg,
                            kernel,
                            runtime,
                            status: "",
                        };
                    }
                    else {
                        console.debug("❌ Object format missing both middleware and info properties:", meta);
                    }
                }
                if (cc) {
                    ccs.push(cc);
                }
                else {
                    console.debug("❌ Unrecognized middleware meta format:", meta);
                }
            }
            console.debug("✅ Created", ccs.length, "middleware call contexts");
            return callMiddlewares(ccs, { autoApply });
        };
        /**
         * Apply auto-scope middlewares
         * @returns Array of errors that occurred during middleware application (empty if all succeeded)
         */
        const applyAutoScopeMiddlewares = async (fynApp, fynUnit, kernel, autoApply, createRuntime, signalReady) => {
            const errors = [];
            console.log(`🎯 Auto-apply check for ${fynApp.name}: autoApply exists?`, !!autoApply);
            if (!autoApply) {
                console.log(`⏭️ No auto-apply middlewares registered yet for ${fynApp.name}`);
                return errors;
            }
            // Apply middleware based on FynApp type
            const targetMiddlewares = getTargetMiddlewares(fynApp, autoApply);
            for (const mwReg of targetMiddlewares) {
                // Check if middleware has a filter function and call it
                if (mwReg.mw.shouldApply) {
                    try {
                        const shouldApply = mwReg.mw.shouldApply(fynApp);
                        if (!shouldApply) {
                            console.debug(`⏭️ Skipping middleware ${mwReg.regKey} for ${fynApp.name} (filtered out)`);
                            continue;
                        }
                    }
                    catch (error) {
                        errors.push(middlewareFailure(KernelErrorCode.MIDDLEWARE_FILTER_ERROR, `Error in shouldApply for ${mwReg.regKey}`, mwReg, fynApp, error));
                        continue;
                    }
                }
                console.debug(`🔄 Auto-applying ${mwReg.mw.autoApplyScope} middleware ${mwReg.regKey} to ${fynApp.name}`);
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
                }
                catch (error) {
                    tel.capErr("auto_apply.failed", { mw: mwReg.regKey, app: fynApp.name }, error);
                    errors.push(middlewareFailure(KernelErrorCode.MIDDLEWARE_APPLY_FAILED, `Failed to apply auto-scope middleware ${mwReg.regKey} to ${fynApp.name}`, mwReg, fynApp, error));
                }
            }
            return errors;
        };
        /**
         * Clear executor state
         */
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
            clear,
        };
    };

    /**
     * FynApp Registry Module
     * Encapsulates the tracking and lookup of loaded FynApps.
     */
    /** Both keys a FynApp is registered under. */
    const keysOf = (fynApp) => [`${fynApp.name}@${fynApp.version}`, fynApp.name];
    const FynAppRegistry = function (initial) {
        let apps = initial || {};
        return {
            initialize(next) {
                apps = next;
            },
            add(fynApp) {
                for (const key of keysOf(fynApp))
                    apps[key] = fynApp;
            },
            get: (key) => apps[key],
            has: (key) => !!apps[key],
            remove(fynApp, lookupName) {
                if (lookupName)
                    delete apps[lookupName];
                for (const key of keysOf(fynApp))
                    delete apps[key];
            },
        };
    };

    /**
     * FynApp Lifecycle Module
     *
     * Tracks the kernel-side lifecycle state of each mounted FynApp (mount tracking).
     * State is keyed by `name@version` so multiple versions of the same FynApp are
     * tracked independently. This is the foundation for per-FynApp error boundaries
     * (recording a `failed` state) and suspend/resume.
     */
    const FynAppLifecycle = function () {
        const states = new Map();
        const key = (name, version) => `${name}@${version}`;
        return {
            set(name, version, status, error) {
                const k = key(name, version);
                const now = Date.now();
                const state = {
                    name,
                    version,
                    status,
                    error: status === "failed" ? error : undefined,
                    updatedAt: now,
                    mountedAt: status === "mounted" ? now : states.get(k)?.mountedAt,
                };
                states.set(k, state);
                return state;
            },
            get: (name, version) => states.get(key(name, version)),
            find(nameOrKey) {
                const direct = states.get(nameOrKey);
                if (direct)
                    return direct;
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
            },
        };
    };

    /**
     * FynMesh Kernel Core - Refactored Version
     * Now using extracted modules for better maintainability
     */
    /**
     * Abstract base class for FynMesh kernel implementations
     * Now using modular architecture with extracted components
     */
    class FynMeshKernelCore {
        events;
        version = "1.0.0";
        shareScopeName = fynMeshShareScope;
        /** Inter-FynApp messaging (see notes/FYNBUS_DESIGN.md) */
        bus;
        busRoot;
        runTime;
        // Middleware state registries
        #globalMiddlewareRegistry = new MiddlewareStateRegistry();
        #regionRegistries = new Map();
        // Telemetry
        tel;
        // Extracted modules
        manifestResolver;
        bootstrapCoordinator;
        mwMgr;
        loader;
        middlewareExecutor;
        fynAppRegistry;
        fynAppLifecycle;
        constructor(telemetryConfig) {
            this.events = new FynEventTarget();
            this.runTime = {
                apps: {},
                middlewares: {},
            };
            this.fynAppRegistry = new FynAppRegistry(this.runTime.apps);
            this.fynAppLifecycle = new FynAppLifecycle();
            // Initialize telemetry
            this.tel = telemetryConfig
                ? new KernelTelemetryImpl(telemetryConfig)
                : noOpTelemetry;
            // Initialize FynBus (separate from this.events, which stays lifecycle-only)
            this.busRoot = new FynBusRoot(this.tel.scope("bus"));
            this.bus = this.busRoot.forKernel();
            // Initialize extracted modules with scoped telemetry
            this.manifestResolver = new ManifestResolver(this.tel.scope("manifest"));
            this.bootstrapCoordinator = new BootstrapCoordinator(this.events, undefined, this.tel.scope("bootstrap"));
            this.mwMgr = new MiddlewareManager(this.tel.scope("middleware"));
            this.loader = new ModuleLoader(this.tel.scope("loader"), (fynApp) => this.busRoot.forApp(fynApp.name, fynApp.version));
            this.middlewareExecutor = new MiddlewareExecutor(this.tel.scope("executor"));
            // Set up event handlers
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
        /** Auto-apply middleware lists, as the executor and loader expect them. */
        #autoApply() {
            return this.mwMgr.getAutoApply();
        }
        /** Fresh FynUnit runtime for a FynApp. */
        #runtimeFor(fynApp) {
            return this.loader.mkRuntime(fynApp);
        }
        /** Telemetry payload identifying a FynApp. */
        #appData(fynApp) {
            return { app: fynApp.name, version: fynApp.version };
        }
        /** Drop the app's bus subscriptions and handlers. */
        #disposeBus(fynApp) {
            this.busRoot.disposeApp(fynApp.name, fynApp.version);
        }
        /**
         * Invoke a FynUnit lifecycle hook on every expose that implements it.
         * shutdown/suspend/resume all walk the exposes the same way and differ only
         * in which hook they look for.
         */
        async #callUnitHook(fynApp, hook) {
            for (const exposeName of Object.keys(fynApp.exposes)) {
                const fynUnit = fynApp.exposes[exposeName]?.main;
                const fn = fynUnit?.[hook];
                if (typeof fn === "function") {
                    await fn.call(fynUnit, this.#runtimeFor(fynApp));
                }
            }
        }
        /**
         * Emit a FynApp lifecycle event. Every one of them identifies the app the
         * same way — by name and version — so only the event type and any extra
         * detail vary.
         */
        #emitLifecycle(type, fynApp, extra) {
            return this.emitAsync(new CustomEvent(type, {
                detail: { name: fynApp.name, version: fynApp.version, ...extra },
            }));
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
                    cc,
                },
            });
            await this.emitAsync(event);
        }
        /**
         * Handle middleware ready event
         */
        async handleMiddlewareReady(event) {
            const { name, status, cc, share } = event.detail;
            const _share = share || {};
            // Use middleware executor to process ready middleware
            const { resumes } = this.middlewareExecutor.processReadyMiddleware(cc.reg.fullKey, _share);
            // Resume any deferred middleware calls
            for (const resume of resumes) {
                await this.middlewareExecutor.callMiddlewares(resume.callContexts, {
                    signalReady: async (cc, share) => this.signalMiddlewareReady(cc, { share }),
                    providerModeRegistrar: (fynAppName, middlewareName, mode) => this.bootstrapCoordinator.registerProviderMode(fynAppName, middlewareName, mode),
                    autoApply: this.runTime.autoApply,
                    skipFynUnit: resume.resumeMode === "middleware_only" ? true : undefined,
                });
            }
            console.debug(`✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`);
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
                // Bounded-concurrency walk over the batch. Workers share one cursor, so
                // each key is claimed once; there is no need to materialise a closure per
                // key first — the worker derives the baseUrl from nodeMeta as it goes.
                let next = 0;
                await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
                    while (next < batch.length) {
                        const meta = allMeta.get(batch[next++]);
                        const baseUrl = meta.distBase || meta.url.replace(/\/[^/]*$/, "/");
                        console.debug(`📦 Loading ${meta.name}@${meta.version} from ${baseUrl}`);
                        await this.loadFynApp(baseUrl);
                    }
                }));
            }
            this.tel.capture({ type: "event", name: "load_batch.completed" });
        }
        /**
         * Register a middleware implementation
         */
        registerMiddleware(mwReg) {
            this.mwMgr.registerMiddleware(mwReg);
            // Update runtime
            const exported = this.mwMgr.exportToRuntime();
            this.runTime.middlewares = exported.middlewares;
            this.runTime.autoApply = exported.autoApply;
        }
        /**
         * Get middleware by name and provider
         */
        getMiddleware(name, provider) {
            return this.mwMgr.getMiddleware(name, provider);
        }
        /**
         * Get middleware state registry for global or region scope
         */
        getMiddlewareRegistry(scope) {
            if (scope === "global") {
                return this.#globalMiddlewareRegistry;
            }
            const regionId = scope.region;
            if (!this.#regionRegistries.has(regionId)) {
                this.#regionRegistries.set(regionId, this.#globalMiddlewareRegistry.createScope());
            }
            return this.#regionRegistries.get(regionId);
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
            return this.loader.loadFynAppBasics(fynAppEntry, this.fynAppRegistry, this.createMiddlewareScanner());
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
                console.debug(`✅ FynApp ${fynAppKey} already loaded, returning existing instance`);
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
                // Path 1: Simple function - wrap as FynUnit
                return { execute: mainExport };
            }
            if (mainExport && typeof mainExport.execute === "function") {
                // Path 2: Object with execute method - valid FynUnit
                return mainExport;
            }
            throw new Error(`${fynAppName}: main export must be a function or have an execute method. ` +
                `Got: ${typeof mainExport}${mainExport ? ` with keys: ${Object.keys(mainExport).join(", ")}` : ""}`);
        }
        /**
         * Check bootstrap readiness and handle deferral if needed
         * Returns true if bootstrap should proceed, false if it should be skipped
         */
        async checkBootstrapReadiness(fynApp) {
            // Check if can bootstrap or need to defer
            if (!this.bootstrapCoordinator.canBootstrap(fynApp)) {
                console.debug(`⏸️ Deferring bootstrap of ${fynApp.name}`);
                await this.bootstrapCoordinator.deferBootstrap(fynApp);
                console.debug(`▶️ Resuming bootstrap of ${fynApp.name}`);
            }
            // Acquire bootstrap lock (must succeed to preserve serialization)
            if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
                console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (bootstrap lock busy)`);
                await this.bootstrapCoordinator.deferBootstrap(fynApp);
                console.debug(`▶️ Resuming bootstrap of ${fynApp.name} (retry lock acquisition)`);
                if (!this.bootstrapCoordinator.acquireBootstrapLock(fynApp.name)) {
                    console.error(`⏰ ${fynApp.name} unable to acquire bootstrap lock after deferral; skipping bootstrap`);
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
                    await this.loader.loadExposeModule(fynApp, exposeName, true, middlewareScanner);
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
            console.debug("🚀 Bootstrapping FynApp", fynApp.name, fynApp.version);
            // Validate and normalize to FynUnit
            const fynUnit = this.validateFynUnit(mainExport, fynApp.name);
            // Apply auto-scope middlewares
            const middlewareErrors = await this.middlewareExecutor.applyAutoScopeMiddlewares(fynApp, fynUnit, this, this.#autoApply(), () => this.#runtimeFor(fynApp), async (cc, share) => this.signalMiddlewareReady(cc, { share }));
            // Log middleware errors but don't fail bootstrap - middleware issues shouldn't break the app
            if (middlewareErrors.length > 0) {
                console.warn(`⚠️ ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`, middlewareErrors.map(e => e.toDetailedString()));
            }
            return fynUnit;
        }
        /**
         * Execute a FynUnit directly (Path B: no explicit middleware meta)
         */
        async executeFynUnit(fynUnit, fynApp) {
            await this.loader.invokeFynUnit(fynUnit, fynApp, this.#autoApply(), this);
        }
        /**
         * Bootstrap a fynapp
         */
        async bootstrapFynApp(fynApp) {
            // Mount tracking: record that bootstrap is in progress (may be deferred
            // by the readiness check while waiting on provider FynApps).
            this.fynAppLifecycle.set(fynApp.name, fynApp.version, "bootstrapping");
            // Check readiness and acquire lock
            if (!await this.checkBootstrapReadiness(fynApp)) {
                return;
            }
            captureEvent(this.tel, "bootstrap.started", this.#appData(fynApp));
            try {
                // Load middleware modules for all FynApps
                await this.loadMiddlewareModules(fynApp);
                // Prepare and validate main export
                const fynUnit = await this.prepareMainExport(fynApp);
                if (fynUnit) {
                    // Simplified 2-path execution:
                    // Path A: FynUnit with non-empty __middlewareMeta - full middleware coordination
                    // Path B: FynUnit without __middlewareMeta or empty array - direct execution with auto-apply only
                    // FYM-99: Check for non-empty array to avoid skipping FynUnit execution
                    if (fynUnit.__middlewareMeta && fynUnit.__middlewareMeta.length > 0) {
                        // Path A: Full middleware coordination
                        const middlewareScanner = this.createMiddlewareScanner();
                        await this.middlewareExecutor.useMiddlewareOnFynUnit(fynUnit, fynApp, this, () => this.#runtimeFor(fynApp), (name, provider) => this.getMiddleware(name, provider), async (packageName, middlewarePath) => {
                            await this.loader.loadMiddlewareFromDependency(packageName, middlewarePath, this.fynAppRegistry, middlewareScanner);
                        }, this.#autoApply());
                    }
                    else {
                        // Path B: Direct execution with auto-apply middleware only
                        await this.executeFynUnit(fynUnit, fynApp);
                    }
                }
                console.debug("✅ FynApp bootstrapped", fynApp.name, fynApp.version);
                // Mount tracking: bootstrap succeeded — app is now mounted/running.
                this.fynAppLifecycle.set(fynApp.name, fynApp.version, "mounted");
                captureEvent(this.tel, "bootstrap.completed", this.#appData(fynApp));
                // Emit bootstrap complete event
                await this.#emitLifecycle("FYNAPP_BOOTSTRAPPED", fynApp);
            }
            catch (error) {
                this.tel.capErr("bootstrap.failed", { app: fynApp.name }, error);
                // Per-FynApp error boundary: record the failure as observable state
                // (queryable via getFynAppState) while keeping the app in the registry and
                // letting other FynApps continue below.
                this.fynAppLifecycle.set(fynApp.name, fynApp.version, "failed", error);
                // Error isolation: Log error but don't crash the kernel
                console.error(`❌ Bootstrap failed for ${fynApp.name}:`, error);
                // Deafen the half-initialized app: drop its bus subscriptions and
                // handlers; a later re-bootstrap gets a fresh facade (FYM-140)
                this.#disposeBus(fynApp);
                // Emit failure event so other systems can react
                await this.#emitLifecycle("FYNAPP_BOOTSTRAP_FAILED", fynApp, { error });
                // Release lock so other FynApps can continue - party goes on!
                this.bootstrapCoordinator.releaseBootstrapLock();
                // Don't rethrow - allow other FynApps to bootstrap
                // The error has been logged and an event emitted for observability
            }
        }
        /**
         * Shutdown a FynApp - calls shutdown() on its FynUnits and removes from registry
         * @param name - Can be either "name" or "name@version" format
         */
        async shutdownFynApp(name) {
            const fynApp = this.fynAppRegistry.get(name);
            if (!fynApp) {
                console.debug(`⚠️ shutdownFynApp: FynApp "${name}" not found`);
                return false;
            }
            console.debug(`🛑 Shutting down FynApp ${name}`);
            captureEvent(this.tel, "shutdown.started", { app: name });
            // Mount tracking: mark the transient shutdown state so shutdown() hooks that
            // query state see it; removeFromRegistry() then stops tracking the app.
            this.fynAppLifecycle.set(fynApp.name, fynApp.version, "shutdown");
            try {
                await this.#callUnitHook(fynApp, "shutdown");
                // Remove from registry (both versioned and unversioned keys)
                this.removeFromRegistry(fynApp, name);
                // Remove all of the app's bus subscriptions
                this.#disposeBus(fynApp);
                // Emit shutdown event
                await this.#emitLifecycle("FYNAPP_SHUTDOWN", fynApp);
                captureEvent(this.tel, "shutdown.completed", this.#appData(fynApp));
                console.debug(`✅ FynApp ${fynApp.name}@${fynApp.version} shutdown complete`);
                return true;
            }
            catch (error) {
                this.tel.capErr("shutdown.failed", { app: name }, error);
                console.error(`❌ Error during shutdown of ${name}:`, error);
                // Still remove from registry and clean up bus even if shutdown fails
                this.removeFromRegistry(fynApp, name);
                this.#disposeBus(fynApp);
                return false;
            }
        }
        /**
         * Suspend a mounted FynApp (only mounted -> suspended is valid).
         */
        async suspendFynApp(name) {
            return this.#transitionLifecycle(name, {
                from: "mounted",
                to: "suspended",
                hook: "suspend",
                event: "FYNAPP_SUSPENDED",
            });
        }
        /**
         * Resume a suspended FynApp (only suspended -> mounted is valid).
         */
        async resumeFynApp(name) {
            return this.#transitionLifecycle(name, {
                from: "suspended",
                to: "mounted",
                hook: "resume",
                event: "FYNAPP_RESUMED",
            });
        }
        /**
         * Shared suspend/resume machinery: guard the current lifecycle status, call
         * the given FynUnit hook on each expose that implements it, update state, and
         * emit the lifecycle event. Returns false (no-op) on invalid transitions.
         */
        async #transitionLifecycle(name, opts) {
            const fynApp = this.fynAppRegistry.get(name);
            if (!fynApp) {
                console.debug(`⚠️ ${opts.hook}FynApp: FynApp "${name}" not found`);
                return false;
            }
            const state = this.fynAppLifecycle.get(fynApp.name, fynApp.version);
            if (state?.status !== opts.from) {
                console.debug(`⚠️ ${opts.hook}FynApp: "${name}" is ${state?.status ?? "untracked"}, expected ${opts.from}`);
                return false;
            }
            captureEvent(this.tel, `${opts.hook}.started`, this.#appData(fynApp));
            try {
                await this.#callUnitHook(fynApp, opts.hook);
                this.fynAppLifecycle.set(fynApp.name, fynApp.version, opts.to);
                await this.#emitLifecycle(opts.event, fynApp);
                captureEvent(this.tel, `${opts.hook}.completed`, this.#appData(fynApp));
                return true;
            }
            catch (error) {
                this.tel.capErr(`${opts.hook}.failed`, { app: name }, error);
                console.error(`❌ Error during ${opts.hook} of ${name}:`, error);
                return false;
            }
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
         * Protected helper to build fynapp URL
         */
        buildFynAppUrl(baseUrl, entryFile = "fynapp-entry.js") {
            return urlJoin(baseUrl, entryFile);
        }
    }

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
        DEFERRED: 'deferred'};

    /**
     * Browser-specific implementation of FynMesh kernel
     * Handles Federation.js integration and browser-specific loading
     */
    class BrowserKernel extends FynMeshKernelCore {
        #preloadStrategy = {
            depth: 1, // Default: requested + immediate dependencies
            priority: 'static',
            priorityByDepth: {
                0: PreloadPriority.CRITICAL,
                1: PreloadPriority.IMPORTANT,
                2: PreloadPriority.DEFERRED
            },
            disabled: false
        };
        /**
         * Resolve preload strategy from options: instance defaults, overlaid with
         * whatever the caller specified. `preload` may be a bare number, meaning depth.
         */
        #resolvePreloadStrategy(options) {
            const preload = options?.preload;
            const defaults = this.#preloadStrategy;
            if (!preload) {
                return defaults;
            }
            if (typeof preload === "number") {
                return { ...defaults, depth: preload };
            }
            // Spread skips absent keys, but an explicitly-undefined one would clobber
            // its default, so those are dropped first.
            return {
                ...defaults,
                ...Object.fromEntries(Object.entries(preload).filter(([, v]) => v !== undefined)),
            };
        }
        /**
         * Inject a preload link tag into the document head
         * @private
         */
        #injectPreloadLink(url) {
            // Skip if document/head not available
            if (typeof document === "undefined" || !document.head) {
                return;
            }
            // Classic script preload, not modulepreload: entry files are System.register
            // output and SystemJS loads them via an injected classic <script>. A
            // modulepreload is fetched as a module in CORS mode, which never matches the
            // no-cors classic load that follows — the entry would be fetched twice.
            const link = document.createElement("link");
            link.rel = "preload";
            link.href = url;
            link.as = "script";
            // Append to head
            document.head.appendChild(link);
        }
        /**
         * Try to preload a URL based on current preload strategy
         * This is the public API for preload functionality
         * @param url - The URL to preload
         * @param depth - The dependency depth (0 = direct request, 1+ = transitive)
         */
        tryPreload(url, depth) {
            // Check if preloading is disabled
            if (this.#preloadStrategy.disabled) {
                console.debug(`⏭️  Preload disabled, skipping: ${url} (depth: ${depth})`);
                return;
            }
            // Check if depth exceeds max depth
            if (depth > this.#preloadStrategy.depth) {
                console.debug(`⏭️  Depth ${depth} > max ${this.#preloadStrategy.depth}, skipping: ${url}`);
                return;
            }
            // Inject the preload link
            this.#injectPreloadLink(url);
        }
        /**
         * Override loadFynAppsByName to handle preload strategy
         */
        async loadFynAppsByName(requests, options) {
            // Resolve and store strategy for this load
            const strategy = this.#resolvePreloadStrategy(options);
            // Store strategy temporarily for preload callback
            const previousStrategy = this.#preloadStrategy;
            this.#preloadStrategy = strategy;
            try {
                // Call parent implementation
                await super.loadFynAppsByName(requests, options);
            }
            finally {
                // Restore previous strategy
                this.#preloadStrategy = previousStrategy;
            }
        }
        /**
         * Load a remote FynApp through Federation.js (browser-specific).
         *
         * Throws if the Federation.js runtime is absent (an environment precondition,
         * via `getFederation()` — note this check is intentionally outside the
         * try/catch below). Once Federation is available, any per-app load failure
         * (import / basics / bootstrap) is isolated and resolves to `null` rather than
         * throwing. See `FynMeshKernel.loadFynApp` for the full error contract.
         *
         * @returns the loaded FynApp after bootstrapping, or null on load failure
         */
        async loadFynApp(baseUrl, loadId) {
            const Federation = getFederation();
            try {
                loadId = loadId || baseUrl;
                captureEvent(this.tel, "fynapp.load_started", { url: baseUrl });
                const urlPath = this.buildFynAppUrl(baseUrl);
                console.debug("🚀 Loading FynApp from", urlPath);
                const fynAppEntry = await Federation.import(urlPath);
                // Check if already loaded - return existing instance to prevent duplicates
                const existing = this.checkAlreadyLoaded(fynAppEntry);
                if (existing) {
                    return existing;
                }
                const fynApp = await this.loadFynAppBasics(fynAppEntry);
                await this.bootstrapFynApp(fynApp);
                captureEvent(this.tel, "fynapp.loaded", { app: fynApp.name, version: fynApp.version });
                return fynApp;
            }
            catch (err) {
                this.tel.capErr("fynapp.load_failed", { url: baseUrl }, err);
                console.error(`Failed to load FynApp from ${baseUrl}:`, err);
                return null;
            }
        }
    }
    /**
     * Create and initialize a browser kernel instance
     */
    function createBrowserKernel() {
        const kernel = new BrowserKernel();
        // Initialize kernel runtime
        kernel.initRunTime({
            apps: {},
            middlewares: {},
        });
        // Demo-server resolver: manifest at /<name>/dist/fynapp.manifest.json and base at /<name>/dist/
        kernel.setRegistryResolver(async (name, range) => {
            return {
                name,
                version: "0.0.0", // version not critical for demo resolver; keying by name is fine
                url: `/${name}/dist/fynapp.manifest.json`,
                distBase: `/${name}/dist/`,
            };
        });
        // Set up preload callback to use the kernel's public tryPreload API
        kernel.setPreloadCallback((url, depth) => {
            kernel.tryPreload(url, depth);
        });
        return kernel;
    }

    const OVERLAY_ATTRIBUTE = "data-fynmesh-error-overlay";
    function getFailureText(error) {
        if (error instanceof Error) {
            return { message: error.message, stack: error.stack };
        }
        if (error && typeof error === "object") {
            const value = error;
            if (typeof value.message === "string") {
                return {
                    message: value.message,
                    stack: typeof value.stack === "string" ? value.stack : undefined,
                };
            }
        }
        return { message: error === undefined ? "Unknown error" : String(error) };
    }
    /**
     * Show FynApp bootstrap failures in development builds.
     * Returns a disposer that removes both the listener and any visible overlay.
     */
    function installDevErrorOverlay(events, doc = document) {
        let overlayHost;
        const removeOverlay = () => {
            overlayHost?.remove();
            overlayHost = undefined;
        };
        const handleFailure = (event) => {
            const detail = event.detail ?? {};
            const name = typeof detail.name === "string" ? detail.name : "Unknown FynApp";
            const version = typeof detail.version === "string" ? `@${detail.version}` : "";
            const failure = getFailureText(detail.error);
            removeOverlay();
            const host = doc.createElement("div");
            host.setAttribute(OVERLAY_ATTRIBUTE, "");
            const shadow = host.attachShadow({ mode: "open" });
            const style = doc.createElement("style");
            style.textContent = `
      :host { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: start center; padding: 24px; box-sizing: border-box; background: rgb(0 0 0 / 55%); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      section { width: min(900px, 100%); max-height: calc(100vh - 48px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid #ff6b6b; border-radius: 8px; background: #1e1114; color: #ffe8e8; box-shadow: 0 12px 40px rgb(0 0 0 / 45%); }
      header { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
      h1 { margin: 0; font: 700 18px/1.4 system-ui, sans-serif; }
      .identity { margin: 8px 0 16px; color: #ffb3b3; font-weight: 700; }
      .message { margin: 0; white-space: pre-wrap; }
      pre { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #633; color: #ffd3d3; white-space: pre-wrap; overflow-wrap: anywhere; }
      button { border: 1px solid #a55; border-radius: 4px; padding: 4px 9px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
      button:hover { background: #432; }
    `;
            const panel = doc.createElement("section");
            panel.setAttribute("role", "alert");
            const header = doc.createElement("header");
            const heading = doc.createElement("h1");
            heading.textContent = "FynApp failed to start";
            const dismiss = doc.createElement("button");
            dismiss.type = "button";
            dismiss.textContent = "Dismiss";
            dismiss.addEventListener("click", removeOverlay, { once: true });
            header.append(heading, dismiss);
            const identity = doc.createElement("div");
            identity.className = "identity";
            identity.textContent = `${name}${version}`;
            const message = doc.createElement("p");
            message.className = "message";
            message.textContent = failure.message;
            panel.append(header, identity, message);
            if (failure.stack) {
                const stack = doc.createElement("pre");
                stack.textContent = failure.stack;
                panel.append(stack);
            }
            shadow.append(style, panel);
            overlayHost = host;
            (doc.body ?? doc.documentElement).append(host);
        };
        events.addEventListener("FYNAPP_BOOTSTRAP_FAILED", handleFailure);
        return () => {
            events.removeEventListener("FYNAPP_BOOTSTRAP_FAILED", handleFailure);
            removeOverlay();
        };
    }

    /**
     * Global development browser kernel with the bootstrap error overlay enabled.
     */
    const kernel = createBrowserKernel();
    globalThis.fynMeshKernel = kernel;
    installDevErrorOverlay(kernel.events);

})();
//# sourceMappingURL=fynmesh-browser-kernel.dev.js.map
