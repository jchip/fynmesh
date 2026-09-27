/**
 * Design tokens and component CSS for the FynOps UI kit, injected once as a
 * <style> tag. Tokens are CSS custom properties on `:root` (light theme,
 * the default) with dark overrides under the `[data-theme="dark"]`
 * attribute selector — set that attribute on any element (the page root or
 * just the app's own container) to theme its subtree.
 *
 * Class names are prefixed `fo-ui-` to stay clear of fynops-shell's own
 * temporary `fo-` classes (see fynops-shell/src/styles.ts).
 */
const CSS = `
:root {
  --fo-ui-color-bg: #f8fafc;
  --fo-ui-color-surface: #ffffff;
  --fo-ui-color-border: #e2e8f0;
  --fo-ui-color-text: #0f172a;
  --fo-ui-color-text-muted: #64748b;

  --fo-ui-color-primary: #4f46e5;
  --fo-ui-color-primary-hover: #4338ca;
  --fo-ui-color-on-primary: #ffffff;
  --fo-ui-color-secondary-bg: #ffffff;
  --fo-ui-color-secondary-border: #cbd5e1;
  --fo-ui-color-ghost-hover: #f1f5f9;

  --fo-ui-color-status-on-time-bg: #dcfce7;
  --fo-ui-color-status-on-time-fg: #166534;
  --fo-ui-color-status-delayed-bg: #fef9c3;
  --fo-ui-color-status-delayed-fg: #854d0e;
  --fo-ui-color-status-in-transit-bg: #dbeafe;
  --fo-ui-color-status-in-transit-fg: #1e40af;
  --fo-ui-color-status-delivered-bg: #e2e8f0;
  --fo-ui-color-status-delivered-fg: #334155;
  --fo-ui-color-status-exception-bg: #fee2e2;
  --fo-ui-color-status-exception-fg: #991b1b;

  --fo-ui-color-delta-up: #16a34a;
  --fo-ui-color-delta-down: #dc2626;

  --fo-ui-space-1: 4px;
  --fo-ui-space-2: 8px;
  --fo-ui-space-3: 12px;
  --fo-ui-space-4: 16px;
  --fo-ui-space-5: 24px;
  --fo-ui-space-6: 32px;

  --fo-ui-radius-sm: 4px;
  --fo-ui-radius-md: 8px;
  --fo-ui-radius-lg: 12px;

  --fo-ui-font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fo-ui-font-size-sm: 12px;
  --fo-ui-font-size-md: 14px;
  --fo-ui-font-size-lg: 18px;
  --fo-ui-font-weight-medium: 500;
  --fo-ui-font-weight-semibold: 600;

  --fo-ui-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06);
  --fo-ui-shadow-md: 0 4px 12px rgba(15, 23, 42, 0.1);
}

[data-theme="dark"] {
  --fo-ui-color-bg: #0b1120;
  --fo-ui-color-surface: #111827;
  --fo-ui-color-border: #1f2937;
  --fo-ui-color-text: #f1f5f9;
  --fo-ui-color-text-muted: #94a3b8;

  --fo-ui-color-primary: #6366f1;
  --fo-ui-color-primary-hover: #818cf8;
  --fo-ui-color-on-primary: #ffffff;
  --fo-ui-color-secondary-bg: #111827;
  --fo-ui-color-secondary-border: #334155;
  --fo-ui-color-ghost-hover: #1e293b;

  --fo-ui-color-status-on-time-bg: rgba(34, 197, 94, 0.16);
  --fo-ui-color-status-on-time-fg: #4ade80;
  --fo-ui-color-status-delayed-bg: rgba(234, 179, 8, 0.16);
  --fo-ui-color-status-delayed-fg: #facc15;
  --fo-ui-color-status-in-transit-bg: rgba(59, 130, 246, 0.16);
  --fo-ui-color-status-in-transit-fg: #60a5fa;
  --fo-ui-color-status-delivered-bg: rgba(148, 163, 184, 0.16);
  --fo-ui-color-status-delivered-fg: #cbd5e1;
  --fo-ui-color-status-exception-bg: rgba(239, 68, 68, 0.16);
  --fo-ui-color-status-exception-fg: #f87171;

  --fo-ui-color-delta-up: #4ade80;
  --fo-ui-color-delta-down: #f87171;

  --fo-ui-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --fo-ui-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.fo-ui-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--fo-ui-radius-sm);
  font-family: var(--fo-ui-font-sans);
  font-weight: var(--fo-ui-font-weight-medium);
  line-height: 1;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}
.fo-ui-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fo-ui-btn--sm { padding: 4px 10px; font-size: var(--fo-ui-font-size-sm); }
.fo-ui-btn--md { padding: 6px 12px; font-size: var(--fo-ui-font-size-md); }
.fo-ui-btn--lg { padding: 8px 16px; font-size: var(--fo-ui-font-size-lg); }
.fo-ui-btn--primary {
  background: var(--fo-ui-color-primary);
  border-color: var(--fo-ui-color-primary);
  color: var(--fo-ui-color-on-primary);
}
.fo-ui-btn--primary:hover:not(:disabled) { background: var(--fo-ui-color-primary-hover); border-color: var(--fo-ui-color-primary-hover); }
.fo-ui-btn--secondary {
  background: var(--fo-ui-color-secondary-bg);
  border-color: var(--fo-ui-color-secondary-border);
  color: var(--fo-ui-color-text);
}
.fo-ui-btn--secondary:hover:not(:disabled) { background: var(--fo-ui-color-ghost-hover); }
.fo-ui-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--fo-ui-color-text);
}
.fo-ui-btn--ghost:hover:not(:disabled) { background: var(--fo-ui-color-ghost-hover); }

.fo-ui-panel {
  background: var(--fo-ui-color-surface);
  color: var(--fo-ui-color-text);
  border: 1px solid var(--fo-ui-color-border);
  border-radius: var(--fo-ui-radius-md);
  box-shadow: var(--fo-ui-shadow-sm);
  overflow: hidden;
}
.fo-ui-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--fo-ui-space-3);
  padding: var(--fo-ui-space-3) var(--fo-ui-space-4);
  border-bottom: 1px solid var(--fo-ui-color-border);
}
.fo-ui-panel-title { margin: 0; font-size: var(--fo-ui-font-size-lg); font-weight: var(--fo-ui-font-weight-semibold); }
.fo-ui-panel-actions { display: flex; align-items: center; gap: var(--fo-ui-space-2); }
.fo-ui-panel-body { padding: var(--fo-ui-space-4); }

.fo-ui-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--fo-ui-space-2);
}

.fo-ui-stat-tile {
  display: flex;
  flex-direction: column;
  gap: var(--fo-ui-space-1);
  padding: var(--fo-ui-space-3) var(--fo-ui-space-4);
  background: var(--fo-ui-color-surface);
  color: var(--fo-ui-color-text);
  border: 1px solid var(--fo-ui-color-border);
  border-radius: var(--fo-ui-radius-md);
  min-width: 140px;
}
.fo-ui-stat-tile-label {
  font-size: var(--fo-ui-font-size-sm);
  color: var(--fo-ui-color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.fo-ui-stat-tile-value { font-size: 24px; font-weight: var(--fo-ui-font-weight-semibold); }
.fo-ui-stat-tile-delta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  font-size: var(--fo-ui-font-size-sm);
  font-weight: var(--fo-ui-font-weight-medium);
  color: var(--fo-ui-color-text-muted);
}
.fo-ui-stat-tile-delta--up { color: var(--fo-ui-color-delta-up); }
.fo-ui-stat-tile-delta--down { color: var(--fo-ui-color-delta-down); }

.fo-ui-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--fo-ui-font-size-sm);
  font-weight: var(--fo-ui-font-weight-medium);
  line-height: 1.4;
  white-space: nowrap;
}
.fo-ui-badge--on-time { background: var(--fo-ui-color-status-on-time-bg); color: var(--fo-ui-color-status-on-time-fg); }
.fo-ui-badge--delayed { background: var(--fo-ui-color-status-delayed-bg); color: var(--fo-ui-color-status-delayed-fg); }
.fo-ui-badge--in-transit { background: var(--fo-ui-color-status-in-transit-bg); color: var(--fo-ui-color-status-in-transit-fg); }
.fo-ui-badge--delivered { background: var(--fo-ui-color-status-delivered-bg); color: var(--fo-ui-color-status-delivered-fg); }
.fo-ui-badge--exception { background: var(--fo-ui-color-status-exception-bg); color: var(--fo-ui-color-status-exception-fg); }

.fo-ui-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--fo-ui-font-sans);
  font-size: var(--fo-ui-font-size-md);
  color: var(--fo-ui-color-text);
}
.fo-ui-table th {
  text-align: left;
  font-size: var(--fo-ui-font-size-sm);
  font-weight: var(--fo-ui-font-weight-semibold);
  color: var(--fo-ui-color-text-muted);
  padding: var(--fo-ui-space-2) var(--fo-ui-space-3);
  border-bottom: 1px solid var(--fo-ui-color-border);
  background: var(--fo-ui-color-bg);
}
.fo-ui-table td {
  padding: var(--fo-ui-space-2) var(--fo-ui-space-3);
  border-bottom: 1px solid var(--fo-ui-color-border);
}
.fo-ui-table tbody tr:hover { background: var(--fo-ui-color-ghost-hover); }
.fo-ui-table-empty { text-align: center; color: var(--fo-ui-color-text-muted); padding: var(--fo-ui-space-6); }
.fo-ui-table-cell--right { text-align: right; }
.fo-ui-table-cell--center { text-align: center; }
`;

let injected = false;

/** Injects the kit's tokens and component CSS as a <style> tag. Idempotent. */
export function injectStyles(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement("style");
  style.dataset.fynapp = "fynops-ui-kit";
  style.textContent = CSS;
  document.head.appendChild(style);
}
