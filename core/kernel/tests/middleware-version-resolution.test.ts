import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddleware, createMockMiddlewareReg } from "./fixtures/mock-middleware";
import type { FynAppMiddlewareReg } from "../src/types";

/**
 * FYM-321 - two versions of one middleware on a page.
 *
 * `registerMiddleware` keys every registration by its host FynApp version, so
 * the version map holds both. `getMiddleware` used to read only the `default`
 * slot - the version that happened to register first - and had no parameter for
 * the version the consumer asked for, even though the toolchain plumbs one:
 * create-fynapp's `genId` writes the consumer's semver range into the
 * `-FYNAPP_MIDDLEWARE <pkg> <path> <semver>` id, `parseMiddlewareString` parses
 * it back out, and it reached the call site only to be dropped. The legacy
 * `{ info: { name, provider, version } }` form lost it the same way.
 *
 * `getMiddleware(name, provider, { version })` now resolves the highest
 * registered version satisfying the range. The compatibility guarantee is that
 * a lookup with no version behaves exactly as it did before - see
 * "no version asked for" below, which pins it.
 */
describe("Middleware version resolution (FYM-321)", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  /** A registration of `provider-app::counter` hosted at `version`. */
  const counterAt = (version: string): FynAppMiddlewareReg =>
    createMockMiddlewareReg({
      regKey: "provider-app::counter",
      fullKey: `provider-app@${version}::counter`,
      hostFynApp: createMockFynApp({ name: "provider-app", version }),
      mw: createMockMiddleware({ name: "counter" }),
    });

  /** 1.0.0 registers first, so it - not 2.0.0 - takes the `default` slot. */
  const registerBothVersions = () => {
    const v1 = counterAt("1.0.0");
    const v2 = counterAt("2.0.0");
    kernel.registerMiddleware(v1);
    kernel.registerMiddleware(v2);
    return { v1, v2 };
  };

  /** Collect console.warn output for the duration of one call. */
  const captureWarnings = async (fn: () => unknown | Promise<unknown>): Promise<string> => {
    const messages: string[] = [];
    const spy = vi
      .spyOn(console, "warn")
      .mockImplementation((...args: any[]) => messages.push(args.join(" ")));
    try {
      await fn();
    } finally {
      spy.mockRestore();
    }
    return messages.join("\n");
  };

  it("keeps both versions in the registry, so a lookup has something to match on", () => {
    const { v1, v2 } = registerBothVersions();

    const versionMap = (kernel as any).runTime.middlewares["provider-app::counter"];
    expect(versionMap["1.0.0"]).toBe(v1);
    expect(versionMap["2.0.0"]).toBe(v2);
    expect(versionMap.default).toBe(v1);
  });

  it("resolves the range a consumer asked for, not whatever holds `default`", () => {
    const { v2 } = registerBothVersions();

    const found = kernel.getMiddleware("counter", "provider-app", { version: "^2.0.0" });

    expect(found).toBe(v2);
  });

  it("resolves an exact version request", () => {
    const { v1, v2 } = registerBothVersions();

    expect(kernel.getMiddleware("counter", "provider-app", { version: "1.0.0" })).toBe(v1);
    expect(kernel.getMiddleware("counter", "provider-app", { version: "2.0.0" })).toBe(v2);
  });

  it("returns the highest version satisfying a range, not the first that fits", () => {
    const v1 = counterAt("1.0.0");
    const v11 = counterAt("1.1.0");
    const v12 = counterAt("1.2.3");
    kernel.registerMiddleware(v1);
    kernel.registerMiddleware(v11);
    kernel.registerMiddleware(v12);

    expect(kernel.getMiddleware("counter", "provider-app", { version: "^1.0.0" })).toBe(v12);
    expect(kernel.getMiddleware("counter", "provider-app", { version: "~1.1.0" })).toBe(v11);
  });

  it("applies the asked-for version through the id-string declaration", async () => {
    const { v1, v2 } = registerBothVersions();
    const fynApp = createMockFynApp({ name: "consumer-app" });
    const fynUnit = {
      __middlewareMeta: ["-FYNAPP_MIDDLEWARE provider-app middleware/counter ^2.0.0"],
      execute: vi.fn(),
    };

    await kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp);

    // `setup` receives the resolved call context - that is where the choice of
    // registration becomes observable. (`apply` runs only for contexts marked
    // ready, which needs a `signalReady` this harness does not pass.)
    expect(v2.mw.setup).toHaveBeenCalled();
    expect(v1.mw.setup).not.toHaveBeenCalled();
    expect((v2.mw.setup as any).mock.calls[0][0].reg).toBe(v2);
  });

  it("applies the asked-for version through the legacy `info` declaration", async () => {
    const { v1, v2 } = registerBothVersions();
    const fynApp = createMockFynApp({ name: "consumer-app" });
    const fynUnit = {
      __middlewareMeta: [
        { info: { name: "counter", provider: "provider-app", version: "^2.0.0" }, config: {} },
      ],
      execute: vi.fn(),
    };

    await kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp);

    // `setup` receives the resolved call context - that is where the choice of
    // registration becomes observable. (`apply` runs only for contexts marked
    // ready, which needs a `signalReady` this harness does not pass.)
    expect(v2.mw.setup).toHaveBeenCalled();
    expect(v1.mw.setup).not.toHaveBeenCalled();
    expect((v2.mw.setup as any).mock.calls[0][0].reg).toBe(v2);
  });

  describe("no version asked for - the pre-FYM-321 path, which must not change", () => {
    /*
     * This is the compatibility guarantee the whole change rests on. Every
     * FynApp resolving middleware today reaches the lookup with no range (the
     * demo's built ids carry an empty semver slot, which parseMiddlewareString
     * turns into `*`), so if these drift, real pages change what they run.
     */
    it("returns `default` when no options are passed at all", () => {
      const { v1 } = registerBothVersions();

      expect(kernel.getMiddleware("counter", "provider-app")).toBe(v1);
    });

    it("returns `default` for an empty options object", () => {
      const { v1 } = registerBothVersions();

      expect(kernel.getMiddleware("counter", "provider-app", {})).toBe(v1);
    });

    it("treats `*` and an empty range as `default`", () => {
      const { v1 } = registerBothVersions();

      expect(kernel.getMiddleware("counter", "provider-app", { version: "*" })).toBe(v1);
      expect(kernel.getMiddleware("counter", "provider-app", { version: "" })).toBe(v1);
    });

    it("says nothing when no version was asked for", async () => {
      registerBothVersions();

      const warnings = await captureWarnings(() =>
        kernel.getMiddleware("counter", "provider-app")
      );

      expect(warnings).toBe("");
    });

    it("still falls back across providers when none is named", () => {
      const mwReg = createMockMiddlewareReg({
        regKey: "some-provider::solo",
        mw: createMockMiddleware({ name: "solo" }),
      });
      kernel.registerMiddleware(mwReg);

      expect(kernel.getMiddleware("solo")).toBe(mwReg);
    });

    it("still returns DummyMiddlewareReg when nothing is registered", () => {
      expect(kernel.getMiddleware("non-existent").regKey).toBe("");
      expect(kernel.getMiddleware("non-existent", undefined, { version: "^1.0.0" }).regKey).toBe("");
    });
  });

  describe("no registered version satisfies the range", () => {
    it("falls back to `default` rather than resolving nothing", () => {
      const { v1 } = registerBothVersions();

      const found = kernel.getMiddleware("counter", "provider-app", { version: "^3.0.0" });

      expect(found).toBe(v1);
    });

    it("warns with what was asked for, what exists, and what it ran instead", async () => {
      registerBothVersions();

      const warnings = await captureWarnings(() =>
        kernel.getMiddleware("counter", "provider-app", { version: "^3.0.0" })
      );

      expect(warnings).toContain("provider-app::counter");
      expect(warnings).toContain("^3.0.0");
      expect(warnings).toContain("1.0.0, 2.0.0");
      expect(warnings).toMatch(/did not ask for/);
    });

    it("warns through the id-string declaration too, and still executes", async () => {
      const { v1, v2 } = registerBothVersions();
      const fynApp = createMockFynApp({ name: "consumer-app" });
      const fynUnit = {
        __middlewareMeta: ["-FYNAPP_MIDDLEWARE provider-app middleware/counter ^3.0.0"],
        execute: vi.fn(),
      };

      const warnings = await captureWarnings(() =>
        kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp)
      );

      expect(warnings).toMatch(/counter.*\^3\.0\.0/s);
      // option (a): the page keeps working, it just stops being silent about it
      expect(v1.mw.setup).toHaveBeenCalled();
      expect(v2.mw.setup).not.toHaveBeenCalled();
    });

    it("distinguishes a spec that is not a range from a range nothing satisfies", async () => {
      registerBothVersions();

      const warnings = await captureWarnings(() =>
        kernel.getMiddleware("counter", "provider-app", { version: "workspace:*" })
      );

      expect(warnings).toContain("not a version range this kernel can read");
      expect(warnings).toContain("workspace:*");
    });
  });
});
