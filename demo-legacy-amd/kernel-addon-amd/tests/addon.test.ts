// The add-on against the same RequireJS scenarios as requirejs.test.ts. `loads`
// records only the calls the add-on passes on, so it lists the files fetched.
import { describe, expect, it } from "vitest";
import { bridge, fixtures, load, meta, page } from "./harness";

const react18 = { "./amd/react": { version: "18" } };
const react19 = { "./amd/react": { version: "19" } };

describe("AMD add-on", () => {
  it("serves a meta id from its FynApp, and loads other ids as files without touching federation", async () => {
    const dir = fixtures({
      "util.js": `define([], () => "util");`,
      "app.js": `define(["react"], (r) => r.version);`,
    });
    const { win, loads } = page(dir);
    const { fynapps } = bridge(win, { bridge: react19 });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"] }));

    expect(await load(win, ["util"])).toEqual(["util"]);
    expect(fynapps).toEqual([]);
    expect(await load(win, ["app"])).toEqual(["19"]);
    expect(fynapps).toEqual(["bridge"]);
    expect(loads.map((l) => l.id)).toEqual(["util", "app"]);
  });

  it("version: loads the release the meta names and finds it as name@version", async () => {
    const dir = fixtures({ "app.js": `define(["react"], (r) => r.version);` });
    const { win } = page(dir);
    const { fynapps, events } = bridge(win, { "cwp@3.2.0": react18, "cwp@4.0.0": react19 });
    win.requirejs.config(meta({ react: ["cwp", "./amd/react", "3.2.0"] }));
    expect(await load(win, ["app"])).toEqual(["18"]);
    expect(fynapps).toEqual(["cwp@3.2.0"]);
    expect(events.filter((e) => e.name === "bridge").map((e) => e.data)).toEqual([{ name: "cwp@3.2.0", ok: true }]);
  });

  it("meta wins over paths for the same id", async () => {
    const dir = fixtures({ "libs/react.js": `define([], () => ({ version: "umd" }));` });
    const { win, loads } = page(dir, { paths: { react: "libs/react" } });
    bridge(win, { bridge: react19 });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"] }));
    expect((await load(win, ["react"]))[0].version).toBe("19");
    expect(loads).toEqual([]);
  });

  it("bundles: serves every bridged id of a bundle, and never fetches the bundle", async () => {
    const { win, loads } = page(fixtures({}), { bundles: { common: ["react", "react-dom"] } });
    bridge(win, { bridge: { "./amd/react": { n: "react" }, "./amd/react-dom": { n: "dom" } } });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"], "react-dom": ["bridge", "./amd/react-dom"] }));
    expect((await load(win, ["react"]))[0].n).toBe("react");
    expect((await load(win, ["react-dom"]))[0].n).toBe("dom");
    expect(loads).toEqual([]);
  });

  it("bundles: ids requested together are all served", async () => {
    const { win } = page(fixtures({}), { bundles: { common: ["react", "react-dom"] } });
    bridge(win, { bridge: { "./amd/react": { n: "react" }, "./amd/react-dom": { n: "dom" } } });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"], "react-dom": ["bridge", "./amd/react-dom"] }));
    const [r, d] = await load(win, ["react", "react-dom"]);
    expect([r.n, d.n]).toEqual(["react", "dom"]);
  });

  it("map: picks a React version per consumer, each from its own FynApp", async () => {
    const dir = fixtures({
      "widget-a.js": `define(["react"], (r) => r.version);`,
      "widget-b.js": `define(["react"], (r) => r.version);`,
    });
    const { win } = page(dir, { map: { "widget-a": { react: "react@18" }, "*": { react: "react@19" } } });
    const { fynapps } = bridge(win, { "bridge-18": react18, "bridge-19": react19 });
    win.requirejs.config(meta({ "react@18": ["bridge-18", "./amd/react"], "react@19": ["bridge-19", "./amd/react"] }));
    expect(await load(win, ["widget-a", "widget-b"])).toEqual(["18", "19"]);
    expect(fynapps.sort()).toEqual(["bridge-18", "bridge-19"]);
  });

  it("fallback: a failed FynApp or missing expose goes to the page's paths", async () => {
    const dir = fixtures({
      "libs/react.js": `define([], () => ({ version: "umd" }));`,
      "libs/kit.js": `define([], () => ({ kit: "umd" }));`,
    });
    const { win, loads } = page(dir, { paths: { react: "libs/react", "ui-kit": "libs/kit" } });
    const { events } = bridge(win, { down: "fail", bridge: {} });
    win.requirejs.config(meta({ react: ["down", "./amd/react"], "ui-kit": ["bridge", "./amd/ui-kit"] }));
    const [r, k] = await load(win, ["react", "ui-kit"]);
    expect([r.version, k.kit]).toEqual(["umd", "umd"]);
    expect(loads.map((l) => l.url).sort()).toEqual(["./libs/kit.js", "./libs/react.js"]);
    expect(events.filter((e) => e.name === "err:load").map((e) => e.data.id).sort()).toEqual(["react", "ui-kit"]);
  });

  it("fallback: with no file either, the errback gets a normal RequireJS error, and a retry works", async () => {
    const dir = fixtures({ "libs/react.js": `define([], () => ({ version: "umd" }));` });
    const { win } = page(dir);
    bridge(win, { down: "fail" });
    win.requirejs.config(meta({ react: ["down", "./amd/react"] }));
    const err = await load(win, ["react"]).catch((e) => e);
    expect(err.requireModules).toEqual(["react"]);
    win.requirejs.undef("react");
    win.requirejs.config({ paths: { react: "libs/react" } });
    expect((await load(win, ["react"]))[0].version).toBe("umd");
  });

  it("contexts: each RequireJS context has its own meta", async () => {
    const { win } = page(fixtures({}), meta({ react: ["bridge-18", "./amd/react"] }));
    bridge(win, { "bridge-18": react18, "bridge-19": react19 });
    const req2 = win.requirejs.config({ context: "v2", ...meta({ react: ["bridge-19", "./amd/react"] }) });
    const [[a], [b]] = await Promise.all([load(win, ["react"]), load(win, ["react"], req2)]);
    expect([a.version, b.version]).toEqual(["18", "19"]);
  });

  it("one release per page: a second version of a FynApp is refused and goes to paths", async () => {
    const dir = fixtures({ "libs/react.js": `define([], () => ({ version: "umd" }));` });
    const { win } = page(dir, meta({ react: ["cwp", "./amd/react", "3.2.0"] }));
    const { fynapps, events } = bridge(win, { "cwp@3.2.0": react18, "cwp@4.0.0": react19 });
    const req2 = win.requirejs.config({
      context: "v4",
      paths: { react: "libs/react" },
      ...meta({ react: ["cwp", "./amd/react", "4.0.0"] }),
    });
    expect((await load(win, ["react"]))[0].version).toBe("18");
    expect((await load(win, ["react"], req2))[0].version).toBe("umd");
    expect(fynapps).toEqual(["cwp@3.2.0"]);
    expect(events.filter((e) => e.name === "bridge").map((e) => e.data)).toEqual([
      { name: "cwp@3.2.0", ok: true },
      { name: "cwp@4.0.0", ok: false },
    ]);
  });

  it("contexts: one bridged, one on paths, loading the same id at once", async () => {
    const dir = fixtures({ "libs/react.js": `define([], () => ({ version: "umd" }));` });
    const { win } = page(dir, meta({ react: ["bridge-18", "./amd/react"] }));
    const { events } = bridge(win, { "bridge-18": react18 });
    const req2 = win.requirejs.config({ context: "umd", paths: { react: "libs/react" } });
    const [[a], [b]] = await Promise.all([load(win, ["react"]), load(win, ["react"], req2)]);
    expect([a.version, b.version]).toEqual(["18", "umd"]);
    const mods = events.filter((e) => e.name === "module").map((e) => [e.data.context, e.data.id, e.data.route]);
    expect(mods.sort()).toEqual([
      ["_", "react", "bridge"],
      ["umd", "react", "legacy"],
    ]);
  });

  it("several meta files add up", async () => {
    const { win } = page(fixtures({}));
    bridge(win, { one: { "./amd/a": { a: 1 } }, two: { "./amd/b": { b: 2 } } });
    win.requirejs.config(meta({ a: ["one", "./amd/a"] }));
    win.requirejs.config(meta({ b: ["two", "./amd/b"] }));
    const [a, b] = await load(win, ["a", "b"]);
    expect([a.a, b.b]).toEqual([1, 2]);
  });

  it("interop: flattens an ES namespace for webpack externals", async () => {
    const { win } = page(fixtures({}));
    bridge(win, { bridge: { "./amd/react": { __esModule: true, default: { createElement: 1 }, useState: 2 } } });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"] }));
    const [r] = await load(win, ["react"]);
    expect(r).toEqual({ createElement: 1, useState: 2 });
  });

  it("metrics: one amd.module per module with its route and deps, one amd.bridge per FynApp", async () => {
    const dir = fixtures({ "app.js": `define(["react", "react-dom"], () => 1);` });
    const { win } = page(dir);
    const { events } = bridge(win, { bridge: { "./amd/react": {}, "./amd/react-dom": {} } });
    win.requirejs.config(meta({ react: ["bridge", "./amd/react"], "react-dom": ["bridge", "./amd/react-dom"] }));
    await load(win, ["app"]);
    const mods = events.filter((e) => e.name === "module").map((e) => e.data);
    expect(mods.map((m) => [m.id, m.route]).sort()).toEqual([
      ["app", "legacy"],
      ["react", "bridge"],
      ["react-dom", "bridge"],
    ]);
    const app = mods.find((m) => m.id === "app");
    expect(app.deps).toEqual(["react", "react-dom"]);
    expect(app.url).toMatch(/^file:.*\/app\.js$/);
    expect(events.filter((e) => e.name === "bridge").map((e) => e.data)).toEqual([{ name: "bridge", ok: true }]);
  });
});
