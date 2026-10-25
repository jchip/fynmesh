// @vitest-environment node
/**
 * The shipped min bundles, run the way a page runs them: core first, then
 * add-ons, in one global scope. Each bundle mangles property names on its own,
 * so this is what proves core and add-ons still agree on the names they share.
 *
 * Needs `dist/` (`fyn run build`); CI builds before it tests.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const dist = (name: string) => fs.readFileSync(path.resolve("dist", name), "utf-8");

const CORE = "fynmesh-kernel-core.min.js";
const ADDONS = [
  "fynmesh-kernel-middleware.min.js",
  "fynmesh-kernel-bus.min.js",
  "fynmesh-kernel-telemetry.min.js",
];
const FULL = "fynmesh-browser-kernel.min.js";

const quiet = { debug() {}, log() {}, info() {}, warn() {}, error() {} };

/** A fresh global scope with each script run in order. */
function page(scripts: string[]): any {
  const ctx = vm.createContext({ console: quiet, setTimeout, clearTimeout, EventTarget, CustomEvent });
  for (const code of scripts) {
    vm.runInContext(code, ctx);
  }
  return ctx;
}

function entry(name: string, exposes: Record<string, any>) {
  return {
    container: {
      name,
      version: "1.0.0",
      $E: Object.fromEntries(Object.keys(exposes).map((k) => [k, k])),
    },
    init() {},
    get: async (exposeName: string) => () => exposes[exposeName],
  };
}

/**
 * A middleware provider and a consumer it auto-applies to; the consumer
 * talks on the bus. Returns what each capability saw.
 */
async function drive(kernel: any) {
  const applied: string[] = [];
  const heard: unknown[] = [];
  const entries: Array<{ name: string }> = [];

  kernel.setTelemetry({ transport: { send: async (batch: any[]) => void entries.push(...batch) } });
  kernel.bus.on("hello", (payload: unknown) => heard.push(payload));

  const provider = await kernel.loadFynAppBasics(
    entry("provider", {
      "./middleware": {
        __middleware__Greet: {
          name: "greet",
          autoApplyScope: ["fynapp"],
          setup: async () => ({ status: "ready" }),
          apply: (cc: any) => void applied.push(cc.fynApp.name),
        },
      },
    }),
  );
  await kernel.bootstrapFynApp(provider);

  const consumer = await kernel.loadFynAppBasics(
    entry("consumer", {
      "./main": { main: { execute: (rt: any) => rt.bus.emit("hello", "from consumer") } },
    }),
  );
  await kernel.bootstrapFynApp(consumer);
  kernel.tel.flush();

  return {
    applied,
    heard,
    state: kernel.getFynAppState("consumer")?.status,
    registered: kernel.getMiddleware("greet", "provider").regKey,
    telemetry: entries.map((e) => e.name),
  };
}

const expected = {
  applied: ["consumer"],
  heard: ["from consumer"],
  state: "mounted",
  registered: "provider::greet",
};

describe("split kernel bundles", () => {
  it("core then add-ons, each as its own script", async () => {
    const got = await drive(page([dist(CORE), ...ADDONS.map(dist)]).fynMeshKernel);
    expect(got).toMatchObject(expected);
    expect(got.telemetry).toContain("bootstrap.started");
  });

  it("core and add-ons concatenated into one script", async () => {
    const one = [CORE, ...ADDONS].map(dist).join("\n");
    const got = await drive(page([one]).fynMeshKernel);
    expect(got).toMatchObject(expected);
  });

  it("add-ons in any order after core", async () => {
    const got = await drive(page([dist(CORE), ...[...ADDONS].reverse().map(dist)]).fynMeshKernel);
    expect(got).toMatchObject(expected);
  });

  it("the full bundle behaves the same as core plus every add-on", async () => {
    const got = await drive(page([dist(FULL)]).fynMeshKernel);
    expect(got).toMatchObject(expected);
  });

  it("loading an add-on twice installs it once", async () => {
    const mw = dist(ADDONS[0]);
    const got = await drive(page([dist(CORE), mw, mw, ...ADDONS.slice(1).map(dist)]).fynMeshKernel);
    expect(got.applied).toEqual(["consumer"]);
  });

  it("an add-on loaded before core throws", () => {
    expect(() => page([dist(ADDONS[0])])).toThrow(/load the core kernel bundle first/);
  });

  it("core alone runs a FynUnit without any add-on API", async () => {
    const kernel = page([dist(CORE)]).fynMeshKernel;
    expect(kernel.registerMiddleware).toBeUndefined();
    expect(kernel.bus).toBeUndefined();
    expect(kernel.setTelemetry).toBeUndefined();

    let ran = false;
    const app = await kernel.loadFynAppBasics(
      entry("plain", { "./main": { main: { execute: () => void (ran = true) } } }),
    );
    await kernel.bootstrapFynApp(app);
    expect(ran).toBe(true);
    expect(kernel.getFynAppState("plain")?.status).toBe("mounted");
  });
});
