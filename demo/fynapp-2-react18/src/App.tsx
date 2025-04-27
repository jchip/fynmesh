// @ts-nocheck

import React, { useState, useEffect } from 'react';

interface AppProps {
    appName: string;
}

const App: React.FC<AppProps> = ({ appName }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCount(prevCount => prevCount + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className="fynapp-container">
            <h2>{appName}fynapp-2 Component Using React {React.version}</h2>
            <p>This component has been running for {count} seconds.</p>
            <button
                onClick={() => alert('Hello from FynApp-2-React18!')}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                }}
            >
                Click Me
            </button>
        </div>
    );
};

export default App;