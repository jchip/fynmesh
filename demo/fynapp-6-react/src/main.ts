import { FynMeshKernel, FynApp } from '@fynmesh/kernel';
import React from "react";
import { version as ReactDomVersion } from "react-dom";
import ReactDomClient from "react-dom/client";
import App from './App';

export async function main(kernel: FynMeshKernel, fynApp: FynApp) {
    console.log(`Bootstrapping ${fynApp.name}...`, React, ReactDomClient, "versions", React.version, ReactDomVersion);

    // Find or create the div element to render into
    let targetDiv = document.getElementById('fynapp-6-react');
    if (!targetDiv) {
        targetDiv = document.createElement('div');
        targetDiv.id = 'fynapp-6-react';
        document.body.appendChild(targetDiv);
    }

    // Render the React component
    ReactDomClient.createRoot(targetDiv).render(React.createElement(App, { appName: fynApp.name }));

    console.log(`${fynApp.name} bootstrapped successfully`);
}

