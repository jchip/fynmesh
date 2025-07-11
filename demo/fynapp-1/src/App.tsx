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
          `🔄 fynapp-1: Received counter update from ${source}:`,
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

  // Destructure the components
  const { Button, Card, Input, Badge, Spinner } = components;

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

  // Demo state
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  const handleInputSubmit = () => {
    if (!inputValue.trim()) {
      setInputError("Please enter some text");
      return;
    }
    setInputError("");
    alert(`You entered: ${inputValue}`);
    setInputValue("");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>
        {appName}: React {React.version}
      </h2>

      {/* Demo UI Sections */}
      <Card title="🎨 fynapp-x1 Components Demo" className="mb-6">
        {/* Buttons Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Buttons</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button variant="primary" size="small">
              Primary Small
            </Button>
            <Button variant="secondary" size="medium">
              Secondary Medium
            </Button>
            <Button variant="outline" size="large">
              Outline Large
            </Button>
            <Button variant="danger" size="medium">
              Danger
            </Button>
            <Button variant="primary" size="medium" isLoading>
              Loading...
            </Button>
          </div>
        </div>

        {/* Badges Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Badges</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
          </div>
        </div>

        {/* Spinners Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Spinners</h3>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-2">
              <Spinner size="small" color="primary" />
              <span>Small</span>
            </div>
            <div className="flex items-center gap-2">
              <Spinner size="medium" color="gray" />
              <span>Medium</span>
            </div>
            <div className="flex items-center gap-2">
              <Spinner size="large" color="primary" />
              <span>Large</span>
            </div>
          </div>
        </div>

        {/* Input Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Input</h3>
          <div className="max-w-md">
            <Input
              label="Demo Input"
              placeholder="Type something..."
              value={inputValue}
              onChange={(e: any) => setInputValue(e.target.value)}
              error={inputError}
              helperText="This is a helper text"
            />
            <Button onClick={handleInputSubmit} variant="primary" size="medium">
              Submit Input
            </Button>
          </div>
        </div>
      </Card>

      {/* Counter Display and Controls - Moved to bottom */}
      <Card className="mb-6">
        <h2 className="text-xl font-bold mb-4 text-center">
          Shared Counter (Provider)
        </h2>
        <div className="flex items-center justify-center gap-4">
          <div className="text-3xl font-bold text-blue-600 min-w-16 text-center">
            {counter.count}
          </div>
          <Button onClick={handleIncrement} variant="primary" size="medium">
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
