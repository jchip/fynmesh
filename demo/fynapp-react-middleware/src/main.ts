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

    let status = "defer";

    // get config from fynapp's useMiddleware
    // need the middleware usage object

    const config = cc.meta.config;
    if (config !== "consume-only") {
      const shareKey = `${cc.reg.fullKey}-${cc.fynApp.name}@${cc.fynApp.version}`;
      const initialConfig = {
        count: 0,
        ...(config as any),
      };

      const eventTarget = new EventTarget();

      const data = mwContext.get(this.name) || {
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

      mwContext.set(this.name, data);
      cc.reg.hostFynApp.middlewareContext.set(shareKey, data);
      status = "ready";
      const kernelAny: any = cc.kernel as any;
      if (typeof kernelAny.signalMiddlewareReady === "function") {
        await kernelAny.signalMiddlewareReady(cc, { name: this.name, status, share: { shareKey } });
      } else {
        const event = new CustomEvent("MIDDLEWARE_READY", {
          detail: { name: this.name, share: { shareKey }, status, cc },
        });
        cc.kernel.emitAsync(event);
      }
      console.debug(
        `🔍 fynapp-react-middleware: Basic counter ready event dispatched now:`,
        Date.now()
      );
    } else {
      const shareKey = cc.runtime.share?.shareKey;
      console.debug(
        "🔍 fynapp-react-middleware: basic counter shareKey:",
        shareKey,
        cc.runtime
      );
      const data = cc.reg.hostFynApp.middlewareContext.get(shareKey);
      if (data) {
        mwContext.set(this.name, data);
        status = "ready";
        
        // ✅ FIX: Emit MIDDLEWARE_READY event for consumers when they become ready
        const kernelAny: any = cc.kernel as any;
        if (typeof kernelAny.signalMiddlewareReady === "function") {
          await kernelAny.signalMiddlewareReady(cc, { name: this.name, status, share: { shareKey } });
        } else {
          const event = new CustomEvent("MIDDLEWARE_READY", {
            detail: { name: this.name, share: { shareKey }, status, cc },
          });
          cc.kernel.emitAsync(event);
        }
        console.debug(
          `🔍 fynapp-react-middleware: Basic counter ready event dispatched for consumer now:`,
          Date.now()
        );
      }
      console.debug(
        `🔍 fynapp-react-middleware: status: ${status} Basic counter setup for`,
        cc.fynApp.name,
        cc.fynApp.version,
        "is consume-only now:",
        Date.now()
      );
    }

    // If consumer-only and no provider available, allow apps to continue with status="ready"
    // The app can handle missing provider gracefully by checking if counterAPI is available
    if (cc.meta.config === "consume-only" && status === "defer") {
      console.debug(
        `✅ fynapp-react-middleware: Allowing ${cc.fynApp.name} to continue despite missing provider (consume-only mode)`
      );
      status = "ready"; // Let app continue - it can handle missing provider
    }

    return { status };
  },

  apply(_cc: FynAppMiddlewareCallContext) {
    // nothing to apply
  },
};
