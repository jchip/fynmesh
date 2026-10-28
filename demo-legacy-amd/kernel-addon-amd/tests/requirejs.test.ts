// Pins down how a legacy page's RequireJS config turns a webpack external id
// into the common bundle file. The bridge add-on sits on `requirejs.load`, so
// it sees exactly what these tests record.
import { describe, expect, it } from "vitest";
import { fixtures, load, page } from "./harness";

describe("RequireJS id to url", () => {
  it("paths: longest id prefix wins, baseUrl otherwise", async () => {
    const dir = fixtures({
      "libs/react.js": `define([], () => ({ name: "react" }));`,
      "vendor/kit/button.js": `define([], () => ({ name: "button" }));`,
      "app.js": `define(["react", "kit/button"], (r, b) => r.name + "+" + b.name);`,
    });
    const { win, loads } = page(dir, { paths: { react: "libs/react", kit: "vendor/kit" } });
    expect(await load(win, ["app"])).toEqual(["react+button"]);
    expect(loads.map((l) => [l.id, l.url])).toEqual([
      ["app", "./app.js"],
      ["react", "./libs/react.js"],
      ["kit/button", "./vendor/kit/button.js"],
    ]);
  });

  const ids = (loads: { id: string }[]) => loads.map((l) => l.id);
  const pair = (loads: { id: string; url: string }[]) => loads.map((l) => [l.id, l.url]);

  it("bundles: one load call for the bundle file, keyed by the first requested id", async () => {
    const dir = fixtures({
      "common.js": `define("react", [], () => ({ name: "react" }));
define("react-dom", ["react"], (r) => ({ name: "dom+" + r.name }));`,
    });
    const { win, loads } = page(dir, { bundles: { common: ["react", "react-dom"] } });
    expect(await load(win, ["react-dom"])).toEqual([{ name: "dom+react" }]);
    expect(await load(win, ["react"])).toEqual([{ name: "react" }]);
    expect(pair(loads)).toEqual([["react-dom", "./common.js"]]);
  });

  it("bundles with a bridge: serving one id strands the other ids of the bundle", async () => {
    const dir = fixtures({
      "common.js": `define("react", [], () => ({ name: "react" }));
define("react-dom", ["react"], () => ({ name: "dom" }));`,
    });
    const { win, loads } = page(dir, { bundles: { common: ["react", "react-dom"] } });
    const prev = win.requirejs.load;
    win.requirejs.load = function (context: any, id: string, url: string) {
      if (id !== "react") return prev.apply(this, arguments);
      loads.push({ context: context.contextName, id, url });
      win.define("react", [], () => ({ name: "bridged" }));
      context.completeLoad("react");
    };
    expect(await load(win, ["react"])).toEqual([{ name: "bridged" }]);
    const err: any = await load(win, ["react-dom"]).then(
      () => null,
      (e) => e,
    );
    expect(err.requireType).toBe("timeout");
    expect(err.requireModules).toContain("react-dom");
    expect(ids(loads)).toEqual(["react"]);
  });

  it("map: rewrites ids per consumer, and a key matches by id prefix", async () => {
    const dir = fixtures({
      "libs/react18.js": `define([], () => ({ version: 18 }));`,
      "libs/react19.js": `define([], () => ({ version: 19 }));`,
      "widget-a.js": `define(["react"], (r) => r.version);`,
      "widget-b.js": `define(["react"], (r) => r.version);`,
      "legacy/widget.js": `define(["react"], (r) => r.version);`,
    });
    const { win, loads } = page(dir, {
      map: { "widget-a": { react: "react-18" }, legacy: { react: "react-18" }, "*": { react: "react-19" } },
      paths: { "react-18": "libs/react18", "react-19": "libs/react19" },
    });
    expect(await load(win, ["widget-a", "widget-b", "legacy/widget"])).toEqual([18, 19, 18]);
    expect(ids(loads)).toContain("react-18");
    expect(ids(loads)).toContain("react-19");
    expect(ids(loads)).not.toContain("react");
  });

  it("paths fallback array: tries the next url after a script error", async () => {
    const dir = fixtures({ "libs/react.js": `define([], () => ({ name: "react" }));` });
    const { win, loads } = page(dir, { paths: { react: ["missing/react", "libs/react"] } });
    expect(await load(win, ["react"])).toEqual([{ name: "react" }]);
    expect(pair(loads)).toEqual([
      ["react", "./missing/react.js"],
      ["react", "./libs/react.js"],
    ]);
  });

  it("errback, undef, config, retry: a failed id can be loaded again from a new url", async () => {
    const dir = fixtures({ "real/nope.js": `define([], () => "found");` });
    const { win, loads } = page(dir);
    const err: any = await load(win, ["nope"]).then(
      () => null,
      (e) => e,
    );
    expect(err.requireModules).toEqual(["nope"]);
    win.requirejs.undef("nope");
    win.requirejs.config({ paths: { nope: "real/nope" } });
    expect(await load(win, ["nope"])).toEqual(["found"]);
    expect(pair(loads)).toEqual([
      ["nope", "./nope.js"],
      ["nope", "./real/nope.js"],
    ]);
  });

  it("shim: a plain global script is exported as a module", async () => {
    const dir = fixtures({ "legacyGlobal.js": `window.LegacyGlobal = { ok: true };` });
    const { win, loads } = page(dir, { shim: { legacyGlobal: { exports: "LegacyGlobal" } } });
    expect(await load(win, ["legacyGlobal"])).toEqual([{ ok: true }]);
    expect(pair(loads)).toEqual([["legacyGlobal", "./legacyGlobal.js"]]);
  });

  it("contexts: every context shares the one global requirejs.load", async () => {
    const dir = fixtures({
      "libs/react18.js": `define([], () => ({ version: 18 }));`,
      "libs/react19.js": `define([], () => ({ version: 19 }));`,
    });
    const { win, loads } = page(dir, { paths: { react: "libs/react18" } });
    const req2 = win.requirejs.config({ context: "v2", paths: { react: "libs/react19" } });
    const [a] = await load(win, ["react"]);
    const [b] = await load(win, ["react"], req2);
    expect(a).toEqual({ version: 18 });
    expect(b).toEqual({ version: 19 });
    expect(loads).toEqual([
      { context: "_", id: "react", url: "./libs/react18.js" },
      { context: "v2", id: "react", url: "./libs/react19.js" },
    ]);
  });

  it("inline define: a module defined before the require never loads", async () => {
    const { win, loads } = page(fixtures({}));
    win.define("inline", [], () => 1);
    expect(await load(win, ["inline"])).toEqual([1]);
    expect(loads).toEqual([]);
  });

  it("dedupe: a shared dependency loads once", async () => {
    const dir = fixtures({
      "a.js": `define(["shared"], (s) => "a" + s);`,
      "b.js": `define(["shared"], (s) => "b" + s);`,
      "shared.js": `define([], () => "S");`,
    });
    const { win, loads } = page(dir);
    expect(await load(win, ["a", "b"])).toEqual(["aS", "bS"]);
    expect(ids(loads).filter((i) => i === "shared")).toEqual(["shared"]);
  });

  it("urlArgs: appended to every url", async () => {
    const dir = fixtures({ "x.js": `define([], () => "x");` });
    const { win, loads } = page(dir, { urlArgs: "v=1" });
    expect(await load(win, ["x"])).toEqual(["x"]);
    expect(pair(loads)).toEqual([["x", "./x.js?v=1"]]);
  });
});
