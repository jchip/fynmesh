// The contract between the legacy webpack builds and the CWP: every id a built
// legacy bundle `define`-depends on must be an external in each CWP's cwp.json.
// A new external in a legacy build fails here instead of at runtime.
import { readdirSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const distDir = new URL("legacy-components/dist/", root);
const cwps = ["fynapp-cwp-3", "fynapp-cwp-4"];

/** The deps array each bundle passes to `define`, by running it against a stub. */
function defineDeps(file: string): string[] {
  let deps: string[] = [];
  runInNewContext(readFileSync(new URL(file, distDir), "utf-8"), {
    define: (d: string[]) => {
      deps = d;
    },
  });
  return deps;
}

describe("CWP externals contract", () => {
  const bundles = readdirSync(distDir).filter((f) => f.endsWith(".js"));

  it("finds the built legacy bundles", () => {
    expect(bundles.sort()).toEqual(["ui-kit.js", "widget-a.js", "widget-b.js", "widget-c.js"]);
  });

  for (const cwp of cwps) {
    const { externals } = JSON.parse(readFileSync(new URL(`${cwp}/cwp.json`, root), "utf-8"));

    it(`${cwp}: cwp.json lists every define dep of the legacy bundles`, () => {
      const missing = bundles.flatMap((f) => defineDeps(f).filter((id) => !(id in externals)).map((id) => `${f}: ${id}`));
      expect(missing).toEqual([]);
    });

    it(`${cwp}: the built meta serves every external, a subpath from its package's share`, () => {
      let modules: Record<string, { expose: string; share: string }> = {};
      runInNewContext(readFileSync(new URL(`${cwp}/dist/amd-meta.js`, root), "utf-8"), {
        requirejs: { config: (c: any) => (modules = c.config.fynmesh.modules) },
      });
      expect(Object.keys(modules).sort()).toEqual(Object.keys(externals).sort());
      expect(modules["react-dom/client"]).toMatchObject({
        expose: "./amd/react-dom/client",
        share: modules["react-dom"].share,
      });
    });

    // The container drops rollup's `.then(n => n.<name>)` pick, so an expose that
    // shares a chunk with another one would get that chunk's whole namespace.
    it(`${cwp}: each expose has a chunk of its own`, () => {
      const entry = readFileSync(new URL(`${cwp}/dist/fynapp-entry.js`, root), "utf-8");
      // dev: `_E("./amd/x", _f('./m0.js'))`; minified: `_E("./amd/x",n("./m0.js"))`
      const files = [...entry.matchAll(/_E\("(\.\/amd\/[^"]+)",\s*[\w$]+\(["']([^"']+)["']\)(\.then)?/g)];
      expect(files.map((m) => m[1]).sort()).toEqual(Object.keys(externals).map((id) => `./amd/${id}`).sort());
      expect(files.filter((m) => m[3])).toEqual([]);
      expect(new Set(files.map((m) => m[2])).size).toBe(files.length);
    });
  }
});
