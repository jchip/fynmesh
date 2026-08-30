import { load, exec } from "@xarc/run";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Explicit combine groups, by demo app directory.
 *
 * Only one app needs one. `fynapp-react-19`'s 314-byte `index.js` and its
 * 9.4 KB React ESM chunk are both in the startup set, so they are worth a
 * single request even though the React chunk is far over `maxModuleSize` --
 * which is exactly what an explicit group is for. Every other app is left to
 * the size policy, which is the case worth demonstrating by default.
 *
 * Referenced by chunk stem, not fileName, because the hashes move every build.
 */
const COMBINE_GROUPS: Record<string, Record<string, string[]>> = {
    "fynapp-react-19": { startup: ["index", "react-esm-19.production"] },
};

/**
 * Every built FynApp dist directory: `demo/*` that has a `federation.json`.
 *
 * Presence of that file is the test rather than a hardcoded list, because it is
 * also what `combineDist` needs to read -- so a directory that passes here is
 * one it can actually process. Skips `demo-server`, whose dist is not a
 * federation build, and any app that has not been built yet.
 *
 * @returns [app directory name, dist path] pairs
 */
function builtFynApps(): Array<[string, string]> {
    return fs
        .readdirSync("demo")
        .map((app): [string, string] => [app, path.join("demo", app, "dist")])
        .filter(([, dist]) => fs.existsSync(path.join(dist, "federation.json")));
}

load({
    "clone-fed": {
        desc: "Clone the federation repository",
        task: async () => {
            return fs.existsSync("rollup-federation") ||
                exec("git clone https://github.com/jchip/rollup-federation.git");
        }
    },

    "combine-demo": {
        desc: "Combine each demo FynApp's tiny federated chunks into one file",
        /*
         * A post-build step over finished dist directories, not part of any
         * app's rollup build -- see rollup-federation/notes/combined-module-bundles.md.
         * Being separate is what keeps it production-only: `build` never runs
         * it, so a dev build keeps one file per chunk and its sourcemaps.
         *
         * Must run after every app has built and before anything reads the
         * chunk filenames. The preload list in demo-server is the reader that
         * matters: it resolves a chunk to the file that actually carries it, so
         * it has to see the `federation.bundles.json` this step writes into each
         * app's dist -- the map an app offers. fynpo builds demo-server
         * as just another package, i.e. before this runs, which is why
         * `build-prod` regenerates the shell templates afterwards -- without
         * that step it leaves a shell.html preloading chunks the runtime no
         * longer requests, the very regression this feature has to avoid.
         */
        task: async () => {
            /*
             * Imported from the federation build output by path, not as a
             * dependency. `fyn` installs a linked local package by hard-linking
             * its files, and the plugin's build does `rm -rf dist && tsc` --
             * fresh inodes, so an installed copy freezes at install time. Root
             * `fyn` only reruns when node_modules is missing, so a node_modules
             * copy here would silently combine with a stale combiner. fynpo
             * builds this package (fynpo.json lists rollup-federation/*), so by
             * the time this task runs the dist is current by construction.
             */
            const { combineDist } = await import(
                "../rollup-federation/rollup-plugin-federation/dist/combine.mjs"
            );

            const apps = builtFynApps();
            if (!apps.length) {
                throw new Error("no built FynApp found under demo/*/dist - run a build first");
            }

            let saved = 0;
            for (const [app, dist] of apps) {
                const result = combineDist(dist, {
                    groups: COMBINE_GROUPS[app],
                    log: (m: string) => console.log(`[combine ${app}] ${m}`),
                });
                saved += result.requestsSaved;
            }
            console.log(`[combine] ${apps.length} FynApps, ${saved} fewer requests`);
        }
    },
    "release-gate": {
        desc: "Refuse to publish local fyn dependency overrides",
        /*
         * fyn honors `fyn` dependency overrides from *published* metadata, and
         * the monorepo-relative paths they hold don't exist on a consumer's
         * machine (FYM-244). Per-package tests only guard the packages that
         * carry them, so this walks fynpo's own publish set (fynpo.json
         * command.publish.includePackages) to gate every publishable package.
         */
        task: () => {
            const fynpoConfig = JSON.parse(fs.readFileSync("fynpo.json", "utf-8"));
            const includePackages: string[] =
                fynpoConfig.command?.publish?.includePackages ?? [];

            const offenders: string[] = [];
            let checked = 0;

            for (const entry of includePackages) {
                // entries look like "path:core/*"; only this simple form is used here
                const pattern = entry.replace(/^path:/, "");
                const parent = path.dirname(pattern);
                const dirs =
                    path.basename(pattern) === "*"
                        ? fs
                              .readdirSync(parent, { withFileTypes: true })
                              .filter((d) => d.isDirectory())
                              .map((d) => path.join(parent, d.name))
                        : [pattern];

                for (const dir of dirs) {
                    const pkgFile = path.join(dir, "package.json");
                    if (!fs.existsSync(pkgFile)) continue;
                    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf-8"));
                    if (pkg.private) continue;
                    checked++;
                    if ("fyn" in pkg) offenders.push(pkgFile);
                }
            }

            if (!checked) {
                throw new Error(
                    "release-gate: no publishable packages found - check fynpo.json includePackages",
                );
            }
            if (offenders.length) {
                for (const f of offenders) console.error(`[release-gate] offender: ${f}`);
                throw new Error(
                    `release-gate: ${offenders.length} publishable package(s) carry a \`fyn\` key (local dev overrides)`,
                );
            }
            console.log(`[release-gate] OK - ${checked} publishable packages carry no fyn overrides`);
        },
    },
});
