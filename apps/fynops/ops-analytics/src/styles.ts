// Scoped to .ops-an, the root class of the ops-analytics view. Injected once.
const CSS = `
.ops-an { display: flex; flex-direction: column; height: 100%; min-height: 560px; gap: var(--fo-ui-space-4, 16px);
  padding: var(--fo-ui-space-4, 16px); box-sizing: border-box; font-family: var(--fo-ui-font-sans, system-ui, sans-serif); }
.ops-an-tiles { display: flex; flex-wrap: wrap; gap: var(--fo-ui-space-3, 12px); }
.ops-an-charts { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: minmax(320px, 1fr); gap: var(--fo-ui-space-3, 12px); }
.ops-an-chart { width: 100%; height: 100%; min-height: 280px; }
.ops-an-error { padding: var(--fo-ui-space-4, 16px); color: var(--fo-ui-color-status-exception-fg, #991b1b); }
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.fynapp = "ops-analytics";
  style.textContent = CSS;
  document.head.appendChild(style);
}
