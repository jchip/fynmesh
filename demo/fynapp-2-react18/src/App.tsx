// @ts-nocheck

import React, { useState, useEffect } from 'react';

interface AppProps {
    appName: string;
}

const App: React.FC<AppProps> = ({ appName }) => {
    const [count, setCount] = useState(0);
    const [particles, setParticles] = useState([]);
    const [clickCount, setClickCount] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCount(prevCount => prevCount + 1);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const handleButtonClick = () => {
        // Create particles with variety
        const newParticles = Array.from({ length: 25 }, (_, i) => {
            // Determine if particle is a circle, square, or triangle
            const shapeType = Math.floor(Math.random() * 3);
            // Random color from purple palette
            const colors = ['#8b5cf6', '#7c3aed', '#6d28d9', '#a78bfa', '#c4b5fd'];
            const colorIndex = Math.floor(Math.random() * colors.length);

            return {
                id: Date.now() + i,
                x: Math.random() * 80 - 40, // Wider spread: Random x offset between -40 and 40
                y: -(Math.random() * 40 + 20), // Random y uplift between -20 and -60
                size: Math.random() * 24 + 12, // Larger: Random size between 12 and 36px
                opacity: Math.random() * 0.5 + 0.5, // Random opacity between 0.5 and 1
                rotation: Math.random() * 360, // Random rotation
                color: colors[colorIndex],
                shape: shapeType // 0: circle, 1: square, 2: triangle
            };
        });

        setParticles(prev => [...prev, ...newParticles]);
        setClickCount(prev => prev + 1);

        // Remove particles after animation
        setTimeout(() => {
            setParticles(prev => prev.filter(p => p.id !== newParticles[0].id));
        }, 3000); // Longer animation time
    };

    return (
        <div className="fynapp-container" style={{ position: 'relative', overflow: 'hidden' }}>
            <h2>{appName}FynApp fynapp-2 Using React {React.version}</h2>
            <p>This component has been running for {count} seconds.</p>

            <div style={{ position: 'relative', minHeight: '80px' }}>
                {particles.map(particle => {
                    // Determine shape style
                    let shapeStyle = {};
                    if (particle.shape === 0) {
                        // Circle
                        shapeStyle = {
                            borderRadius: '50%'
                        };
                    } else if (particle.shape === 1) {
                        // Square
                        shapeStyle = {
                            borderRadius: '4px',
                            transform: `rotate(${particle.rotation}deg)`
                        };
                    } else {
                        // Triangle - using a pseudo-element for the triangle
                        shapeStyle = {
                            width: '0',
                            height: '0',
                            backgroundColor: 'transparent',
                            borderLeft: `${particle.size / 2}px solid transparent`,
                            borderRight: `${particle.size / 2}px solid transparent`,
                            borderBottom: `${particle.size}px solid ${particle.color}`,
                            boxShadow: 'none'
                        };
                    }

                    return (
                        <div
                            key={particle.id}
                            style={{
                                position: 'absolute',
                                left: 'calc(50% + ' + particle.x + 'px)',
                                bottom: '0',
                                width: particle.shape !== 2 ? particle.size + 'px' : 'auto',
                                height: particle.shape !== 2 ? particle.size + 'px' : 'auto',
                                backgroundColor: particle.shape !== 2 ? particle.color : 'transparent',
                                opacity: particle.opacity,
                                animation: 'float 3s ease-out forwards',
                                boxShadow: particle.shape !== 2 ? `0 0 ${particle.size / 3}px ${particle.color}80` : 'none',
                                ...shapeStyle
                            }}
                        />
                    );
                })}

                <button
                    onClick={handleButtonClick}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#8b5cf6',
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
            </div>

            <style jsx>{`
                @keyframes float {
                    0% {
                        transform: translateY(0) scale(1);
                        opacity: 1;
                    }
                    20% {
                        opacity: 0.95;
                        transform: translateY(-${window ? window.innerHeight / 8 : 25}px) scale(1.1);
                    }
                    50% {
                        opacity: 0.8;
                        transform: translateY(-${window ? window.innerHeight / 4 : 50}px) scale(0.9);
                    }
                    75% {
                        opacity: 0.5;
                        transform: translateY(-${window ? window.innerHeight / 3 : 100}px) scale(0.7);
                    }
                    100% {
                        transform: translateY(-${window ? window.innerHeight / 2 : 200}px) scale(0.2);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default App;