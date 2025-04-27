// @ts-ignore
import React from 'react';
// @ts-ignore
import ReactDOMClient from 'react-dom/client';
// @ts-ignore
import App from './App';

const container = document.getElementById('root');

if (!container) {
    throw new Error('Root element not found');
}

// @ts-ignore
const root = ReactDOMClient.createRoot(container);
root.render(
    // @ts-ignore
    <React.StrictMode>
        <App />
    </React.StrictMode>
);