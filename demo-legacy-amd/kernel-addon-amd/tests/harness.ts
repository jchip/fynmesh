import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const requireJsSrc = readFileSync(createRequire(import.meta.url).resolve("requirejs/require.js"), "utf-8");

/** Writes files into a fresh temp dir and returns it. Paths may contain `/`. */
export function fixtures(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "amd-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

export type LoadCall = { context: string; id: string; url: string };

/**
 * A JSDOM page at `dir/` with RequireJS loaded and configured. RequireJS fetches
 * real files through <script> tags. `loads` records every `requirejs.load` call.
 */
export function page(dir: string, config: Record<string, unknown> = {}) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: pathToFileURL(dir + "/").href,
    runScripts: "dangerously",
    resources: "usable",
  });
  const win = dom.window as any;
  win.eval(requireJsSrc);
  const loads: LoadCall[] = [];
  const origLoad = win.requirejs.load;
  win.requirejs.load = function (context: any, id: string, url: string) {
    loads.push({ context: context.contextName, id, url });
    return origLoad.apply(this, arguments);
  };
  // A missing define or file fails in 1s instead of the default 7s.
  win.requirejs.config({ waitSeconds: 1, ...config });
  return { win, loads, dom };
}

/** Promise form of `require(ids, cb, errback)`. `req` defaults to the global require. */
export function load(win: any, ids: string[], req: any = win.require): Promise<any[]> {
  return new Promise((resolve, reject) => req(ids, (...mods: any[]) => resolve(mods), reject));
}

const addonSrc = readFileSync(new URL("../addon-amd.js", import.meta.url), "utf-8");

/** A FynApp for the fake kernel: expose name -> the ES namespace it resolves to. */
export type FakeApp = Record<string, Record<string, unknown>>;

/**
 * Installs the AMD add-on on `win` against a fake kernel. The fake implements
 * only the add-on protocol the add-on uses. A FynApp set to "fail" rejects its load.
 */
export function bridge(win: any, apps: Record<string, FakeApp | "fail">) {
  const fynapps: string[] = [];
  const events: any[] = [];
  const registry: Record<string, { name: string; exposes: FakeApp }> = {};
  const hooks = {
    findApp: (name: string) => registry[name],
    loadExpose: async (app: { exposes: FakeApp }, expose: string) =>
      app.exposes[expose]
        ? { success: true, value: { ns: app.exposes[expose] } }
        : { success: false, error: new Error(`no expose ${expose}`) },
    tel: {
      scope: () => ({
        capture: (e: any) => events.push(e),
        capErr: (name: string, data: any) => events.push({ name: `err:${name}`, data }),
      }),
    },
  };
  const kernel = {
    use: (addon: any) => addon.install(kernel, hooks),
    // `apps` keys are a name, or `name@version` for a request with that range.
    loadFynAppsByName: async (reqs: { name: string; range?: string }[]) => {
      for (const { name, range } of reqs) {
        const key = range ? `${name}@${range}` : name;
        fynapps.push(key);
        const app = apps[key];
        if (!app || app === "fail") throw new Error(`no FynApp ${key}`);
        registry[key] = { name, exposes: app };
      }
    },
  };
  win.fynMeshKernel = kernel;
  win.console.error = () => {};
  win.eval(addonSrc);
  return { fynapps, events };
}

/** The `requirejs.config` an `amd-meta.js` makes: AMD id -> [FynApp, expose, version?]. */
export function meta(modules: Record<string, [string, string, string?]>) {
  return {
    config: {
      fynmesh: {
        modules: Object.fromEntries(
          Object.entries(modules).map(([id, [fynapp, expose, version]]) => [id, { fynapp, expose, version }]),
        ),
      },
    },
  };
}
