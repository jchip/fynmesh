import React, { useState, useEffect } from "react";
import type { ComponentLibrary } from "./components";
import { THEME_OPTIONS } from "../../shared-demo-utils/middleware-helpers.ts";
import { useSharedCounter, useDesignTokens } from "../../shared-demo-utils/react-hooks.ts";
import "./app-layout.css";

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
  } = useDesignTokens(useState, useEffect, runtime, "fynmesh-dark");

  // Destructure the components
  const { Button, Card, Input, Badge, Spinner } = components;

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
    <div className="app-container">
      <h1 className="app-title">
        {appName}: React {React.version}
      </h1>

      {/* Theme Selection */}
      <Card
        title="🎨 Design Tokens Theme Selection"
        className="card-spacious section"
      >
        <div className="space-y-1 mb-3">
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
      <Card
        title="🎨 fynapp-x1 Components Demo"
        className="card-spacious section"
      >
        {/* Buttons Section */}
        <div className="component-group">
          <h3 className="section-title">Buttons</h3>
          <div className="flex-wrap gap-3">
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
        <div className="component-group">
          <h3 className="section-title">Badges</h3>
          <div className="flex-wrap gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="primary">Primary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
          </div>
        </div>

        {/* Spinners Section */}
        <div className="component-group">
          <h3 className="section-title">Spinners</h3>
          <div className="items-center flex-wrap gap-4">
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
        <div className="component-group">
          <h3 className="section-title">Input</h3>
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
      <Card className="card-spacious">
        <h2 className="card-title">
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
