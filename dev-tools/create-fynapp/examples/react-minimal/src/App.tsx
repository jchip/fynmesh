import React, { useState } from "react";

interface AppProps {
  appName: string;
}

const App: React.FC<AppProps> = ({ appName }) => {
  const [count, setCount] = useState(0);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 20 }}>
      <h1>{appName}</h1>
      <p>A minimal standalone React FynApp.</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </button>
    </div>
  );
};

export default App;
