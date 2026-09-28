import React, { useEffect, useRef, useState } from "react";
import type { FynOpsRole, FynOpsViewProps } from "./api";
import { ROUTES, parseHash, type Location } from "./routes";
import {
  closeDrawer,
  getSession,
  loadView,
  getLoadProgress,
  onDrawer,
  onLoadProgress,
  onSession,
  signIn,
  signOut,
  type DrawerRequest,
  type LoadProgress,
} from "./shell-state";

const USERS: Array<{ user: string; role: FynOpsRole }> = [
  { user: "dana.dispatch", role: "dispatcher" },
  { user: "morgan.manager", role: "manager" },
];

/** Mounts one feature view into a div it owns, and unmounts it when the host goes away. */
const ViewHost: React.FC<{ app: string; props: FynOpsViewProps; hidden?: boolean }> = ({
  app,
  props,
  hidden,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<LoadProgress | undefined>(() => getLoadProgress(app));

  useEffect(
    () =>
      onLoadProgress((loadedApp, p) => {
        if (loadedApp === app) setProgress(p);
      }),
    [app]
  );

  useEffect(() => {
    let unmount: (() => void) | undefined;
    let cancelled = false;
    setError(undefined);
    setLoading(true);
    loadView(app)
      .then((view) => {
        if (!cancelled && ref.current) unmount = view.mount(ref.current, props);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unmount?.();
    };
    // Mounted once per host: the host is keyed by app (and drawer params) by its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, attempt]);

  return (
    <div className="fo-host" hidden={hidden} data-fynapp-host={app} data-target={props.target}>
      {loading && !error && (
        <div className="fo-loading" role="status" data-testid="fynops-view-loading">
          <span className="fo-spinner" aria-hidden="true" />
          <span>Loading {ROUTES.find((r) => r.app === app)?.title ?? app}</span>
          {progress && progress.total > 0 && (
            <span className="fo-loading-count">
              {progress.done} of {progress.total} FynApps
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="fo-panel fo-error" role="alert">
          <h2>{app} is not available</h2>
          <p>{error}</p>
          <button className="fo-btn" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      <div ref={ref} style={{ height: "100%" }} hidden={!!error} />
    </div>
  );
};

const Login: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const [index, setIndex] = useState(0);
  return (
    <div className="fo-login">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          signIn(USERS[index]);
          onSignIn();
        }}
      >
        <h1>FynOps sign in</h1>
        <div className="fo-demo-note" data-testid="fynops-demo-note">
          <p>
            <strong>FynOps is a demo app for FynMesh.</strong> It is a logistics console built from
            ten FynApps. Each route loads its own FynApp, and they share React, AG Grid and ECharts at
            runtime.
          </p>
          <p>
            The shipments, fleet and users are simulated in your browser. Pick any user. There is no
            password.
          </p>
          <p>
            <a href="./">About FynMesh</a> · <a href="https://github.com/jchip/fynmesh">GitHub</a>
          </p>
        </div>
        <label>
          User{" "}
          <select
            data-testid="fynops-login-user"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {USERS.map((u, i) => (
              <option key={u.user} value={i}>
                {u.user} ({u.role})
              </option>
            ))}
          </select>
        </label>
        <button className="fo-btn fo-primary" type="submit" data-testid="fynops-login-submit">
          Sign in
        </button>
      </form>
    </div>
  );
};

function useHashLocation(): Location {
  const [loc, setLoc] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setLoc(parseHash(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return loc;
}

const Shell: React.FC = () => {
  const session = getSession()!;
  const loc = useHashLocation();
  const route = ROUTES.find((r) => r.path === loc.path);
  // Every route visited so far stays mounted (hidden), so grids and maps keep their state.
  const [visited, setVisited] = useState<Map<string, Record<string, string>>>(new Map());
  const [drawer, setDrawer] = useState<DrawerRequest>();

  useEffect(() => onDrawer(setDrawer), []);

  useEffect(() => {
    if (route && !visited.has(route.app)) {
      setVisited((prev) => new Map(prev).set(route.app, loc.params));
    }
  }, [route, loc.params, visited]);

  return (
    <div className="fo-shell">
      <header className="fo-topbar">
        <span className="fo-brand">FynOps</span>
        <a className="fo-demo-tag" href="./" title="FynOps is a demo app for FynMesh">
          FynMesh demo
        </a>
        <span className="fo-spacer" />
        <span data-testid="fynops-user">{session.user}</span>
        <span className="fo-role" data-testid="fynops-role">
          {session.role}
        </span>
        <button className="fo-btn" onClick={signOut} data-testid="fynops-signout">
          Sign out
        </button>
      </header>
      <nav className="fo-nav">
        {ROUTES.map((r) => (
          <a key={r.path} href={`#${r.path}`} className={r === route ? "fo-active" : undefined}>
            {r.title}
          </a>
        ))}
      </nav>
      <main className="fo-main">
        {!route && (
          <div className="fo-panel fo-error" role="alert">
            <h2>No such page</h2>
            <p>Nothing is routed at {loc.path}.</p>
          </div>
        )}
        {[...visited].map(([app, params]) => (
          <ViewHost
            key={app}
            app={app}
            hidden={app !== route?.app}
            props={{ target: "main", params }}
          />
        ))}
      </main>
      {drawer && (
        <aside className="fo-drawer" data-testid="fynops-drawer">
          <div className="fo-drawer-head">
            <span>{drawer.app}</span>
            <button className="fo-btn" onClick={closeDrawer} aria-label="Close drawer">
              ✕
            </button>
          </div>
          <div className="fo-drawer-body">
            <ViewHost
              key={`${drawer.app}?${new URLSearchParams(drawer.params)}`}
              app={drawer.app}
              props={{ target: "drawer", params: drawer.params }}
            />
          </div>
        </aside>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [signedIn, setSignedIn] = useState(() => !!getSession());
  useEffect(() => onSession((s) => setSignedIn(!!s)), []);
  return signedIn ? <Shell /> : <Login onSignIn={() => setSignedIn(true)} />;
};

export default App;
