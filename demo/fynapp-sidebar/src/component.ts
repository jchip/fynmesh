import React from "react";
import ReactDOM from "react-dom/client";

// Types for shell API
interface AvailableApp {
  id: string;
  name: string;
  url: string;
  framework: string;
}

interface ShellLayoutApi {
  loadApp: (url: string) => void;
  getAvailableApps: () => AvailableApp[];
  getLoadedApps: () => string[];
}

// Component export for shell rendering
export const component = {
  type: 'react' as const,
  component: SidebarComponent,
  react: React,
  reactDOM: ReactDOM,
  metadata: {
    name: 'FynApp Sidebar',
    version: '1.0.0',
    description: 'Navigation sidebar for loading FynApps'
  }
};

// Sidebar React component
function SidebarComponent({ fynApp, runtime }: any): React.ReactElement {
  const [apps, setApps] = React.useState<AvailableApp[]>([]);
  const [loadedApps, setLoadedApps] = React.useState<string[]>([]);
  const [loadingApp, setLoadingApp] = React.useState<string | null>(null);
  const [shellApi, setShellApi] = React.useState<ShellLayoutApi | null>(null);

  // Get shell API on mount
  React.useEffect(() => {
    const api = runtime?.middlewareContext?.get("shell-layout") as ShellLayoutApi | undefined;
    if (api) {
      setShellApi(api);
      setApps(api.getAvailableApps());
      setLoadedApps(api.getLoadedApps());
      console.log("📱 Sidebar: Got shell API, available apps:", api.getAvailableApps().length);
    } else {
      console.warn("📱 Sidebar: Shell layout API not available");
    }
  }, [runtime]);

  const handleLoadApp = (app: AvailableApp) => {
    if (!shellApi) return;

    console.log(`📱 Sidebar: Loading ${app.name} via shell API`);
    setLoadingApp(app.id);

    // Fire and forget - shell handles the async
    shellApi.loadApp(app.url);

    // Update loaded apps after a short delay
    setTimeout(() => {
      setLoadedApps(shellApi.getLoadedApps());
      setLoadingApp(null);
    }, 500);
  };

  // Styles
  const styles = {
    container: {
      padding: '0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '14px',
    },
    header: {
      padding: '12px 16px',
      borderBottom: '1px solid #e5e7eb',
      background: '#f9fafb',
    },
    title: {
      margin: 0,
      fontSize: '14px',
      fontWeight: 600,
      color: '#374151',
    },
    subtitle: {
      margin: '4px 0 0 0',
      fontSize: '12px',
      color: '#6b7280',
    },
    list: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
    },
    listItem: {
      borderBottom: '1px solid #f3f4f6',
    },
    button: {
      width: '100%',
      padding: '12px 16px',
      border: 'none',
      background: 'transparent',
      textAlign: 'left' as const,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      transition: 'background 0.15s',
    },
    buttonHover: {
      background: '#f3f4f6',
    },
    buttonLoading: {
      background: '#eef2ff',
    },
    icon: {
      width: '32px',
      height: '32px',
      borderRadius: '6px',
      background: '#4f46e5',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      fontWeight: 600,
      flexShrink: 0,
    },
    appInfo: {
      flex: 1,
      minWidth: 0,
    },
    appName: {
      fontWeight: 500,
      color: '#111827',
      marginBottom: '2px',
    },
    appFramework: {
      fontSize: '12px',
      color: '#6b7280',
    },
    loadedBadge: {
      padding: '2px 8px',
      background: '#dcfce7',
      color: '#166534',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 500,
    },
    loadingSpinner: {
      width: '16px',
      height: '16px',
      border: '2px solid #e5e7eb',
      borderTop: '2px solid #4f46e5',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    },
    noApi: {
      padding: '20px',
      textAlign: 'center' as const,
      color: '#ef4444',
    }
  };

  if (!shellApi) {
    return React.createElement('div', { style: styles.noApi },
      React.createElement('p', null, 'Shell layout API not available'),
      React.createElement('p', { style: { fontSize: '12px', marginTop: '8px' } },
        'Ensure shell-layout middleware is applied'
      )
    );
  }

  return React.createElement('div', { style: styles.container }, [
    // Header
    React.createElement('div', { key: 'header', style: styles.header }, [
      React.createElement('h3', { key: 'title', style: styles.title }, 'Available FynApps'),
      React.createElement('p', { key: 'subtitle', style: styles.subtitle },
        `${apps.length} apps | ${loadedApps.length} loaded`
      )
    ]),

    // App list
    React.createElement('ul', { key: 'list', style: styles.list },
      apps.map(app => {
        const isLoaded = loadedApps.includes(app.id);
        const isLoading = loadingApp === app.id;

        return React.createElement('li', {
          key: app.id,
          style: styles.listItem
        },
          React.createElement('button', {
            style: {
              ...styles.button,
              ...(isLoading ? styles.buttonLoading : {}),
            },
            onClick: () => handleLoadApp(app),
            disabled: isLoading,
            onMouseEnter: (e: any) => {
              if (!isLoading) e.currentTarget.style.background = '#f3f4f6';
            },
            onMouseLeave: (e: any) => {
              if (!isLoading) e.currentTarget.style.background = 'transparent';
            }
          }, [
            // Icon
            React.createElement('div', {
              key: 'icon',
              style: {
                ...styles.icon,
                background: getFrameworkColor(app.framework),
              }
            }, getFrameworkIcon(app.framework)),

            // App info
            React.createElement('div', { key: 'info', style: styles.appInfo }, [
              React.createElement('div', { key: 'name', style: styles.appName }, app.name),
              React.createElement('div', { key: 'framework', style: styles.appFramework }, app.framework)
            ]),

            // Status
            isLoading
              ? React.createElement('div', { key: 'status', style: styles.loadingSpinner })
              : isLoaded
                ? React.createElement('span', { key: 'status', style: styles.loadedBadge }, 'Loaded')
                : null
          ])
        );
      })
    ),

    // CSS for spinner animation
    React.createElement('style', { key: 'styles' }, `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `)
  ]);
}

// Helper functions
function getFrameworkColor(framework: string): string {
  const colors: Record<string, string> = {
    'React 19': '#61dafb',
    'React 18': '#61dafb',
    'React': '#61dafb',
    'Vue': '#42b883',
    'Preact': '#673ab8',
    'Solid': '#2c4f7c',
    'Marko': '#ea5c00',
  };
  return colors[framework] || '#4f46e5';
}

function getFrameworkIcon(framework: string): string {
  const icons: Record<string, string> = {
    'React 19': 'R',
    'React 18': 'R',
    'React': 'R',
    'Vue': 'V',
    'Preact': 'P',
    'Solid': 'S',
    'Marko': 'M',
  };
  return icons[framework] || '?';
}
