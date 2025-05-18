// @ts-nocheck
/**
* This file handles dynamic imports of the reusable components from fynapp-x1
* These imports are managed by the fynmesh kernel's module federation system
*/
import React from 'react';

// Type definition for the component library
export type ComponentLibrary = {
    Button: React.ComponentType<any>;
    Card: React.ComponentType<any>;
    Input: React.ComponentType<any>;
    Modal: React.ComponentType<any>;
    Alert: React.ComponentType<any>;
    Badge: React.ComponentType<any>;
    Spinner: React.ComponentType<any>;
};

/**
 * Preloads all components from fynapp-x1 and returns them as a library
 * This should be called before rendering the App component
 */
export const preloadComponents = async (): Promise<ComponentLibrary> => {
    try {
        // Using dynamic import with the module federation remote reference
        const components = await import('fynapp-x1/main', { with: { type: "mf-expose" } });

        // Return the components library
        return {
            Button: components.Button,
            Card: components.Card,
            Input: components.Input,
            Modal: components.Modal,
            Alert: components.Alert,
            Badge: components.Badge,
            Spinner: components.Spinner,
        };
    } catch (error) {
        console.error('Failed to load components from fynapp-x1:', error);
        throw error;
    }
};

// Get a specific component by name
export const getComponent = async (name) => {
    const components = await importFynappX1Components();
    return components[name];
};

// Export a lazy loading wrapper for each component
export const createLazyComponent = (componentName) => {
    return React.lazy(() =>
        importFynappX1Components()
            .then(module => ({
                default: module[componentName]
            }))
    );
};