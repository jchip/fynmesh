import type {
  FynAppMiddleware,
  FynAppMiddlewareCallContext,
} from "@fynmesh/kernel";

/**
 * Minimal middleware provider.
 *
 * Consumers read the published API via
 * `runtime.middlewareContext.get("greeting")`.
 */
class GreetingMiddleware implements FynAppMiddleware {
  public readonly name = "greeting";

  async setup(
    context: FynAppMiddlewareCallContext
  ): Promise<{ status: string }> {
    // Tell the kernel this middleware is ready to be applied to consumers.
    await context.kernel.signalMiddlewareReady(context, {
      name: this.name,
      status: "ready",
    });
    return { status: "ready" };
  }

  apply(context: FynAppMiddlewareCallContext): void {
    // Publish the API into the consuming FynApp's middleware context.
    context.runtime.middlewareContext.set(this.name, {
      greet: (name: string) => `Hello, ${name}!`,
    });
  }
}

// Federation discovers middleware via exports named `__middleware__*`.
export const __middleware__Greeting = new GreetingMiddleware();
