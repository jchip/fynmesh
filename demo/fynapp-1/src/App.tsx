// @ts-nocheck

import React, { useState } from 'react';
import type { ComponentLibrary } from './components';

interface AppProps {
    appName: string;
    components: ComponentLibrary;
}

const App: React.FC<AppProps> = ({ appName, components }) => {
    const [showEffect, setShowEffect] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [count, setCount] = useState(0);

    // Destructure the components
    const { Button, Card, Input, Modal, Alert, Badge, Spinner } = components;

    const handleButtonClick = () => {
        setShowEffect(true);
        setClickCount(prev => prev + 1);
        setCount(count + 1); // Update the counter immediately for simplicity
        setTimeout(() => setShowEffect(false), 1000);
    };

    return (
        <div className="fynapp-container" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h2>{appName}: Using Components from fynapp-x1</h2>

            <Alert variant="info" className="mb-4">
                Component counter: {count}
            </Alert>

            <Card
                title="Example Card from fynapp-x1"
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <Button variant="outline" onClick={() => setShowModal(true)}>
                            Open Modal
                        </Button>
                        <Button variant="primary" onClick={handleButtonClick}>
                            Click Me ({clickCount})
                        </Button>
                    </div>
                }
            >
                <p>This is a card component from fynapp-x1!</p>
                <p>Try out different components below:</p>

                <div style={{ marginBottom: '20px' }}>
                    <h4>Badges:</h4>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <Badge variant="default">Default</Badge>
                        <Badge variant="primary">Primary</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="danger">Danger</Badge>
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <h4>Spinner examples:</h4>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '10px' }}>
                        <Spinner size="small" color="primary" />
                        <Spinner size="medium" color="gray" />
                        <Spinner size="large" color="primary" />
                    </div>
                </div>
            </Card>

            {showEffect && (
                <div style={{
                    position: 'fixed',
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

            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    title="Example Modal"
                    footer={
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={() => setShowModal(false)}>
                                Confirm
                            </Button>
                        </div>
                    }
                >
                    <p>This is a modal component from fynapp-x1!</p>
                    <Input
                        label="Example Input"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Type something..."
                        helperText="This is a helper text"
                    />
                </Modal>
            )}

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