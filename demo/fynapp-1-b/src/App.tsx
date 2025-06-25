import React from 'react';
import type { ComponentLibrary } from './components';

interface AppProps {
    appName: string;
    components: ComponentLibrary;
    middleware?: any;
}

const App: React.FC<AppProps> = ({ appName, components, middleware }: AppProps) => {
    // Access middleware contexts
    const contextMiddleware = middleware?.['react-context'];
    
    // Get the context instance from middleware
    const counterContext = React.useMemo(() => {
        try {
                    console.log('🔍 fynapp-1-b: Attempting to access contexts...');
        console.log('🔍 fynapp-1-b: Available contexts:', contextMiddleware?.getAvailableContexts?.());
        console.log('🔍 fynapp-1-b: Has counter context:', contextMiddleware?.hasContext?.('counter'));
        
        const context = contextMiddleware?.useContext ? contextMiddleware.useContext('counter') : null;
        console.log('🔍 fynapp-1-b: counterContext:', context);
            return context;
        } catch (error) {
            console.warn('Context not available:', error);
            return null;
        }
    }, [contextMiddleware]);

    // Create React state that syncs with middleware state
    const [counter, setCounter] = React.useState(counterContext?.state || { count: 0 });

    // Subscribe to middleware state changes using React 19 hooks
    React.useEffect(() => {
        if (!counterContext?.subscribe) return;

        console.log('🔍 fynapp-1-b: Setting up state subscription...');
        const unsubscribe = counterContext.subscribe((newState: any) => {
            console.log('🔍 fynapp-1-b: State changed, updating React state:', newState);
            setCounter({ ...newState });
        });

        // Sync initial state
        setCounter({ ...counterContext.state });

        return unsubscribe;
    }, [counterContext]);

    // Extract actions
    const counterActions = counterContext?.actions || {};

    // Destructure the components
    const { Button, Card } = components;

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h2>{appName}: React {React.version}</h2>

            {/* Middleware Status */}
            <Card style={{ marginBottom: '20px', padding: '15px' }}>
                <h3>🔗 Cross-App Counter Demo</h3>
                <p><strong>Middleware Status:</strong> {contextMiddleware ? '✅ Active' : '❌ Not Available'}</p>
                <p><strong>Available Contexts:</strong> {contextMiddleware?.getAvailableContexts?.()?.join(', ') || 'None'}</p>
            </Card>

            {/* Counter Display and Controls */}
            <Card style={{ padding: '20px', textAlign: 'center', marginBottom: '20px' }}>
                <h2>Shared Counter</h2>
                <div style={{ fontSize: '48px', fontWeight: 'bold', margin: '20px 0', color: '#007bff' }}>
                    {counter.count}
                </div>
                <p style={{ marginBottom: '20px', color: '#666' }}>
                    This counter is shared between fynapp-1 and fynapp-1-b.<br/>
                    Click increment in either app to see it update everywhere!
                </p>
                
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <Button 
                        onClick={() => {
                            console.log('🔍 fynapp-1-b: Incrementing counter...');
                            if (counterActions.increment) {
                                counterActions.increment();
                                console.log('✅ fynapp-1-b: Counter incremented');
                            } else {
                                console.error('❌ fynapp-1-b: increment action not available');
                            }
                        }}
                        style={{ 
                            backgroundColor: '#007bff', 
                            color: 'white', 
                            padding: '10px 20px',
                            fontSize: '16px'
                        }}
                                            >
                            Increment from fynapp-1-b
                        </Button>
                    
                    <Button 
                        onClick={() => {
                            console.log('🔍 fynapp-1-b: Resetting counter...');
                            if (counterActions.reset) {
                                counterActions.reset();
                                console.log('✅ fynapp-1-b: Counter reset');
                            } else {
                                console.error('❌ fynapp-1-b: reset action not available');
                            }
                        }}
                        style={{ 
                            backgroundColor: '#dc3545', 
                            color: 'white', 
                            padding: '10px 20px',
                            fontSize: '16px'
                        }}
                    >
                        Reset
                    </Button>
                </div>
            </Card>

            {/* Debug Info */}
            <Card style={{ padding: '15px', backgroundColor: '#f8f9fa' }}>
                <h4>Debug Info</h4>
                <pre style={{ fontSize: '12px', margin: 0 }}>
                    Context Available: {contextMiddleware ? 'Yes' : 'No'}{'\n'}
                    Counter State: {JSON.stringify(counter, null, 2)}{'\n'}
                    Actions Available: {Object.keys(counterActions).join(', ') || 'None'}
                </pre>
            </Card>
        </div>
    );
};

export default App;
