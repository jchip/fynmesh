import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const shellLayout = readFileSync(
    path.join(repoRoot, "demo/fynapp-shell-mw/src/middleware/shell-layout.ts"),
    "utf8"
);

/**
 * FYM-397. "Clear All" tears down every region, the sidebar included. The
 * sidebar is the shell's own navigation and used to arrive only from a one-shot
 * timeout at startup, and it was missing from the FynApp dropdown, so once
 * cleared there was no way to get it back short of reloading the page.
 *
 * Re-loading a cleared FynApp works fine at the kernel level -- verified in a
 * browser: after Clear All, both a main-region and a sidebar-region load
 * succeed with no errors. So the two things that need pinning are the ones that
 * were actually missing: the sidebar is offered like any other FynApp, and the
 * clear puts it back.
 */
describe("shell sidebar recovery", () => {
    it("offers the sidebar in the FynApp catalogue like any other app", () => {
        expect(shellLayout).toContain('id: "fynapp-sidebar"');
        expect(shellLayout).toContain('url: "/fynapp-sidebar/dist"');
    });

    it("restores the sidebar after Clear All has torn everything down", () => {
        const clearContent = shellLayout.slice(
            shellLayout.indexOf("private async clearContent()")
        );
        const body = clearContent.slice(0, clearContent.indexOf("\n  }"));

        // still a real teardown: both regions go
        expect(body).toContain("clearRegion('main')");
        expect(body).toContain("clearRegion('sidebar')");
        // ...and the navigation comes back
        expect(body).toContain("await this.loadSidebar()");
    });

    it("loads the sidebar through one reusable method, not an inline one-shot", () => {
        expect(shellLayout).toContain("private async loadSidebar()");

        const autoLoad = shellLayout.slice(shellLayout.indexOf("private autoLoadSidebar()"));
        const body = autoLoad.slice(0, autoLoad.indexOf("\n  }"));

        // startup delegates rather than duplicating the load
        expect(body).toContain("this.loadSidebar()");
        expect(body).not.toContain("loadIntoRegion");
    });

    it("keeps a failed sidebar from taking down the operation that asked for it", () => {
        const loadSidebar = shellLayout.slice(shellLayout.indexOf("private async loadSidebar()"));
        const body = loadSidebar.slice(0, loadSidebar.indexOf("\n  }"));

        expect(body).toContain("catch");
    });
});
