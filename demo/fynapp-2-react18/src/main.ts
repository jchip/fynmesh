import { FynMeshKernel, FynApp } from '@fynmesh/kernel';
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from './App';
import { preloadComponents } from './components';

export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
    console.log(`Bootstrapping ${fynApp.name}...`, React, ReactDomClient, "versions", React.version, ReactDomVersion);

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
        ReactDomClient.createRoot(targetDiv).render(
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

