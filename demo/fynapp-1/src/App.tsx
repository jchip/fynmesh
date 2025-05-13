// @ts-nocheck

import React, { useState, useEffect } from 'react';

interface AppProps {
    appName: string;
}

const App: React.FC<AppProps> = ({ appName }) => {
    const [count, setCount] = useState(0);
    const [showEffect, setShowEffect] = useState(false);
    const [clickCount, setClickCount] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCount(prevCount => prevCount + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const handleButtonClick = () => {
        setShowEffect(true);
        setClickCount(prev => prev + 1);
        setTimeout(() => setShowEffect(false), 1000);
    };

    return (
        <div className="fynapp-container" style={{ position: 'relative', overflow: 'hidden' }}>
            <h2>{appName}FynApp fynapp-1 Using React {React.version}</h2>
            <p>This component has been running for {count} seconds.</p>

            {showEffect && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    pointerEvents: 'none',
                    zIndex: 10
                }}>
                    <div style={{
                        position: 'absolute',
                        width: '150%',
                        height: '150%',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0) 70%)',
                        animation: 'pulse 1s ease-out'
                    }} />
                    <div style={{
                        fontSize: '2rem',
                        fontWeight: 'bold',
                        color: '#6366f1',
                        textShadow: '0 0 8px rgba(99, 102, 241, 0.6)',
                        animation: 'bounce 0.5s ease-out'
                    }}>
                        +1 Click!
                    </div>
                </div>
            )}

            <button
                onClick={handleButtonClick}
                style={{
                    padding: '8px 16px',
                    backgroundColor: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    position: 'relative',
                    zIndex: 5
                }}
            >
                Click Me ({clickCount})
            </button>

            <style jsx>{`
                @keyframes pulse {
                    0% { transform: scale(0); opacity: 1; }
                    100% { transform: scale(1); opacity: 0; }
                }

                @keyframes bounce {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default App;