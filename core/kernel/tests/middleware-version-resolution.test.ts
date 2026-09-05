import { describe, it, expect, beforeEach, vi } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { createMockMiddleware, createMockMiddlewareReg } from "./fixtures/mock-middleware";
import type { FynAppMiddlewareReg } from "../src/types";

/**
 * FYM-321 - two versions of one middleware on a page.
 *
 * `registerMiddleware` keys every registration by its host FynApp version, so
 * the version map holds both. `getMiddleware(name, provider)` then reads only
 * the `default` slot - the version that happened to register first - and has
 * no parameter for the version the consumer asked for.
 *
 * The request is not missing: the toolchain plumbs it three of the four hops.
 * create-fynapp's `genId` writes the consumer's semver range into the
 * `-FYNAPP_MIDDLEWARE <pkg> <path> <semver>` id, `parseMiddlewareString` parses
 * it back out, and it is carried into the call context as `info.version` - and
 * then dropped at the lookup. The legacy `{ info: { name, provider, version } }`
 * form loses it the same way.
 *
 * These are marked `it.fails`: they assert the resolution the design implies,
 * they do not hold today, and changing that resolution changes what every page
 * with a duplicated middleware runs - a migration call, not a test-fix call.
 * `it.fails` keeps the suite green now and turns red the moment the behaviour
 * is corrected, which is when these should become plain `it`.
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

  it("keeps both versions in the registry, so a lookup has something to match on", () => {
    const { v1, v2 } = registerBothVersions();

    const versionMap = (kernel as any).runTime.middlewares["provider-app::counter"];
    expect(versionMap["1.0.0"]).toBe(v1);
    expect(versionMap["2.0.0"]).toBe(v2);
    expect(versionMap.default).toBe(v1);
  });

  it.fails("resolves the range a consumer asked for, not whatever holds `default`", () => {
    const { v2 } = registerBothVersions();

    // no third parameter exists yet - this is the lookup the design implies
    const found = (kernel.getMiddleware as any)("counter", "provider-app", "^2.0.0");

    expect(found).toBe(v2);
  });

  it.fails("applies the asked-for version through the id-string declaration", async () => {
    const { v1, v2 } = registerBothVersions();
    const fynApp = createMockFynApp({ name: "consumer-app" });
    const fynUnit = {
      __middlewareMeta: ["-FYNAPP_MIDDLEWARE provider-app middleware/counter ^2.0.0"],
      execute: vi.fn(),
    };

    await kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp);

    expect(v2.mw.apply).toHaveBeenCalled();
    expect(v1.mw.apply).not.toHaveBeenCalled();
  });

  it.fails("applies the asked-for version through the legacy `info` declaration", async () => {
    const { v1, v2 } = registerBothVersions();
    const fynApp = createMockFynApp({ name: "consumer-app" });
    const fynUnit = {
      __middlewareMeta: [
        { info: { name: "counter", provider: "provider-app", version: "^2.0.0" }, config: {} },
      ],
      execute: vi.fn(),
    };

    await kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp);

    expect(v2.mw.apply).toHaveBeenCalled();
    expect(v1.mw.apply).not.toHaveBeenCalled();
  });

  it.fails("says so when no registered version satisfies the range", async () => {
    // today the mismatch is silent: `default` is handed back and the app runs
    // a version it never asked for, with nothing in the console to explain it
    const messages: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: any[]) => messages.push(args.join(" ")));

    registerBothVersions();
    const fynApp = createMockFynApp({ name: "consumer-app" });
    const fynUnit = {
      __middlewareMeta: ["-FYNAPP_MIDDLEWARE provider-app middleware/counter ^3.0.0"],
      execute: vi.fn(),
    };

    await kernel.testUseMiddlewareOnFynModule(fynUnit, fynApp);
    spy.mockRestore();

    expect(messages.join("\n")).toMatch(/counter.*\^3\.0\.0/s);
  });
});
