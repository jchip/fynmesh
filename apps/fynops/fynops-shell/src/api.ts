/**
 * The FynOps shell contract (notes/FYNOPS-PHASE1-PLAN.md, "Shell middleware and views").
 *
 * Features import these types only:
 *   import type { FynOpsShellApi } from "fynops-shell/api";
 * with `fynops-shell` as a devDependency and a tsconfig path
 *   "fynops-shell/api": ["./node_modules/fynops-shell/src/api.ts"]
 */

/** Key the shell API is stored under on every FynApp's `runtime.middlewareContext`. */
export const FYNOPS_SHELL_API = "fynops-shell";

export type FynOpsRole = "dispatcher" | "manager";

export interface FynOpsSession {
  user: string;
  role: FynOpsRole;
}

export interface Selection {
  shipmentId?: number;
  vehicleId?: number;
}

export interface FynOpsViewProps {
  target: "main" | "drawer";
  params: Record<string, string>;
}

export interface FynOpsView {
  /** Render into `el`. Returns the unmount function. May be called more than once (main and drawer). */
  mount(el: HTMLElement, props: FynOpsViewProps): () => void;
}

export interface FynOpsShellApi {
  /** The signed-in user. Features only mount after sign-in, and sign-out reloads the page. */
  readonly session: FynOpsSession;
  /** Call once from the feature's execute(). */
  registerView(view: FynOpsView): void;
  /** Navigate to a hash route, e.g. "#/map". */
  navigate(path: string): void;
  /** Load `app` by name and mount its view in the detail drawer. */
  openDrawer(app: string, params?: Record<string, string>): void;
  /** Current selection, shared by every FynApp on the page. */
  selection: {
    get(): Selection;
    set(next: Selection): void;
    subscribe(fn: (s: Selection) => void): () => void;
  };
}
