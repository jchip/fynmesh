// @ts-ignore
import React, { useState } from 'react';

interface CounterProps {
    initialCount: number;
}

function Counter({ initialCount }: CounterProps): React.ReactElement {
    // @ts-ignore
    const [count, setCount] = useState<number>(initialCount);

    const increment = (): void => {
        setCount((prevCount: number) => prevCount + 1);
    };

    const decrement = (): void => {
        setCount((prevCount: number) => prevCount - 1);
    };

    return (
        // @ts-ignore
        <div className="counter">
            <h2>Counter Component</h2>
            <p>Current count: {count}</p>

            <div className="buttons">
                <button onClick={decrement}>-</button>
                <button onClick={increment}>+</button>
            </div>

            <div className="counter-message">
                {count === 0 ? (
                    <span>Try clicking the buttons!</span>
                ) : count > 10 ? (
                    <span>That's a big number!</span>
                ) : count < 0 ? (
                    <span>Negative numbers work too!</span>
                ) : (
                    <span>Keep counting!</span>
                )}
            </div>
        </div>
    );
}

export default Counter;