import React, { useState, useEffect } from "react";
import type { ComponentLibrary } from "./components";
import { THEME_OPTIONS } from "../../shared-demo-utils/middleware-helpers.ts";
import { useSharedCounter, useDesignTokens } from "../../shared-demo-utils/react-hooks.ts";

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
  // Shared counter hook
  const { counter, handleIncrement, handleReset } = useSharedCounter(
    useState, useEffect, runtime, middlewareConfig
  );

  // Design tokens hook
  const {
    currentTheme,
    applyGlobally,
    acceptGlobally,
    handleThemeChange,
    handleApplyGloballyChange,
    handleAcceptGloballyChange,
  } = useDesignTokens(useState, useEffect, runtime, "fynmesh-green");

  // Destructure the components
  const { Button, Card, Modal, Alert, Badge, Spinner } = components;

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
          {THEME_OPTIONS.map((theme) => (
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
