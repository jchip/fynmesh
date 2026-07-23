import React from "react";

interface AppProps {
  appName: string;
  theme: string;
}

const App: React.FC<AppProps> = ({ appName, theme }) => (
  <div style={{ fontFamily: "sans-serif", padding: 20 }}>
    <h1>{appName}</h1>
    <p>
      Consumes the <code>design-tokens</code> middleware.
    </p>
    <p>
      Active theme: <strong>{theme}</strong>
    </p>
  </div>
);

export default App;
