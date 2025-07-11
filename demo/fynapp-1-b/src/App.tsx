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

  // Demo state
  const [modalOpen, setModalOpen] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h2>
        {appName}: React {React.version}
      </h2>

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
