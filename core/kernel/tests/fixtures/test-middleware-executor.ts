import { MiddlewareExecutor } from "../../src/modules/middleware-executor";
import type { FynEventTarget } from "../../src/event-target";

/**
 * Test implementation of MiddlewareExecutor that exposes protected/private members for testing
 */
export class TestMiddlewareExecutor extends MiddlewareExecutor {
  // Expose private properties for testing
  public get testMiddlewareReady(): Map<string, any> {
    return (this as any).middlewareReady;
  }

  public get testDeferInvoke(): { callContexts: any[] }[] {
    return (this as any).deferInvoke;
  }

  // Expose private methods for testing
  public testCheckSingleMiddlewareReady(cc: any): boolean {
    return (this as any).checkSingleMiddlewareReady(cc);
  }

  public testCheckMiddlewareReady(ccs: any[]): string {
    return (this as any).checkMiddlewareReady(ccs);
  }

  public testCheckDeferCalls(status: string, ccs: any[]): string {
    return (this as any).checkDeferCalls(status, ccs);
  }
}
