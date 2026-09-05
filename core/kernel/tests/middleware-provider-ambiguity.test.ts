import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddleware, createMockMiddlewareReg } from "./fixtures/mock-middleware";
import type { FynAppMiddlewareReg } from "../src/types";

/**
 * FYM-333 - the no-provider fallback scan stops guessing silently.
 *
 * `getMiddleware(name)` with no provider scans the registry for any key ending
 * in `::<name>` and takes the first. With two providers publishing the same
 * middleware name, that pick is registration order and the consumer never hears
 * about it.
 *
 * The pick itself does not change here - changing it would break pages that
 * work today, by luck or otherwise, and that migration is deliberately not this
 * ticket. What changes is that more than one match now reports itself via
 * `console.error`. One match is unambiguous and common, and stays silent.
 *
 * So, as with FYM-332, the load-bearing assertions are the ones showing the
 * resolved registration is the same object it always was.
 */
describe("Middleware provider fallback scan (FYM-333)", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  /** A `counter` middleware published by `provider`. */
  const counterFrom = (provider: string, version = "1.0.0"): FynAppMiddlewareReg =>
    createMockMiddlewareReg({
      regKey: `${provider}::counter`,
      fullKey: `${provider}@${version}::counter`,
      hostFynApp: createMockFynApp({ name: provider, version }),
      mw: createMockMiddleware({ name: "counter" }),
    });

  const captureErrors = (fn: () => unknown): string[] => {
    const messages: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: any[]) => messages.push(args.join(" ")));
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    return messages;
  };

  describe("one provider - unambiguous, and completely silent", () => {
    it("resolves the only provider and says nothing", () => {
      const solo = counterFrom("provider-a");
      kernel.registerMiddleware(solo);

      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("counter")).toBe(solo);
      });

      expect(errors).toEqual([]);
    });

    it("says nothing for a version-ranged lookup against a single provider", () => {
      const solo = counterFrom("provider-a", "2.0.0");
      kernel.registerMiddleware(solo);

      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("counter", undefined, { version: "^2.0.0" })).toBe(solo);
      });

      expect(errors).toEqual([]);
    });

    it("says nothing when nothing is registered at all", () => {
      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("counter").regKey).toBe("");
      });

      expect(errors).toEqual([]);
    });

    it("says nothing when the provider is named explicitly, even with two registered", () => {
      const a = counterFrom("provider-a");
      const b = counterFrom("provider-b");
      kernel.registerMiddleware(a);
      kernel.registerMiddleware(b);

      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("counter", "provider-a")).toBe(a);
        expect(kernel.getMiddleware("counter", "provider-b")).toBe(b);
      });

      // Naming the provider is the fix the message asks for, so taking it must
      // buy silence.
      expect(errors).toEqual([]);
    });
  });

  describe("two providers - resolution is unchanged, the silence is not", () => {
    it("still returns the first provider that registered", () => {
      const a = counterFrom("provider-a");
      const b = counterFrom("provider-b");
      kernel.registerMiddleware(a);
      kernel.registerMiddleware(b);

      const errors = captureErrors(() => {
        // Registration order decides, exactly as it did before FYM-333.
        expect(kernel.getMiddleware("counter")).toBe(a);
        expect(kernel.getMiddleware("counter")).not.toBe(b);
      });

      expect(errors).toHaveLength(2);
    });

    it("resolves identically before and after the second provider appears", () => {
      const a = counterFrom("provider-a");
      kernel.registerMiddleware(a);
      const before = kernel.getMiddleware("counter");

      kernel.registerMiddleware(counterFrom("provider-b"));
      let after: FynAppMiddlewareReg | undefined;
      const errors = captureErrors(() => {
        after = kernel.getMiddleware("counter");
      });

      expect(before).toBe(a);
      expect(after).toBe(before);
      expect(errors).toHaveLength(1);
    });

    it("errors with the middleware, every matching provider, the one taken, and the fix", () => {
      kernel.registerMiddleware(counterFrom("provider-a"));
      kernel.registerMiddleware(counterFrom("provider-b"));

      const errors = captureErrors(() => kernel.getMiddleware("counter"));

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("'counter'");
      expect(errors[0]).toContain("provider-a::counter");
      expect(errors[0]).toContain("provider-b::counter");
      expect(errors[0]).toMatch(/used 'provider-a::counter'/);
      expect(errors[0]).toMatch(/Name the provider/);
    });

    it("reports the provider it actually took when an earlier match resolves to nothing", () => {
      const b = counterFrom("provider-b");
      kernel.registerMiddleware(b);
      // An empty version map for provider-a: it matches the scan but resolves
      // to nothing, so the scan skips it - exactly as it did before FYM-333.
      const runtime = (kernel as any).runTime;
      kernel.initRunTime({
        ...runtime,
        middlewares: {
          "provider-a::counter": {} as any,
          ...runtime.middlewares,
        },
      });

      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("counter")).toBe(b);
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/used 'provider-b::counter'/);
    });

    it("errors but still resolves when a version range is asked for", () => {
      const a = counterFrom("provider-a", "1.0.0");
      kernel.registerMiddleware(a);
      kernel.registerMiddleware(counterFrom("provider-b", "2.0.0"));

      const errors = captureErrors(() => {
        // provider-a is reached first and its 1.0.0 satisfies ^1.0.0
        expect(kernel.getMiddleware("counter", undefined, { version: "^1.0.0" })).toBe(a);
      });

      expect(errors).toHaveLength(1);
    });

    it("leaves middlewares of other names alone", () => {
      kernel.registerMiddleware(counterFrom("provider-a"));
      kernel.registerMiddleware(counterFrom("provider-b"));
      const logger = createMockMiddlewareReg({
        regKey: "provider-a::logger",
        mw: createMockMiddleware({ name: "logger" }),
      });
      kernel.registerMiddleware(logger);

      const errors = captureErrors(() => {
        expect(kernel.getMiddleware("logger")).toBe(logger);
      });

      expect(errors).toEqual([]);
    });
  });
});
