/**
 * Plain CSS for the Phase 1 shell, injected once. Replaced by the fynops-ui kit
 * later; kept as a string so the shell needs no CSS build plugin.
 */
const CSS = `
.fo-shell { display: grid; grid-template-columns: 200px 1fr auto; grid-template-rows: 48px 1fr; height: 100vh;
  font-family: system-ui, -apple-system, sans-serif; color: #1f2937; background: #f8fafc; }
.fo-topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 1rem; padding: 0 1rem;
  background: #111827; color: #f9fafb; }
.fo-topbar .fo-brand { font-weight: 700; letter-spacing: 0.02em; }
.fo-topbar .fo-spacer { flex: 1; }
.fo-topbar .fo-role { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; background: #374151; }
.fo-nav { display: flex; flex-direction: column; padding: 0.75rem 0; background: #fff; border-right: 1px solid #e5e7eb; }
.fo-nav a { padding: 0.5rem 1rem; color: inherit; text-decoration: none; }
.fo-nav a:hover { background: #f3f4f6; }
.fo-nav a.fo-active { background: #eef2ff; color: #3730a3; font-weight: 600; }
.fo-main { position: relative; overflow: auto; min-width: 0; }
.fo-host { height: 100%; }
.fo-host[hidden] { display: none; }
.fo-drawer { width: 380px; border-left: 1px solid #e5e7eb; background: #fff; display: flex; flex-direction: column; min-height: 0; }
.fo-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e5e7eb; font-weight: 600; }
.fo-drawer-body { flex: 1; overflow: auto; }
.fo-panel { margin: 2rem; padding: 1.25rem 1.5rem; border-radius: 8px; background: #fff; border: 1px solid #e5e7eb; }
.fo-panel.fo-error { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
.fo-panel h2 { margin: 0 0 0.5rem; font-size: 1.1rem; }
.fo-login { display: flex; align-items: center; justify-content: center; height: 100vh; background: #f1f5f9;
  font-family: system-ui, -apple-system, sans-serif; }
.fo-login form { display: flex; flex-direction: column; gap: 0.75rem; width: 280px; padding: 1.5rem;
  background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; }
.fo-login h1 { margin: 0; font-size: 1.25rem; }
.fo-btn { padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; font: inherit; }
.fo-btn.fo-primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.fo-topbar .fo-btn { background: transparent; color: inherit; border-color: #4b5563; }
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.fynapp = "fynops-shell";
  style.textContent = CSS;
  document.head.appendChild(style);
}
