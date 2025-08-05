/**
* This file handles dynamic imports of the reusable components from fynapp-x1
* These imports are managed by the fynmesh kernel's module federation system
*/
import React from 'esm-react';
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
export declare const preloadComponents: () => Promise<ComponentLibrary>;
export declare const getComponent: (name: keyof ComponentLibrary) => Promise<any>;
export declare const createLazyComponent: (componentName: keyof ComponentLibrary) => any;
