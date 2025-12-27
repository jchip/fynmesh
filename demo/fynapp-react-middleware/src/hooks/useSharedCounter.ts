/**
 * Shared counter hook types and factory.
 * Uses factory pattern to support multiple React versions in micro-frontends.
 */

export interface SharedCounterState {
  count: number;
  connected: boolean;
  loading: boolean;
  increment: () => void;
  reset: () => void;
}

export interface CounterAPI {
  config: { count: number };
  eventTarget: EventTarget;
  increment: (source?: string) => number;
  reset: (source?: string) => number;
}

export interface ReactHooks {
  useState: typeof import("react").useState;
  useEffect: typeof import("react").useEffect;
  useCallback: typeof import("react").useCallback;
  useRef: typeof import("react").useRef;
}

/**
 * Factory to create useSharedCounter hook with the consumer's React version.
 * This ensures hooks work correctly in multi-version React environments.
 *
 * @param React - React hooks from consumer's React version
 * @returns useSharedCounter hook
 *
 * @example
 * // In your FynApp:
 * import { useState, useEffect, useCallback, useRef } from "react"; // or "esm-react"
 * import { createUseSharedCounter } from "fynapp-react-middleware/hooks/useSharedCounter";
 *
 * const useSharedCounter = createUseSharedCounter({ useState, useEffect, useCallback, useRef });
 *
 * // Then use it:
 * const { count, connected, increment, reset } = useSharedCounter(runtime, "my-app");
 */
export function createUseSharedCounter(hooks: ReactHooks) {
  const { useState, useEffect, useCallback, useRef } = hooks;

  return function useSharedCounter(runtime: any, appName?: string): SharedCounterState {
  const [count, setCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Refs to avoid stale closures
  const counterAPIRef = useRef<CounterAPI | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Get counter API from middlewareContext or global registry
  const getCounterAPI = useCallback((): CounterAPI | null => {
    // First try runtime.middlewareContext
    if (runtime?.middlewareContext) {
      const api = runtime.middlewareContext.get("basic-counter");
      if (api) return api;
    }
    // Fallback: check global registry
    const kernel: any = (globalThis as any).fynMeshKernel;
    const registry = kernel?.getMiddlewareRegistry?.("global");
    const state = registry?.lookup?.("basic-counter");
    return state?.get?.() || null;
  }, [runtime]);

  // Setup subscription to counter events
  const setupSubscription = useCallback((api: CounterAPI) => {
    // Clean up previous subscription
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    counterAPIRef.current = api;
    setCount(api.config.count);
    setConnected(true);
    setLoading(false);

    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.source !== appName) {
        setCount(detail.count);
      }
    };

    api.eventTarget.addEventListener("counterChanged", handleChange);

    cleanupRef.current = () => {
      api.eventTarget.removeEventListener("counterChanged", handleChange);
    };
  }, [appName]);

  useEffect(() => {
    let mounted = true;
    let waitingForState = false;

    const init = async () => {
      // Try immediate lookup
      const api = getCounterAPI();
      if (api) {
        if (mounted) setupSubscription(api);
        return;
      }

      // Wait for state via registry (efficient - no polling)
      const kernel: any = (globalThis as any).fynMeshKernel;
      const registry = kernel?.getMiddlewareRegistry?.("global");

      if (registry?.waitFor) {
        waitingForState = true;
        try {
          const state = await registry.waitFor("basic-counter", 60000);
          if (mounted && state) {
            setupSubscription(state.get());
          }
        } catch (err) {
          if (mounted) {
            console.warn("useSharedCounter: Timeout waiting for provider");
            setLoading(false);
          }
        }
        waitingForState = false;
      } else {
        // Fallback: no registry available
        if (mounted) setLoading(false);
      }
    };

    init();

    return () => {
      mounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [getCounterAPI, setupSubscription]);

  // Action handlers
  const increment = useCallback(() => {
    const api = counterAPIRef.current || getCounterAPI();
    if (api?.increment) {
      const newCount = api.increment(appName);
      setCount(newCount);
    }
  }, [appName, getCounterAPI]);

  const reset = useCallback(() => {
    const api = counterAPIRef.current || getCounterAPI();
    if (api?.reset) {
      const newCount = api.reset(appName);
      setCount(newCount);
    }
  }, [appName, getCounterAPI]);

  return { count, connected, loading, increment, reset };
  };
}
