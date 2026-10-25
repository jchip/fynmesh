import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Button, Card, UI_KIT_VERSION } from "ui-kit";

function Widget() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Card title="Team B widget">
      <p>Seconds: {seconds}</p>
      <Button onClick={() => setSeconds(0)}>Reset</Button>
      <p>{`React ${React.version} · ui-kit ${UI_KIT_VERSION}`}</p>
    </Card>
  );
}

export function mount(el) {
  const root = ReactDOM.createRoot(el);
  root.render(<Widget />);
  return root;
}
