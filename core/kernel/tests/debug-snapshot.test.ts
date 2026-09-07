import { describe, it, expect, beforeEach } from "vitest";
import { TestKernel, createTestKernel } from "./fixtures/test-kernel";
import { createMockFynApp } from "./fixtures/mock-fynapp";
import { EXTERNAL_CONTRACT } from "../build/reserved-names.mjs";

/**
 * `kernel.__I()` is the one route an outside tool has to the bootstrap queue,
 * because `bootstrapCoordinator` is deliberately left manglable. Two things
 * can silently take it away -- dropping the reservation, and unquoting a key
 * -- and neither shows up in a test that only reads `src` through its own
 * names. So the reservation is pinned by name here, and the shape is asserted
 * literally rather than through a helper that would rename alongside it.
 */
describe("kernel.__I() debug snapshot", () => {
  let kernel: TestKernel;

  beforeEach(() => {
    kernel = createTestKernel();
  });

  it("reserves __I from the property mangler", () => {
    // Losing this entry ships a kernel whose hatch is called something like
    // `.a()`, which fails as "unavailable" -- the exact state the hatch exists
    // to tell apart from "idle".
    expect(EXTERNAL_CONTRACT).toContain("__I");
  });

  it("reports an idle queue as idle, not as a gap", () => {
    const snap = kernel.__I() as any;
    expect(snap.v).toBe(1);
    // null, never undefined: "nobody holds the lock" is a state the kernel
    // writes, not a field that could not be read
    expect(snap.bootstrap.holder).toBe(null);
    expect(snap.bootstrap.deferred).toEqual([]);
    expect(snap.bootstrap.bootstrapped).toEqual([]);
    expect(snap.bootstrap.modes).toEqual([]);
  });

  it("reports the lock holder, the queue behind it, and provider modes", async () => {
    const bc = kernel.bootstrapCoordinator;
    bc.bootstrappingApp = "app1";
    bc.fynAppBootstrapStatus.set("app1", "bootstrapped");
    bc.registerProviderMode("app1", "shell-layout", "provider");
    bc.registerProviderMode("app2", "shell-layout", "consumer");
    // deferBootstrap parks the app and never settles while the lock is held,
    // so the promise is deliberately not awaited
    void bc.deferBootstrap(createMockFynApp({ name: "app2", version: "2.1.0" }));

    const snap = kernel.__I() as any;
    expect(snap.bootstrap.holder).toBe("app1");
    expect(snap.bootstrap.bootstrapped).toEqual(["app1"]);
    expect(snap.bootstrap.deferred).toEqual([{ name: "app2", version: "2.1.0" }]);
    expect(snap.bootstrap.modes).toEqual([
      { app: "app1", roles: [{ middleware: "shell-layout", mode: "provider" }] },
      { app: "app2", roles: [{ middleware: "shell-layout", mode: "consumer" }] },
    ]);
  });

  it("returns plain data that survives structuredClone", () => {
    const bc = kernel.bootstrapCoordinator;
    bc.registerProviderMode("app1", "shell-layout", "provider");
    void bc.deferBootstrap(createMockFynApp({ name: "app2", version: "2.1.0" }));

    // the panel receives this across a message boundary; a live Map or a
    // function anywhere in it would throw here rather than at the boundary
    expect(() => structuredClone(kernel.__I())).not.toThrow();
  });
});
