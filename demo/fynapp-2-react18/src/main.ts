import { FynMeshKernel, FynApp } from '@fynmesh/kernel';
import React from "react";
// @ts-ignore
import ReactDom from "esm-react-dom";
// @ts-ignore
import App from './App';
import { preloadComponents } from './components';

export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
    console.log(`Bootstrapping ${fynApp.name}...`, React, ReactDom, "versions", React.version, ReactDom.version);

    try {
        // Preload components from fynapp-x1 before rendering
        console.log('Preloading components from fynapp-x1...');
        const components = await preloadComponents();
        console.log('Components loaded successfully:', Object.keys(components));

        // Find or create the div element to render into
        let targetDiv = document.getElementById('fynapp-2-react18');
        if (!targetDiv) {
            targetDiv = document.createElement('div');
            targetDiv.id = 'fynapp-2-react18';
            document.body.appendChild(targetDiv);
        }

        // Render the React component with preloaded components
        ReactDom.createRoot(targetDiv).render(
            React.createElement(App, {
                appName: fynApp.name,
                components: components
            })
        );

        console.log(`${fynApp.name} bootstrapped successfully`);
    } catch (error) {
        console.error(`Failed to bootstrap ${fynApp.name}:`, error);
    }
}

