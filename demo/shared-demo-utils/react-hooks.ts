/**
 * Shared React hooks for middleware integration in demo FynApps.
 *
 * These hooks extract common patterns for counter and design token
 * middleware integration that are duplicated across multiple demo apps.
 *
 * NOTE: The React hooks (useState, useEffect) must be passed in by
 * the consuming app to avoid version conflicts between apps using
 * different React versions.
 */

import { getSharedCounterData } from "./middleware-helpers.ts";

// Minimal runtime shape needed by the hooks
interface MinimalRuntime {
  middlewareContext: Map<string, any>;
  fynApp?: { name: string };
}

/**
 * Hook for integrating with the shared basic-counter middleware.
 *
 * Manages:
 * - Reading the current count from middleware context or global registry
 * - Listening for counter change events from other apps
 * - Listening for MIDDLEWARE_READY events for late-provider scenarios
 * - Providing increment/reset actions
 *
 * @param useState - React.useState hook from the consuming app's React version
 * @param useEffect - React.useEffect hook from the consuming app's React version
 * @param runtime - The FynUnitRuntime
 * @param middlewareConfig - Optional initial config from middleware
 */
export function useSharedCounter(
  useState: any,
  useEffect: any,
  runtime: MinimalRuntime | undefined,
  middlewareConfig?: { count: number }
) {
  const [counter, setCounter] = useState({
    count: middlewareConfig?.count || 0,
  });

  // Set up event listener for counter changes from other apps
  useEffect(() => {
    const readCount = () => {
      const sharedData = getSharedCounterData(runtime);
      return sharedData?.config?.count || middlewareConfig?.count || 0;
    };

    const syncWithSharedData = () => {
      setCounter({ count: readCount() });
    };

    // Initial sync
    syncWithSharedData();

    // Set up event listener for changes from other apps
    const handleCounterChange = (event: CustomEvent) => {
      const { count, source } = event.detail;
      if (source !== runtime?.fynApp?.name) {
        setCounter({ count });
        console.debug(
          `\u{1F504} ${runtime?.fynApp?.name}: Received counter update from ${source}:`,
          count
        );
      }
    };

    // Track current listener for cleanup
    let currentEventTarget: EventTarget | null = null;

    const setupCounterListener = () => {
      const sharedData = getSharedCounterData(runtime);
      if (sharedData?.eventTarget && sharedData.eventTarget !== currentEventTarget) {
        if (currentEventTarget) {
          currentEventTarget.removeEventListener("counterChanged", handleCounterChange);
        }
        currentEventTarget = sharedData.eventTarget;
        currentEventTarget.addEventListener("counterChanged", handleCounterChange);
        syncWithSharedData();
        console.debug(`\u2705 ${runtime?.fynApp?.name}: Subscribed to counter events`);
      }
    };

    // Initial setup
    setupCounterListener();

    // Listen for MIDDLEWARE_READY to handle late provider loading
    const kernel: any = (globalThis as any).fynMeshKernel;
    const kernelEvents: EventTarget | undefined = kernel?.events;

    const handleMiddlewareReady = (event: Event) => {
      const detail: any = (event as any).detail;
      if (detail?.name === "basic-counter") {
        console.debug(`\u{1F514} ${runtime?.fynApp?.name}: basic-counter became ready, syncing...`);
        setupCounterListener();
      }
    };

    if (kernelEvents) {
      kernelEvents.addEventListener("MIDDLEWARE_READY", handleMiddlewareReady);
    }

    return () => {
      if (currentEventTarget) {
        currentEventTarget.removeEventListener("counterChanged", handleCounterChange);
      }
      if (kernelEvents) {
        kernelEvents.removeEventListener("MIDDLEWARE_READY", handleMiddlewareReady);
      }
    };
  }, [runtime, middlewareConfig]);

  const handleIncrement = () => {
    const sharedData = getSharedCounterData(runtime);
    if (sharedData?.increment) {
      const newCount = sharedData.increment(runtime?.fynApp?.name);
      setCounter({ count: newCount });
    }
  };

  const handleReset = () => {
    const sharedData = getSharedCounterData(runtime);
    if (sharedData?.reset) {
      const newCount = sharedData.reset(runtime?.fynApp?.name);
      setCounter({ count: newCount });
    }
  };

  return { counter, handleIncrement, handleReset };
}

/**
 * Hook for integrating with the design-tokens middleware.
 *
 * Manages:
 * - Current theme state
 * - Apply globally / accept globally toggles
 * - Theme change subscription
 * - Theme switching with local/global scope
 *
 * @param useState - React.useState hook from the consuming app's React version
 * @param useEffect - React.useEffect hook from the consuming app's React version
 * @param runtime - The FynUnitRuntime
 * @param initialTheme - The initial theme name (e.g. "fynmesh-dark")
 */
export function useDesignTokens(
  useState: any,
  useEffect: any,
  runtime: MinimalRuntime | undefined,
  initialTheme: string = "fynmesh-dark"
) {
  const [currentTheme, setCurrentTheme] = useState(initialTheme);
  const [applyGlobally, setApplyGlobally] = useState(false);
  const [acceptGlobally, setAcceptGlobally] = useState(false);

  // Set up design tokens and theme management
  useEffect(() => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      const api = designTokensData.api;

      // Initialize current theme
      const theme = api.getTheme();
      setCurrentTheme(theme);

      // Initialize accept globally from API (shared state)
      const globalOptIn = api.getGlobalOptIn();
      setAcceptGlobally(globalOptIn);

      // Initialize apply globally from localStorage (local state)
      const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
      const savedApplyGlobally = localStorage.getItem(applyGloballyKey);
      setApplyGlobally(savedApplyGlobally === "true");

      // Subscribe to theme changes
      const unsubscribe = api.subscribeToThemeChanges(
        (theme: string, _tokens: any, fynAppName?: string) => {
          if (
            fynAppName === runtime?.fynApp?.name ||
            (!fynAppName && api.getGlobalOptIn())
          ) {
            setCurrentTheme(theme);
            console.debug(
              `\u{1F3A8} ${runtime?.fynApp?.name}: Theme changed to ${theme}${fynAppName ? ` for ${fynAppName}` : " globally"}`
            );
          }
        }
      );

      return unsubscribe;
    }
  }, [runtime]);

  // Theme switching function
  const handleThemeChange = (theme: string) => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      const api = designTokensData.api;

      if (applyGlobally) {
        api.setTheme(theme, true);
        if (!acceptGlobally) {
          api.setTheme(theme, false);
        }
      } else {
        api.setTheme(theme, false);
      }
    }
  };

  // Handle apply globally toggle
  const handleApplyGloballyChange = (apply: boolean) => {
    setApplyGlobally(apply);
    const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
    localStorage.setItem(applyGloballyKey, apply.toString());
  };

  // Handle accept globally toggle
  const handleAcceptGloballyChange = (accept: boolean) => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      designTokensData.api.setGlobalOptIn(accept);
      setAcceptGlobally(accept);
    }
  };

  return {
    currentTheme,
    applyGlobally,
    acceptGlobally,
    handleThemeChange,
    handleApplyGloballyChange,
    handleAcceptGloballyChange,
  };
}
