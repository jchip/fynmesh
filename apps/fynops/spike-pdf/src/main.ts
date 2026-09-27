import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import { GlobalWorkerOptions, PDFWorker, TextLayer, getDocument } from "pdfjs-dist";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
// @ts-ignore - virtual module from rollup.config.ts
import workerUrl from "pdf-worker-url";
import "./text-layer.css";

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Phase 0 spike: pdf.js inside a FynApp (notes/FYNOPS-DESIGN.md).
 *
 * Generates a two-page bill of lading with pdf-lib, then renders page 1 with
 * pdf.js onto a canvas plus a selectable text layer. The worker comes from this
 * app's dist, not the page's directory.
 */

/** A bill of lading for one shipment, built on the fly so no PDF ships. */
async function buildBillOfLading(shipmentId: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const rows = [
    ["Pallet", "Description", "Weight (lb)", "Class"],
    ["1", "Auto parts, boxed", "1,240", "70"],
    ["2", "Auto parts, boxed", "1,180", "70"],
    ["3", "Brake rotors", "2,050", "85"],
    ["4", "Filters, cartons", "640", "100"],
  ];

  const page1 = doc.addPage([612, 792]);
  page1.drawText("BILL OF LADING", { x: 50, y: 730, size: 24, font: bold });
  page1.drawText(`Shipment ${shipmentId}`, { x: 50, y: 700, size: 14, font });
  page1.drawText("Shipper: Midwest Parts Co, Chicago IL", { x: 50, y: 675, size: 11, font });
  page1.drawText("Consignee: Lone Star Auto, Dallas TX", { x: 50, y: 660, size: 11, font });
  page1.drawText("Carrier: FynFreight Lines   Lane: CHI-DAL", { x: 50, y: 645, size: 11, font });

  const cols = [50, 110, 330, 450];
  let y = 600;
  rows.forEach((row, i) => {
    if (i === 0) {
      page1.drawRectangle({ x: 45, y: y - 5, width: 520, height: 20, color: rgb(0.9, 0.92, 0.96) });
    }
    row.forEach((cell, c) =>
      page1.drawText(cell, { x: cols[c], y, size: 11, font: i === 0 ? bold : font }),
    );
    y -= 24;
  });

  const page2 = doc.addPage([612, 792]);
  page2.drawText("TERMS AND SIGNATURES", { x: 50, y: 730, size: 18, font: bold });
  page2.drawText("Received in apparent good order, except as noted.", { x: 50, y: 700, size: 11, font });
  page2.drawText("Shipper signature: ____________________", { x: 50, y: 660, size: 11, font });
  page2.drawText("Carrier signature: ____________________", { x: 50, y: 630, size: 11, font });

  return doc.save();
}

class SpikePdfUnit implements FynUnit {
  private target?: HTMLElement;
  private worker?: PDFWorker;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(_runtime: FynUnitRuntime) {
    let target = document.getElementById("spike-pdf");
    if (!target) {
      target = document.createElement("div");
      target.id = "spike-pdf";
      target.style.padding = "0 2rem 2rem";
      document.body.appendChild(target);
    }
    this.target = target;

    const status = document.createElement("p");
    status.dataset.testid = "spike-pdf-status";
    status.textContent = "Rendering bill of lading...";
    target.appendChild(status);

    try {
      await this.render(target, status);
    } catch (error) {
      status.textContent = `spike-pdf failed: ${(error as Error).message}`;
      console.error("spike-pdf failed", error);
    }

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }

  private async render(target: HTMLElement, status: HTMLElement) {
    const started = performance.now();
    const data = await buildBillOfLading("SHP-100482");
    const generatedMs = performance.now() - started;

    // A dedicated PDFWorker makes the worker kind observable: a real one
    // exposes a Worker as its port, the fallback "fake worker" does not.
    this.worker = new PDFWorker();
    await this.worker.promise;
    const realWorker = this.worker.port instanceof Worker;

    const pdf = await getDocument({ data, worker: this.worker }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.25 });

    const pageBox = document.createElement("div");
    pageBox.style.position = "relative";
    pageBox.style.width = `${viewport.width}px`;
    pageBox.style.height = `${viewport.height}px`;
    pageBox.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    pageBox.style.setProperty("--total-scale-factor", String(viewport.scale));
    pageBox.style.setProperty("--scale-round-x", "1px");
    pageBox.style.setProperty("--scale-round-y", "1px");

    const canvas = document.createElement("canvas");
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    pageBox.appendChild(canvas);

    const textBox = document.createElement("div");
    textBox.className = "textLayer";
    pageBox.appendChild(textBox);
    target.appendChild(pageBox);

    await page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    }).promise;
    await new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textBox,
      viewport,
    }).render();

    const totalMs = performance.now() - started;
    status.textContent =
      `Rendered page 1 of ${pdf.numPages}. Worker: ${realWorker ? "real" : "fake"} ` +
      `(${workerUrl}). Generated in ${generatedMs.toFixed(0)}ms, total ${totalMs.toFixed(0)}ms.`;
    console.log("[spike-pdf]", { realWorker, workerUrl, pages: pdf.numPages, generatedMs, totalMs });
  }

  shutdown(): void {
    this.worker?.destroy();
    this.worker = undefined;
    this.target?.remove();
    this.target = undefined;
  }
}

export const main = new SpikePdfUnit();
