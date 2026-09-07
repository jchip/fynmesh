import { describe, it, expect } from "vitest";
import nunjucks from "nunjucks";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
    DEMO_FYNAPPS,
    DEMO_INFO_CARDS,
    getDemoTemplateData,
} from "../scripts/demo-template-data.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "../templates");

describe("demo-template-data", () => {
    it("includes fynapp-notes in DEMO_FYNAPPS with correct metadata", () => {
        const notesApp = DEMO_FYNAPPS.find((app) => app.id === "fynapp-notes");
        expect(notesApp).toBeDefined();
        expect(notesApp).toEqual({
            id: "fynapp-notes",
            name: "FynApp Notes",
            framework: "React 19",
            color: "fynapp-notes",
            badge: "info",
        });
    });

    it("getDemoTemplateData returns all apps and cards with options applied", () => {
        const data = getDemoTemplateData({
            isProduction: true,
            pathPrefix: "/prefix/",
        });

        expect(data.isProduction).toBe(true);
        expect(data.pathPrefix).toBe("/prefix/");
        expect(data.fynApps).toEqual(DEMO_FYNAPPS);
        expect(data.infoCards).toEqual(DEMO_INFO_CARDS);
    });

    it("has CSS styles defined in styles.html for every app in DEMO_FYNAPPS", () => {
        const stylesHtml = readFileSync(
            path.join(templateDir, "components/styles.html"),
            "utf-8"
        );

        for (const app of DEMO_FYNAPPS) {
            expect(stylesHtml).toContain(`--${app.color}:`);
            expect(stylesHtml).toContain(`.text-${app.color}`);
            expect(stylesHtml).toContain(`.bg-${app.color}`);
            expect(stylesHtml).toContain(`.border-${app.color}`);
            expect(stylesHtml).toContain(`[data-border-color="${app.color}"]`);
        }
    });

    it("renders demo.html with containers for every FynApp BEFORE the footer", () => {
        const env = nunjucks.configure(templateDir, {
            autoescape: true,
            noCache: true,
        });

        const templateData = getDemoTemplateData({
            isProduction: false,
            pathPrefix: "/",
        });

        const html = env.render("pages/demo.html", templateData);
        const footerIndex = html.indexOf("<footer");
        expect(footerIndex).toBeGreaterThan(0);

        const copyrightIndex = html.indexOf(
            "Demonstrating the future of micro-frontend architecture."
        );
        expect(copyrightIndex).toBeGreaterThan(footerIndex);

        for (const app of DEMO_FYNAPPS) {
            const containerPattern = `id="${app.id}"`;
            const containerIndex = html.indexOf(containerPattern);

            expect(containerIndex).toBeGreaterThan(0);
            expect(containerIndex).toBeLessThan(footerIndex);
        }

        // Specifically verify fynapp-notes is placed inside the card container before footer
        const notesIndex = html.indexOf('id="fynapp-notes"');
        expect(notesIndex).toBeGreaterThan(0);
        expect(notesIndex).toBeLessThan(footerIndex);
        expect(notesIndex).toBeLessThan(copyrightIndex);
    });
});
