import React, { useState, useEffect } from "esm-react";
import type { ComponentLibrary } from "./components";
import type { FynModuleRuntime } from "@fynmesh/kernel";
import { useSharedCounter } from "../../shared-demo-utils/react-hooks.ts";
import {
  useFynBusChat,
  useFynBusRequest,
  DEMO_CHAT_TOPIC,
  GET_STATUS_TOPIC,
} from "../../shared-demo-utils/fynbus-hooks.ts";

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

  // Shared counter hook
  const { counter, handleIncrement, handleReset } = useSharedCounter(
    useState, useEffect, runtime, middlewareConfig
  );

  // FynBus hooks (pub/sub chat + request/response demo)
  const {
    messages: busMessages,
    sendMessage: sendBusMessage,
    busAvailable,
  } = useFynBusChat(useState, useEffect, runtime);
  const [busText, setBusText] = React.useState<string>("");
  const { requestState, response, sendRequest } = useFynBusRequest(
    useState, runtime
  );

  const handleBusSend = () => {
    if (sendBusMessage(busText)) {
      setBusText("");
    }
  };

  // Destructure the components
  const { Button, Card, Input, Modal, Alert, Badge, Spinner } = components;

  const handleButtonClick = () => {
    setShowEffect(true);
    setClickCount((prev: number) => prev + 1);
    setCount(count + 1); // Update the counter immediately for simplicity
    setTimeout(() => setShowEffect(false), 1000);
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

      {/* FynBus Demo (FYM-18) */}
      <Card title="🚌 FynBus" style={{ marginBottom: "16px" }}>
        <div style={{ padding: "15px" }}>
          {busAvailable ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <Input
                  label={`Send on "${DEMO_CHAT_TOPIC}"`}
                  placeholder="Message other fynapps..."
                  value={busText}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setBusText(e.target.value)
                  }
                />
                <Button variant="primary" onClick={handleBusSend}>
                  Send
                </Button>
              </div>
              <div style={{ fontSize: "14px", color: "#6c757d", marginBottom: "8px" }}>
                Received messages (own emits are filtered by the bus):
              </div>
              {busMessages.length === 0 ? (
                <div style={{ fontSize: "14px", color: "#6c757d", fontStyle: "italic" }}>
                  No messages yet — send one from another fynapp.
                </div>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {busMessages.map((message, index) => (
                    <li
                      key={index}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "4px 0",
                        fontSize: "14px",
                      }}
                    >
                      <Badge variant="primary">{message.source}</Badge>
                      <span>{message.text}</span>
                      <span style={{ fontSize: "12px", color: "#6c757d" }}>
                        {message.at}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid #dee2e6",
                }}
              >
                <Button
                  variant="outline"
                  onClick={sendRequest}
                  disabled={requestState === "pending"}
                >
                  Request status
                </Button>
                <span style={{ fontSize: "14px" }}>
                  {requestState === "idle" && (
                    <span style={{ color: "#6c757d" }}>
                      Calls <code>bus.request("{GET_STATUS_TOPIC}")</code> — answered by
                      fynapp-1
                    </span>
                  )}
                  {requestState === "pending" && (
                    <span style={{ color: "#6c757d" }}>Waiting for response…</span>
                  )}
                  {requestState === "done" && (
                    <code>{JSON.stringify(response)}</code>
                  )}
                  {requestState === "error" && (
                    <span style={{ color: "#dc3545" }}>Error: {String(response)}</span>
                  )}
                </span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: "14px", color: "#6c757d" }}>
              FynBus not available (runtime.bus is undefined).
            </div>
          )}
        </div>
      </Card>

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
