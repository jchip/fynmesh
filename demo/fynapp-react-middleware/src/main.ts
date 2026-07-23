import { ReactContextMiddleware } from "./middleware/react-context";
import { FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

// =============================================================================
// Export for Federation
// =============================================================================

/**
 * Export middleware instance for federation loading
 * The kernel will look for exports that start with __middleware__
 */
export const __middleware__ReactContext = new ReactContextMiddleware();

export const __middleware__BasicCounter: FynAppMiddleware = {
  name: "basic-counter",

  async setup(cc: FynAppMiddlewareCallContext): Promise<any> {
    const mwContext = cc.runtime.middlewareContext;

    // Get the global middleware state registry from kernel
    const registry = cc.kernel.getMiddlewareRegistry("global");

    const config = cc.meta.config;

    if (config !== "consume-only") {
      // PROVIDER MODE: Create and register the counter state

      // Check if already provided (handles re-execution)
      let counterState = registry.lookup<any>("basic-counter");

      if (!counterState) {
        // First time - create the counter state
        const initialConfig = {
          count: 0,
          ...(config as any),
        };

        const eventTarget = new EventTarget();

        // Create the data object that will be stored in ObservableState
        const data = {
          initialConfig, // Store the original config for reset functionality
          config: { ...initialConfig }, // Current working config
          eventTarget, // Standard EventTarget for inter-app communication

          // Methods for apps to use
          increment(source?: string) {
            this.config.count++;
            const event = new CustomEvent("counterChanged", {
              detail: {
                count: this.config.count,
                source: source || "unknown",
              },
            });
            this.eventTarget.dispatchEvent(event);
            return this.config.count;
          },

          reset(source?: string) {
            this.config.count = this.initialConfig.count;
            const event = new CustomEvent("counterChanged", {
              detail: {
                count: this.config.count,
                source: source || "unknown",
              },
            });
            this.eventTarget.dispatchEvent(event);
            return this.config.count;
          },

          setCount(newCount: number, source?: string) {
            this.config.count = newCount;
            const event = new CustomEvent("counterChanged", {
              detail: {
                count: this.config.count,
                source: source || "unknown",
              },
            });
            this.eventTarget.dispatchEvent(event);
            return this.config.count;
          },
        };

        // Register state in the global registry
        counterState = registry.provide("basic-counter", data);
        console.debug(
          `✅ fynapp-react-middleware: Basic counter state provided to global registry`,
          Date.now()
        );
      }

      // Store the ObservableState in middleware context for backward compatibility
      // Components will access counterState.get() to get the actual data object
      mwContext.set(this.name, counterState.get());

      const kernelAny: any = cc.kernel as any;
      if (typeof kernelAny.signalMiddlewareReady === "function") {
        await kernelAny.signalMiddlewareReady(cc, { name: this.name, status: "ready" });
      } else {
        const event = new CustomEvent("MIDDLEWARE_READY", {
          detail: { name: this.name, status: "ready", cc },
        });
        cc.kernel.emitAsync(event);
      }
      console.debug(
        `🔍 fynapp-react-middleware: Basic counter ready event dispatched now:`,
        Date.now()
      );

      return { status: "ready" };
    } else {
      // CONSUMER MODE: Lookup the counter state from registry

      console.debug(
        "🔍 fynapp-react-middleware: basic counter consumer looking up state",
        cc.runtime
      );

      // Lookup counter state (works for late joiners!)
      const counterState = registry.lookup<any>("basic-counter");

      if (!counterState) {
        // Provider not ready yet - defer
        console.debug(
          `⏳ fynapp-react-middleware: ${cc.fynApp.name} waiting for provider (consume-only mode)`
        );
        return { status: "defer" };
      }

      // Store the data object in middleware context for backward compatibility
      mwContext.set(this.name, counterState.get());

      // Signal ready
      const kernelAny: any = cc.kernel as any;
      if (typeof kernelAny.signalMiddlewareReady === "function") {
        await kernelAny.signalMiddlewareReady(cc, { name: this.name, status: "ready" });
      } else {
        const event = new CustomEvent("MIDDLEWARE_READY", {
          detail: { name: this.name, status: "ready", cc },
        });
        cc.kernel.emitAsync(event);
      }
      console.debug(
        `🔍 fynapp-react-middleware: Basic counter ready event dispatched for consumer now:`,
        Date.now()
      );

      return { status: "ready" };
    }
  },

  apply(_cc: FynAppMiddlewareCallContext) {
    // nothing to apply
  },
};
