import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
import { fynopsData, type DataStatus } from "fynops-data-core";

/**
 * Phase 0 spike: shows what the fynops-data worker reports, runs a GROUP BY
 * and a page query, and offers a reset. Plain DOM, so the only moving part
 * under test is the shared module and its worker.
 */
class SpikeData implements FynUnit {
  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(_runtime: FynUnitRuntime) {
    let target = document.getElementById("spike-data");
    if (!target) {
      target = document.createElement("div");
      target.id = "spike-data";
      target.style.cssText = "font-family: system-ui, sans-serif; padding: 0 2rem 2rem;";
      document.body.appendChild(target);
    }
    target.innerHTML = `
      <h2>spike-data</h2>
      <p><button data-action="reset">Reset data</button> <button data-action="rerun">Re-run queries</button></p>
      <pre data-testid="spike-data-status">starting...</pre>
      <h3>Shipments by carrier</h3>
      <pre data-testid="spike-data-groupby"></pre>
      <h3>Shipments page (delayed, by due date)</h3>
      <pre data-testid="spike-data-page"></pre>
    `;
    const $ = (id: string) => target!.querySelector<HTMLElement>(`[data-testid=spike-data-${id}]`)!;

    const showStatus = (s: DataStatus) => {
      $("status").textContent = JSON.stringify(s, null, 2);
    };

    const runQueries = async () => {
      let t = performance.now();
      const byCarrier = await fynopsData.query<{ carrier: string; shipments: number; revenue: number }>(
        "SELECT c.name AS carrier, count(*) AS shipments, round(sum(s.rate_usd)) AS revenue" +
          " FROM shipments s JOIN carriers c ON c.id = s.carrier_id GROUP BY c.id ORDER BY shipments DESC",
      );
      const groupMs = Math.round(performance.now() - t);
      $("groupby").textContent =
        `${groupMs} ms, ${byCarrier.length} carriers\n` +
        byCarrier.slice(0, 5).map((r) => `${r.carrier}: ${r.shipments} shipments, $${r.revenue}`).join("\n");

      t = performance.now();
      const page = await fynopsData.shipments.page({
        limit: 5,
        filter: { status: "delayed" },
        sort: [{ column: "due_at", dir: "asc" }],
      });
      const pageMs = Math.round(performance.now() - t);
      $("page").textContent =
        `${pageMs} ms, ${page.total} delayed in total\n` +
        page.rows.map((r) => `${r.ref} ${r.origin}->${r.destination} ${r.carrier} due ${r.due_at}`).join("\n");
    };

    const load = async () => {
      const status = await fynopsData.status();
      showStatus(status);
      if (status.state === "ready") await runQueries();
    };

    target.querySelector("[data-action=reset]")!.addEventListener("click", async () => {
      $("status").textContent = "resetting...";
      showStatus(await fynopsData.reset());
      await runQueries();
    });
    target.querySelector("[data-action=rerun]")!.addEventListener("click", () => void runQueries());

    load().catch((error) => {
      $("status").textContent = `failed: ${error.message}`;
    });

    return {
      type: "self-managed" as const,
      target,
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }
}

export const main = new SpikeData();
