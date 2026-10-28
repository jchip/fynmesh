import React, { useReducer } from "react";
import { createRoot } from "react-dom/client";
import { Button, Card, UI_KIT_VERSION } from "ui-kit";

function reducer(items, action) {
  if (action === "add") return [...items, `Item ${items.length + 1}`];
  if (action === "clear") return [];
  return items;
}

function Widget() {
  const [items, dispatch] = useReducer(reducer, []);
  return (
    <Card title="Team C widget">
      <ul id="list-c">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <Button onClick={() => dispatch("add")}>Add item</Button>
      <Button onClick={() => dispatch("clear")}>Clear</Button>
      <p>{`React ${React.version} · ui-kit ${UI_KIT_VERSION}`}</p>
    </Card>
  );
}

export function mount(el) {
  const root = createRoot(el);
  root.render(<Widget />);
  return root;
}
