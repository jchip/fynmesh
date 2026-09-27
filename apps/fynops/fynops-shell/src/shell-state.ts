import type { FynMeshKernel } from "@fynmesh/kernel";
import type { FynOpsSession, FynOpsShellApi, FynOpsView, Selection } from "./api";

/**
 * State shared by the shell's two exposes: the `fynops-shell` middleware (which
 * hands every FynApp its API) and `./main` (which renders the layout). Both
 * import this module, so the federation container loads it once and they see
 * the same instance.
 */

const SESSION_KEY = "fynops.session";
const SELECTION_KEY = "fynops-selection";
const VIEW_WAIT_MS = 10_000;

const kernel = (): FynMeshKernel => (globalThis as any).fynMeshKernel;

function readSession(): FynOpsSession | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

let session = readSession();
const views = new Map<string, FynOpsView>();
const viewWaiters = new Map<string, Array<(view: FynOpsView) => void>>();
const appLoads = new Map<string, Promise<FynOpsView>>();
const drawerListeners = new Set<(req: DrawerRequest | undefined) => void>();
const sessionListeners = new Set<(s: FynOpsSession | undefined) => void>();

export interface DrawerRequest {
  app: string;
  params: Record<string, string>;
}

export function getSession(): FynOpsSession | undefined {
  return session;
}

export function signIn(next: FynOpsSession): void {
  session = next;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the session lasts for this page only.
  }
}

/**
 * Sign-out stays on the page. The shell unmounts every view before the login
 * shows, so no mounted feature sees the session change under it. Loaded FynApps
 * and their views stay in memory, so signing back in fetches nothing.
 */
export function signOut(): void {
  session = undefined;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
  closeDrawer();
  selectionState().set({});
  for (const fn of sessionListeners) fn(undefined);
}

export function onSession(fn: (s: FynOpsSession | undefined) => void): () => void {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}

/** The selection lives in the kernel's global middleware registry, so any FynApp can look it up. */
function selectionState() {
  return kernel().getMiddlewareRegistry("global").provide<Selection>(SELECTION_KEY, {});
}

function registerView(app: string, view: FynOpsView): void {
  views.set(app, view);
  for (const resolve of viewWaiters.get(app) ?? []) resolve(view);
  viewWaiters.delete(app);
}

function waitForView(app: string): Promise<FynOpsView> {
  const view = views.get(app);
  if (view) return Promise.resolve(view);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const state = kernel().getFynAppState(app);
      reject(
        new Error(
          !state
            ? `${app} could not be loaded.`
            : state.status === "failed"
              ? `${app} failed to start: ${(state.error as Error)?.message ?? state.error}`
              : `${app} loaded (${state.status}) but registered no view.`
        )
      );
    }, VIEW_WAIT_MS);
    const list = viewWaiters.get(app) ?? [];
    list.push((v) => {
      clearTimeout(timer);
      resolve(v);
    });
    viewWaiters.set(app, list);
  });
}

/**
 * Load a feature by name and resolve with the view it registers. The kernel
 * walks the app's manifest and loads its providers first. The promise is kept,
 * so a second visit (or the drawer) reuses the same load.
 */
export function loadView(app: string): Promise<FynOpsView> {
  let load = appLoads.get(app);
  if (!load) {
    load = (async () => {
      await kernel().loadFynAppsByName([{ name: app }]);
      if (!views.has(app) && !kernel().getFynAppState(app)) {
        throw new Error(`${app} could not be loaded. Check that it is built and registered.`);
      }
      return waitForView(app);
    })();
    // A failed load may succeed later (after a rebuild), so it is not cached.
    load.catch(() => appLoads.delete(app));
    appLoads.set(app, load);
  }
  return load;
}

export function openDrawer(app: string, params: Record<string, string> = {}): void {
  for (const fn of drawerListeners) fn({ app, params });
}

export function closeDrawer(): void {
  for (const fn of drawerListeners) fn(undefined);
}

export function onDrawer(fn: (req: DrawerRequest | undefined) => void): () => void {
  drawerListeners.add(fn);
  return () => drawerListeners.delete(fn);
}

/** The API one FynApp gets. `registerView` is bound to that app's name. */
export function createShellApi(app: string): FynOpsShellApi {
  return {
    get session() {
      if (!session) throw new Error("fynops-shell: no session, features mount only after sign-in");
      return session;
    },
    registerView: (view) => registerView(app, view),
    navigate: (path) => {
      location.hash = path.replace(/^#?/, "#");
    },
    openDrawer: (target, params) => openDrawer(target, params),
    selection: {
      get: () => selectionState().get(),
      set: (next) => selectionState().set(next),
      subscribe: (fn) => selectionState().subscribe((value) => fn(value)),
    },
  };
}
