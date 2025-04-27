// @ts-ignore
import React, { useState } from 'react';
// @ts-ignore
import Counter from './components/Counter';

function App(): React.ReactElement {
    // @ts-ignore
    const [greeting, setGreeting] = useState<string>('Hello React 19!');

    return (
        // @ts-ignore
        <div className="app">
            <h1>{greeting}</h1>
            <p>
                Welcome to your new TypeScript React 19 application bundled with Rollup.
            </p>

            <Counter initialCount={0} />
        </div>
    );
}

export default App;