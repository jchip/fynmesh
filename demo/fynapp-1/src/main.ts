import { FynMeshKernel, FynApp } from '@fynmesh/kernel';
import React from "react";
import ReactDomClient from "react-dom/client";
// Used by dynamic component imports
import './components';
import App from './App';
import { preloadComponents, ComponentLibrary } from './components';

/**
 * This is the main entry point for fynapp-1
 * It preloads components from fynapp-x1 before rendering the App
 */
export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
    console.log(`${fynApp.name} initializing with React ${React.version}`);

    // Create a loading indicator
    const createLoadingIndicator = () => {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'fynapp-1-loading';
        loadingDiv.style.padding = '20px';
        loadingDiv.style.textAlign = 'center';
        loadingDiv.innerHTML = `
            <h2>Loading components from fynapp-x1...</h2>
            <div style="margin-top: 20px; display: inline-block;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3;
                            border-top: 5px solid #3498db; border-radius: 50%;
                            animation: spin 1s linear infinite;"></div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;
        return loadingDiv;
    };

    // Find or create the div element to render into
    let targetDiv = document.getElementById('fynapp-1');
    if (!targetDiv) {
        targetDiv = document.createElement('div');
        targetDiv.id = 'fynapp-1';
        document.body.appendChild(targetDiv);
    }

    // Show loading indicator
    const loadingIndicator = createLoadingIndicator();
    targetDiv.appendChild(loadingIndicator);

    // Pre-load components from fynapp-x1
    let componentLibrary: ComponentLibrary;

    try {
        // Load the actual components
        componentLibrary = await preloadComponents();
        console.log('Successfully loaded component library from fynapp-x1');
    } catch (error) {
        console.error('Failed to load components from fynapp-x1:', error);

        // Show error message
        targetDiv.innerHTML = `
            <div style="padding: 20px; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
                <h3>Error Loading Components</h3>
                <p>Failed to load component library from fynapp-x1. Check console for details.</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
        return; // Exit early
    } finally {
        // Remove loading indicator
        if (loadingIndicator.parentNode) {
            loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
    }

    // Render the React component with pre-loaded components
    const root = ReactDomClient.createRoot(targetDiv);
    root.render(
        React.createElement(App, {
            appName: fynApp.name,
            components: componentLibrary
        })
    );
}

