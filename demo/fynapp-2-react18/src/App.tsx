import React from 'react';
import type { ComponentLibrary } from './components';

interface AppProps {
    appName: string;
    components: ComponentLibrary;
}

const App: React.FC<AppProps> = ({ appName, components }: AppProps) => {
    const [showEffect, setShowEffect] = React.useState<boolean>(false);
    const [clickCount, setClickCount] = React.useState<number>(0);
    const [showModal, setShowModal] = React.useState<boolean>(false);
    const [inputValue, setInputValue] = React.useState<string>('');
    const [count, setCount] = React.useState<number>(0);

    // Destructure the components
    const { Button, Card, Input, Modal, Alert, Badge, Spinner } = components;

    const handleButtonClick = () => {
        setShowEffect(true);
        setClickCount((prev: number) => prev + 1);
        setCount(count + 1); // Update the counter immediately for simplicity
        setTimeout(() => setShowEffect(false), 1000);
    };

    return (
        <div className="p-5 max-w-3xl mx-auto">
            <h2>{appName}: React {React.version} using Components from fynapp-x1 v1</h2>

            <Alert variant="info" className="mb-4">
                Component counter: {count}
            </Alert>

            <Card
                title="Example Card from fynapp-x1 v1"
                footer={
                    <div className="flex justify-end gap-3">
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

                <div className="mb-5">
                    <h4>Badges:</h4>
                    <div className="flex gap-3 mt-3">
                        <Badge variant="default">Default</Badge>
                        <Badge variant="primary">Primary</Badge>
                        <Badge variant="success">Success</Badge>
                        <Badge variant="warning">Warning</Badge>
                        <Badge variant="danger">Danger</Badge>
                    </div>
                </div>

                <div className="mt-5">
                    <h4>Spinner examples:</h4>
                    <div className="flex gap-5 items-center mt-3">
                        <Spinner size="small" color="primary" />
                        <Spinner size="medium" color="gray" />
                        <Spinner size="large" color="primary" />
                    </div>
                </div>
            </Card>

            {showEffect && (
                <div className="fixed inset-0 flex justify-center items-center pointer-events-none z-10">
                    <div className="absolute w-[150%] h-[150%] rounded-full bg-gradient-to-r from-indigo-500/20 to-transparent animate-pulse" />
                    <div className="text-4xl font-bold text-indigo-500 drop-shadow-lg animate-bounce">
                        +1 Click!
                    </div>
                </div>
            )}

            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={() => setShowModal(false)}
                    title="Example Modal (v1 components)"
                    footer={
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={() => setShowModal(false)}>
                                Confirm
                            </Button>
                        </div>
                    }
                >
                    <p>This is a modal component from fynapp-x1 version 1.0.0!</p>
                    <Input
                        label="Example Input"
                        value={inputValue}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
                        placeholder="Type something..."
                        helperText="This is a helper text"
                    />
                </Modal>
            )}
        </div>
    );
};

export default App;
