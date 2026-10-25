import React, { useState } from "react";
import ReactDOM from "react-dom";
import { Button, Card, UI_KIT_VERSION } from "ui-kit";

function Widget() {
  const [count, setCount] = useState(0);
  return (
    <Card title="Team A widget">
      <p>Count: <span id="count-a">{count}</span></p>
      <Button onClick={() => setCount(count + 1)}>Increment</Button>
      <p>{`React ${React.version} · ui-kit ${UI_KIT_VERSION}`}</p>
    </Card>
  );
}

export function mount(el) {
  const root = ReactDOM.createRoot(el);
  root.render(<Widget />);
  return root;
}
