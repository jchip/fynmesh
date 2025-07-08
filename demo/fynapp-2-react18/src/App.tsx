import React, { useState, useEffect } from "react";
import type { ComponentLibrary } from "./components";
import type { FynModuleRuntime } from "@fynmesh/kernel";

interface AppProps {
  appName: string;
  components: ComponentLibrary;
  middlewareConfig?: any;
  runtime?: FynModuleRuntime;
}

const App: React.FC<AppProps> = ({
  appName,
  components,
  middlewareConfig,
  runtime,
}: AppProps) => {
  const [showEffect, setShowEffect] = React.useState<boolean>(false);
  const [clickCount, setClickCount] = React.useState<number>(0);
  const [showModal, setShowModal] = React.useState<boolean>(false);
  const [inputValue, setInputValue] = React.useState<string>("");
  const [count, setCount] = React.useState<number>(0);

  // Basic counter state for middleware integration
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
          `🔄 fynapp-2-react18: Received counter update from ${source}:`,
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
  const { Button, Card, Input, Modal, Alert, Badge, Spinner } = components;

  const handleButtonClick = () => {
    setShowEffect(true);
    setClickCount((prev: number) => prev + 1);
    setCount(count + 1); // Update the counter immediately for simplicity
    setTimeout(() => setShowEffect(false), 1000);
  };

  // Basic counter handlers
  const handleIncrement = () => {
    const sharedData = getSharedDataObject();
    if (sharedData?.increment) {
      const newCount = sharedData.increment(runtime?.fynApp?.name);
      // Update local state for immediate UI response
      setCounter({ count: newCount });
      console.debug("✅ fynapp-2-react18: Counter incremented to:", newCount);
    }
  };

  const handleReset = () => {
    const sharedData = getSharedDataObject();
    if (sharedData?.reset) {
      const newCount = sharedData.reset(runtime?.fynApp?.name);
      // Update local state for immediate UI response
      setCounter({ count: newCount });
      console.debug("✅ fynapp-2-react18: Counter reset to:", newCount);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "768px", margin: "0 auto" }}>
      <h2>
        {appName}: React {React.version} using Components from fynapp-x1 v1
      </h2>

      {/* Basic Counter Section - NEW */}
      {runtime && middlewareConfig && (
        <Card
          title="🔗 Basic Counter (Middleware Consumer)"
          style={{ marginBottom: "16px" }}
        >
          <div style={{ padding: "15px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "15px",
              }}
            >
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: "bold",
                  color: "#007bff",
                  minWidth: "60px",
                  textAlign: "center",
                }}
              >
                {counter.count}
              </div>
              <Button variant="primary" onClick={handleIncrement}>
                Increment
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Alert variant="info" style={{ marginBottom: "16px" }}>
        Component counter: {count}
      </Alert>

      <Card
        title="Example Card from fynapp-x1 v1"
        footer={
          <div
            style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}
          >
            <Button variant="outline" onClick={() => setShowModal(true)}>
              Open Modal
            </Button>
            <Button variant="primary" onClick={handleButtonClick}>
              Click Me ({clickCount})
            </Button>
          </div>
        }
      >
        <p>This is a card component from fynapp-x1 version 1.0.0!</p>
        <p>Try out different components below:</p>

        <div style={{ marginBottom: "20px" }}>
          <h4>Badges:</h4>
          <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
            <Badge variant="default">Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <h4>Spinner examples:</h4>
          <div
            style={{
              display: "flex",
              gap: "20px",
              alignItems: "center",
              marginTop: "12px",
            }}
          >
            <Spinner size="small" color="primary" />
            <Spinner size="medium" color="gray" />
            <Spinner size="large" color="primary" />
          </div>
        </div>
      </Card>

      {showEffect && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "150%",
              height: "150%",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.1) 50%, transparent 100%)",
              animation: "pulse 1s ease-in-out",
            }}
          />
          <div
            style={{
              fontSize: "3rem",
              fontWeight: "bold",
              color: "#6366f1",
              textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
              animation: "bounce 1s ease-in-out",
            }}
          >
            +1 Click!
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.7; transform: scale(1.05); }
            }
            @keyframes bounce {
              0%, 20%, 53%, 80%, 100% { transform: translateY(0); }
              40%, 43% { transform: translateY(-15px); }
              70% { transform: translateY(-5px); }
              90% { transform: translateY(-3px); }
            }
          `}</style>
        </div>
      )}

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Example Modal (v1 components)"
          footer={
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                padding: "16px 20px",
              }}
            >
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setShowModal(false)}>
                Confirm
              </Button>
            </div>
          }
        >
          <div style={{ padding: "20px" }}>
            <p style={{ marginBottom: "16px" }}>
              This is a modal component from fynapp-x1 version 1.0.0!
            </p>
            <Input
              label="Example Input"
              value={inputValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setInputValue(e.target.value)
              }
              placeholder="Type something..."
              helperText="This is a helper text"
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

export default App;
