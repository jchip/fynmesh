import type { FynUnit, FynUnitRuntime } from "@fynmesh/kernel";
// Resolved by the monaco-worker plugin in rollup.config.ts to the hashed worker
// file's url, relative to this chunk (import.meta.url), not to the page.
import editorWorkerUrl from "virtual:monaco-editor-worker";
import * as monaco from "./monaco";
import { RULES_LANGUAGE_ID, SAMPLE_RULES, rulesLanguage } from "./rules-lang";

// Monaco asks for a worker by label. The spike keeps only the core editor
// worker, which also serves the custom language (no language worker needed).
(self as any).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    return new Worker(editorWorkerUrl, { name: `spike-monaco:${label}` });
  },
};

monaco.languages.register({ id: RULES_LANGUAGE_ID });
monaco.languages.setMonarchTokensProvider(RULES_LANGUAGE_ID, rulesLanguage);

class SpikeMonaco implements FynUnit {
  private editor?: monaco.editor.IStandaloneCodeEditor;

  initialize(_runtime: FynUnitRuntime) {
    return { status: "ready" as const, mode: "standalone" as const };
  }

  async execute(runtime: FynUnitRuntime) {
    let target = document.getElementById("spike-monaco");
    if (!target) {
      target = document.createElement("div");
      target.id = "spike-monaco";
      target.style.cssText = "height: 320px; margin: 1rem 2rem; border: 1px solid #cbd5e1;";
      document.body.appendChild(target);
    }

    this.editor = monaco.editor.create(target, {
      value: SAMPLE_RULES,
      language: RULES_LANGUAGE_ID,
      automaticLayout: true,
      minimap: { enabled: false },
    });
    // Handy for poking at the spike from the console.
    (window as any).__spikeMonaco = { monaco, editor: this.editor, editorWorkerUrl };
    console.log(`[spike-monaco] editor ready on ${runtime.fynApp.name}, worker ${editorWorkerUrl}`);

    return {
      type: "self-managed" as const,
      target,
      cleanup: () => this.shutdown(),
      metadata: { framework: "vanilla", capabilities: ["self-managed"] },
    };
  }

  shutdown(): void {
    this.editor?.dispose();
    this.editor = undefined;
  }
}

export const main = new SpikeMonaco();
