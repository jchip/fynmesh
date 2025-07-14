import React, { useState, useEffect } from "react";
import type { ComponentLibrary } from "./components";

interface AppProps {
  appName: string;
  components: ComponentLibrary;
  middlewareConfig?: { count: number }; // Config from basic counter middleware
  runtime?: any; // Runtime to access middleware context
}

const App: React.FC<AppProps> = ({
  appName,
  components,
  middlewareConfig,
  runtime,
}: AppProps) => {
  // Use local state for reactivity, but sync with middleware context
  const [counter, setCounter] = useState({
    count: middlewareConfig?.count || 0,
  });

  // Theme state management
  const [currentTheme, setCurrentTheme] = useState("fynmesh-green");
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [applyGlobally, setApplyGlobally] = useState(false);
  const [acceptGlobally, setAcceptGlobally] = useState(false);

  // Available themes
  const themeOptions = [
    { value: "fynmesh-default", label: "Default" },
    { value: "fynmesh-dark", label: "Dark" },
    { value: "fynmesh-blue", label: "Blue" },
    { value: "fynmesh-green", label: "Green" },
    { value: "fynmesh-purple", label: "Purple" },
    { value: "fynmesh-sunset", label: "Sunset" },
    { value: "fynmesh-cyberpunk", label: "Cyberpunk" },
  ];

  // Function to get the shared data object from middleware context
  const getSharedDataObject = () => {
    if (runtime?.middlewareContext) {
      const basicCounterData = runtime.middlewareContext.get("basic-counter");
      return basicCounterData; // Return the actual object, not a copy
    }
    return null;
  };

  // Function to read current count from the shared data object
  const readCountFromSharedData = () => {
    const sharedData = getSharedDataObject();
    return sharedData?.config?.count || middlewareConfig?.count || 0;
  };

  // Set up event listener for counter changes from other apps
  useEffect(() => {
    const syncWithSharedData = () => {
      const sharedCount = readCountFromSharedData();
      setCounter({ count: sharedCount });
    };

    // Initial sync
    syncWithSharedData();

    // Set up event listener for changes from other apps
    const handleCounterChange = (event: CustomEvent) => {
      const { count, source } = event.detail;
      if (source !== runtime?.fynApp?.name) {
        // Only update if the change came from a different app
        setCounter({ count });
        console.debug(
          `🔄 fynapp-1-b: Received counter update from ${source}:`,
          count
        );
      }
    };

    const sharedData = getSharedDataObject();
    if (sharedData?.eventTarget) {
      sharedData.eventTarget.addEventListener(
        "counterChanged",
        handleCounterChange
      );

      return () => {
        sharedData.eventTarget.removeEventListener(
          "counterChanged",
          handleCounterChange
        );
      };
    }
  }, [runtime, middlewareConfig]);

  // Set up design tokens and theme management
  useEffect(() => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      const api = designTokensData.api;

      // Initialize current theme
      const currentTheme = api.getTheme();
      setCurrentTheme(currentTheme);

      // Initialize accept globally from API (this is shared state)
      const globalOptIn = api.getGlobalOptIn();
      setAcceptGlobally(globalOptIn);

      // Initialize apply globally from localStorage (this is local state)
      const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
      const savedApplyGlobally = localStorage.getItem(applyGloballyKey);
      setApplyGlobally(savedApplyGlobally === 'true');

      // Subscribe to theme changes
      const unsubscribe = api.subscribeToThemeChanges((theme: string, tokens: any, fynAppName?: string) => {
        // Only update if:
        // 1. The change is specifically for this app, OR
        // 2. The change is global AND this app accepts global changes
        if (fynAppName === runtime?.fynApp?.name || (!fynAppName && api.getGlobalOptIn())) {
          setCurrentTheme(theme);
          console.debug(`🎨 fynapp-1-b: Theme changed to ${theme}${fynAppName ? ` for ${fynAppName}` : ' globally'}`);
        }
      });

      return unsubscribe;
    }
  }, [runtime]);

  // Destructure the components
  const { Button, Card, Modal, Alert, Badge, Spinner } = components;

  const handleIncrement = () => {
    const sharedData = getSharedDataObject();
    if (sharedData?.increment) {
      const newCount = sharedData.increment(runtime?.fynApp?.name);
      // Update local state for immediate UI response
      setCounter({ count: newCount });
    }
  };

  const handleReset = () => {
    const sharedData = getSharedDataObject();
    if (sharedData?.reset) {
      const newCount = sharedData.reset(runtime?.fynApp?.name);
      // Update local state for immediate UI response
      setCounter({ count: newCount });
    }
  };

  // Theme switching function
  const handleThemeChange = (theme: string) => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      const api = designTokensData.api;

      if (applyGlobally) {
        // Apply globally
        api.setTheme(theme, true);
        console.debug(`🎨 fynapp-1-b: Switching to theme ${theme} globally`);

        // If we're applying globally but not accepting globally (G/L scenario),
        // we need to apply the theme to ourselves locally as well
        if (!acceptGlobally) {
          api.setTheme(theme, false);
          console.debug(`🎨 fynapp-1-b: Also applying theme ${theme} locally (G/L scenario)`);
        }
      } else {
        // Apply locally only
        api.setTheme(theme, false);
        console.debug(`🎨 fynapp-1-b: Switching to theme ${theme} locally`);
      }
    }
  };

  // Handle apply globally toggle
  const handleApplyGloballyChange = (apply: boolean) => {
    setApplyGlobally(apply);
    // Persist to localStorage (this is local state per app)
    const applyGloballyKey = `fynapp-${runtime?.fynApp?.name}-apply-globally`;
    localStorage.setItem(applyGloballyKey, apply.toString());
    console.debug(`🎨 fynapp-1-b: ${apply ? 'Enabled' : 'Disabled'} apply globally`);
  };

  // Handle accept globally toggle
  const handleAcceptGloballyChange = (accept: boolean) => {
    const designTokensData = runtime?.middlewareContext?.get("design-tokens");
    if (designTokensData?.api) {
      designTokensData.api.setGlobalOptIn(accept);
      setAcceptGlobally(accept);
      console.debug(`🎨 fynapp-1-b: ${accept ? 'Enabled' : 'Disabled'} accept global changes`);
    }
  };

  // Demo state
  const [modalOpen, setModalOpen] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>
        {appName}: React {React.version}
      </h2>

      {/* Theme Selection */}
      <Card title="🎨 Design Tokens Theme Selection" className="mb-6">
        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={applyGlobally}
              onChange={(e) => handleApplyGloballyChange(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Apply globally (affects all fynapp instances)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={acceptGlobally}
              onChange={(e) => handleAcceptGloballyChange(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Accept changes globally (from other apps)</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {themeOptions.map((theme) => (
            <Button
              key={theme.value}
              variant={currentTheme === theme.value ? "primary" : "outline"}
              size="small"
              onClick={() => handleThemeChange(theme.value)}
            >
              {theme.label}
            </Button>
          ))}
        </div>
        <div className="text-sm text-gray-600">
          Current theme: <strong>{currentTheme}</strong>
          <br />
          Apply scope: <strong>{applyGlobally ? "Global" : "Local"}</strong>
          <br />
          Accept scope: <strong>{acceptGlobally ? "Global" : "Local"}</strong>
        </div>
      </Card>

      {/* Demo UI Sections */}
      <Card title="🎨 fynapp-x1 Components Demo" className="mb-6">
        {/* Alert Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Alerts</h3>
          {alertVisible && (
            <Alert
              variant="success"
              dismissible
              onDismiss={() => setAlertVisible(false)}
              className="mb-3"
            >
              This is a dismissible success alert! 🎉
            </Alert>
          )}
          <Alert variant="info" className="mb-3">
            This is an info alert with some information.
          </Alert>
          <Alert variant="warning" className="mb-3">
            This is a warning alert. Please pay attention!
          </Alert>
          <Alert variant="error" className="mb-3">
            This is an error alert. Something went wrong!
          </Alert>
          <Alert variant="success">
            🚀 Another success alert!
          </Alert>
        </div>

        {/* Modal Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Modal</h3>
          <Button onClick={() => setModalOpen(true)} variant="outline">
            Open Modal Demo
          </Button>
        </div>
      </Card>

      {/* Modal Component */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="🚀 Demo Modal"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setModalOpen(false)}
              variant="outline"
              size="medium"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                alert("Action confirmed!");
                setModalOpen(false);
              }}
              variant="primary"
              size="medium"
            >
              Confirm
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p>
            This is a modal dialog showcasing the fynapp-x1 Modal component with
            Tailwind styling.
          </p>
          <p>It includes:</p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Proper backdrop overlay</li>
            <li>Centered positioning</li>
            <li>Tailwind CSS styling</li>
            <li>Custom footer with action buttons</li>
          </ul>

          <div className="flex items-center gap-2 mt-4">
            <Spinner size="small" color="primary" />
            <span>Even spinners work inside modals!</span>
          </div>

          <div className="flex gap-2 mt-4">
            <Badge variant="success">Modal</Badge>
            <Badge variant="primary">Demo</Badge>
            <Badge variant="warning">fynapp-x1</Badge>
          </div>
        </div>
      </Modal>

      {/* Counter Display and Controls - Moved to bottom */}
      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-4 text-center">
          Shared Counter (Consumer)
        </h2>
        <div className="flex items-center justify-center gap-4">
          <div className="text-3xl font-bold text-green-600 min-w-16 text-center">
            {counter.count}
          </div>
          <Button onClick={handleIncrement} variant="secondary" size="medium">
            Increment
          </Button>
          <Button onClick={handleReset} variant="danger" size="medium">
            Reset
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default App;
