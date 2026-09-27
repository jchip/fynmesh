// Scoped to .ops-sh, the root class of every ops-shipments view. Injected once.
const CSS = `
.ops-sh { display: flex; flex-direction: column; height: 100%; min-height: 560px; gap: var(--fo-ui-space-3, 12px);
  padding: var(--fo-ui-space-4, 16px); box-sizing: border-box; font-family: var(--fo-ui-font-family, system-ui, sans-serif); }
.ops-sh-grid { flex: 1; min-height: 420px; }
.ops-sh-search { padding: 6px 10px; border: 1px solid var(--fo-ui-color-border, #e2e8f0); border-radius: 6px;
  font: inherit; min-width: 220px; background: var(--fo-ui-color-surface, #fff); color: var(--fo-ui-color-text, #0f172a); }
.ops-sh-select { padding: 6px 8px; border: 1px solid var(--fo-ui-color-border, #e2e8f0); border-radius: 6px; font: inherit;
  background: var(--fo-ui-color-surface, #fff); color: var(--fo-ui-color-text, #0f172a); }
.ops-sh-label { display: inline-flex; align-items: center; gap: 6px; color: var(--fo-ui-color-text-muted, #64748b); font-size: 13px; }
.ops-sh-spacer { flex: 1; }
.ops-sh-count { color: var(--fo-ui-color-text-muted, #64748b); font-size: 13px; }
.ops-sh .ag-row.ops-sh-selected { background: var(--fo-ui-color-status-in-transit-bg, #dbeafe) !important; }
.ops-sh .ag-row.ops-sh-selected .ag-cell { font-weight: 600; }
.ops-sh-spark { width: 120px; height: 26px; }
.ops-sh-detail { display: flex; flex-direction: column; gap: var(--fo-ui-space-3, 12px); padding: var(--fo-ui-space-3, 12px); }
.ops-sh-detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0; font-size: 14px; }
.ops-sh-detail dt { color: var(--fo-ui-color-text-muted, #64748b); }
.ops-sh-detail dd { margin: 0; }
.ops-sh-timeline { list-style: none; margin: 0; padding: 0; font-size: 14px; }
.ops-sh-timeline li { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--fo-ui-color-border, #e2e8f0); }
.ops-sh-timeline time { color: var(--fo-ui-color-text-muted, #64748b); min-width: 150px; }
.ops-sh-note { color: var(--fo-ui-color-text-muted, #64748b); font-size: 13px; }
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.fynapp = "ops-shipments";
  style.textContent = CSS;
  document.head.appendChild(style);
}
