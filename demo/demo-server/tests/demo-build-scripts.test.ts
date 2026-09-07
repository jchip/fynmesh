import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demoServer = path.join(repoRoot, "demo/demo-server");
const read = (rel: string) => readFileSync(path.join(demoServer, rel), "utf8");

/**
 * FYM-388. `gh-deploy` force-pushes to the branch Cloudflare Pages serves and
 * ends in `git checkout -f main`, which discards uncommitted work. The
 * build-only path exists so nobody has to reach for the publish chain to get an
 * artifact, and it is only useful if it stays free of the deploy half.
 */
describe("demo site build and publish scripts", () => {
    const rootScripts = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts;

    it("offers a build-only path that touches no git state", () => {
        expect(rootScripts["build-demo"]).toBeDefined();
        expect(rootScripts["build-demo"]).not.toMatch(/gh-(publish|deploy)/);
        expect(rootScripts["_build-demo-site"]).not.toMatch(/gh-(publish|deploy)/);
    });

    it("keeps publish-demo wired to the publish chain", () => {
        expect(rootScripts["publish-demo"]).toMatch(/_gh-publish/);
    });

    it("separates the destructive deploy from the site build", () => {
        const tasks = read("xrun-tasks.ts");

        expect(tasks).toMatch(/"gh-deploy":/);
        expect(tasks).toMatch(/"gh-publish":[\s\S]*serial\(\["build-demo-site", "gh-deploy"\]\)/);
    });
});
