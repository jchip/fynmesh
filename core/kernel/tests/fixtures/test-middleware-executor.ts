import { MiddlewareExecutor } from "../../src/modules/middleware-executor";
import type { KernelTelemetry } from "../../src/types";

/**
 * Test view of MiddlewareExecutor, exposing its defer/ready bookkeeping under
 * `test*` names.
 *
 * MiddlewareExecutor is a closure factory rather than a class, so this delegates
 * through the prototype chain instead of extending. `deferInvoke` is reassigned
 * internally (clear, and the resume partition), so it must be read live — a
 * copied snapshot would go stale.
 */
export interface TestMiddlewareExecutor extends MiddlewareExecutor {
  readonly testMiddlewareReady: Map<string, any>;
  readonly testDeferInvoke: { callContexts: any[] }[];
  testCheckSingleMiddlewareReady(cc: any): boolean;
  testCheckMiddlewareReady(ccs: any[]): boolean;
  testCheckDeferCalls(status: string, ccs: any[]): string;
}

export const TestMiddlewareExecutor = function (tel?: KernelTelemetry): TestMiddlewareExecutor {
  const exec = new MiddlewareExecutor(tel);
  const view = Object.create(exec) as TestMiddlewareExecutor;

  Object.defineProperties(view, {
    testMiddlewareReady: { get: () => exec.middlewareReady },
    testDeferInvoke: { get: () => exec.deferInvoke },
  });

  return Object.assign(view, {
    testCheckSingleMiddlewareReady: (cc: any) => exec.checkSingleMiddlewareReady(cc),
    testCheckMiddlewareReady: (ccs: any[]) => exec.checkMiddlewareReady(ccs),
    testCheckDeferCalls: (status: string, ccs: any[]) => exec.checkDeferCalls(status, ccs),
  });
} as unknown as new (tel?: KernelTelemetry) => TestMiddlewareExecutor;
