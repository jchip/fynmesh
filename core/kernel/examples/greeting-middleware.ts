/**
 * A middleware provider's `./middleware/greeting` expose (see the README's
 * "Creating Middleware"). The kernel registers every export named
 * `__middleware__*` from an expose whose key starts with `./middleware`.
 */
import type { FynApp, FynAppMiddleware, FynAppMiddlewareCallContext } from "@fynmesh/kernel";

class GreetingMiddleware implements FynAppMiddleware {
  name = "greeting";

  // Offer itself to every FynApp, without an explicit useMiddleware()
  autoApplyScope: FynAppMiddleware["autoApplyScope"] = ["fynapp"];

  shouldApply(fynApp: FynApp): boolean {
    return fynApp.name !== "fynapp-design-tokens";
  }

  async setup(context: FynAppMiddlewareCallContext) {
    return { status: "ready" };
  }

  apply(context: FynAppMiddlewareCallContext) {
    context.runtime.middlewareContext.set(this.name, {
      greet: (who: string) => `Hello, ${who}, from ${context.reg.hostFynApp.name}!`,
    });
  }
}

export const __middleware__Greeting = new GreetingMiddleware();
