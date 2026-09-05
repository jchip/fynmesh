import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddleware, createMockMiddlewareReg } from "./fixtures/mock-middleware";
import type { FynAppMiddlewareReg } from "../src/types";

/**
 * FYM-332 - the `default` slot holds whichever version registered FIRST.
 *
 * That was an accident of the original implementation; it is now a decision.
 * First-registered is arbitrary but stable for the life of a page. Pointing
 * `default` at the highest registered version instead would move it as later
 * FynApps mount, so two consumers that both asked for nothing could get
 * different middleware purely by mount timing.
 *
 * So these tests pin two things, and the second matters more than the first:
 *
 *  1. registering a second version warns ONCE, at registration, so the
 *     ambiguity is visible; and
 *  2. **nothing about resolution moved** - `default` is still the first
 *     registration, before and after the second one registers, and every
 *     lookup resolves exactly as it did.
 *
 * A test that only checked the warning text would still pass with the
 * semantics broken, which is the failure mode this file is written against.
 */
describe("Middleware `default` slot stays first-registered (FYM-332)", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  const counterAt = (version: string): FynAppMiddlewareReg =>
    createMockMiddlewareReg({
      regKey: "provider-app::counter",
      fullKey: `provider-app@${version}::counter`,
      hostFynApp: createMockFynApp({ name: "provider-app", version }),
      mw: createMockMiddleware({ name: "counter" }),
    });

  /** Collect console.warn output for the duration of one call. */
  const captureWarnings = (fn: () => unknown): string[] => {
    const messages: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args: any[]) => messages.push(args.join(" ")));
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    return messages;
  };

  describe("resolution is unchanged", () => {
    it("keeps `default` pointing at the first registration after a second one arrives", () => {
      const v1 = counterAt("1.0.0");
      const v2 = counterAt("2.0.0");

      kernel.registerMiddleware(v1);
      // "before": with one version registered, this is trivially v1
      const resolvedBefore = kernel.getMiddleware("counter", "provider-app");

      kernel.registerMiddleware(v2);
      // "after": the second registration - and its warning - must not re-point
      const resolvedAfter = kernel.getMiddleware("counter", "provider-app");

      expect(resolvedBefore).toBe(v1);
      expect(resolvedAfter).toBe(resolvedBefore);
      expect(resolvedAfter).not.toBe(v2);
    });

    it("does not re-point `default` even when a much higher version registers later", () => {
      const v1 = counterAt("1.0.0");
      kernel.registerMiddleware(v1);
      kernel.registerMiddleware(counterAt("9.9.9"));
      kernel.registerMiddleware(counterAt("2.0.0"));

      const versionMap = (kernel as any).runTime.middlewares["provider-app::counter"];

      expect(versionMap.default).toBe(v1);
      expect(kernel.getMiddleware("counter", "provider-app")).toBe(v1);
      expect(kernel.getMiddleware("counter", "provider-app", {})).toBe(v1);
      expect(kernel.getMiddleware("counter", "provider-app", { version: "*" })).toBe(v1);
    });

    it("still resolves an asked-for range to the highest match, untouched by the warning", () => {
      const v1 = counterAt("1.0.0");
      const v2 = counterAt("2.0.0");
      kernel.registerMiddleware(v1);
      kernel.registerMiddleware(v2);

      expect(kernel.getMiddleware("counter", "provider-app", { version: "^2.0.0" })).toBe(v2);
      expect(kernel.getMiddleware("counter", "provider-app", { version: "^1.0.0" })).toBe(v1);
      // a range nothing satisfies still falls back to `default` = v1
      expect(kernel.getMiddleware("counter", "provider-app", { version: "^5.0.0" })).toBe(v1);
    });

    it("keeps every registered version in the map", () => {
      const v1 = counterAt("1.0.0");
      const v2 = counterAt("2.0.0");
      kernel.registerMiddleware(v1);
      kernel.registerMiddleware(v2);

      const versionMap = (kernel as any).runTime.middlewares["provider-app::counter"];

      expect(versionMap["1.0.0"]).toBe(v1);
      expect(versionMap["2.0.0"]).toBe(v2);
      expect(versionMap.default).toBe(v1);
    });
  });

  describe("the ambiguity is announced once, at registration", () => {
    it("says nothing when only one version ever registers", () => {
      const warnings = captureWarnings(() => kernel.registerMiddleware(counterAt("1.0.0")));

      expect(warnings).toEqual([]);
    });

    it("says nothing when the same version registers twice", () => {
      kernel.registerMiddleware(counterAt("1.0.0"));

      const warnings = captureWarnings(() => kernel.registerMiddleware(counterAt("1.0.0")));

      expect(warnings).toEqual([]);
    });

    it("warns when a second version registers, naming the middleware, the default, and the others", () => {
      kernel.registerMiddleware(counterAt("1.0.0"));

      const warnings = captureWarnings(() => kernel.registerMiddleware(counterAt("2.0.0")));

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("provider-app::counter");
      expect(warnings[0]).toContain("1.0.0");
      expect(warnings[0]).toContain("2.0.0");
      expect(warnings[0]).toMatch(/first version registered/);
    });

    it("warns only once per middleware, however many more versions arrive", () => {
      kernel.registerMiddleware(counterAt("1.0.0"));

      const warnings = captureWarnings(() => {
        kernel.registerMiddleware(counterAt("2.0.0"));
        kernel.registerMiddleware(counterAt("3.0.0"));
        kernel.registerMiddleware(counterAt("4.0.0"));
      });

      expect(warnings).toHaveLength(1);
    });

    it("warns per middleware, not once globally", () => {
      const otherAt = (version: string) =>
        createMockMiddlewareReg({
          regKey: "provider-app::logger",
          fullKey: `provider-app@${version}::logger`,
          hostFynApp: createMockFynApp({ name: "provider-app", version }),
          mw: createMockMiddleware({ name: "logger" }),
        });
      kernel.registerMiddleware(counterAt("1.0.0"));
      kernel.registerMiddleware(otherAt("1.0.0"));

      const warnings = captureWarnings(() => {
        kernel.registerMiddleware(counterAt("2.0.0"));
        kernel.registerMiddleware(otherAt("2.0.0"));
      });

      expect(warnings).toHaveLength(2);
      expect(warnings.some((message) => message.includes("provider-app::counter"))).toBe(true);
      expect(warnings.some((message) => message.includes("provider-app::logger"))).toBe(true);
    });

    it("stays quiet at lookup time, however many version-less lookups a page makes", () => {
      kernel.registerMiddleware(counterAt("1.0.0"));
      kernel.registerMiddleware(counterAt("2.0.0"));

      const warnings = captureWarnings(() => {
        kernel.getMiddleware("counter", "provider-app");
        kernel.getMiddleware("counter", "provider-app", {});
        kernel.getMiddleware("counter", "provider-app", { version: "*" });
        kernel.getMiddleware("counter", "provider-app", { version: "^1.0.0" });
      });

      // The registration-time warning is what makes this visible. A warning on
      // every version-less lookup would repeat for the life of the page and get
      // muted, which is exactly why it is not emitted here.
      expect(warnings).toEqual([]);
    });
  });
});
