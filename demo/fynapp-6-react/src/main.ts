import { FynMeshKernel, FynApp } from '@fynmesh/kernel';
// @ts-ignore
import React from "react";

// @ts-ignore
import ReactDom from "esm-react-dom";
// @ts-ignore
import App from './App';

export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
    console.log(`Bootstrapping ${fynApp.name}...`, React, ReactDom, "versions", React.version, ReactDom.version);

    // Find or create the div element to render into
    let targetDiv = document.getElementById('fynapp-6-react');
    if (!targetDiv) {
        targetDiv = document.createElement('div');
        targetDiv.id = 'fynapp-6-react';
        document.body.appendChild(targetDiv);
    }

    // Render the React component
    ReactDom.createRoot(targetDiv).render(React.createElement(App, { appName: fynApp.name }));

    console.log(`${fynApp.name} bootstrapped successfully`);
}

