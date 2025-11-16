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
    // dynamic import exposed modules from module federation remote container
    // @ts-ignore - TS can't understand module federation remote containers
    const components = await import<ComponentLibrary>('fynapp-x1/main', {with: {type: "mf-expose", semver: "^2.0.0"}});

    // Return the components library
    return components;
  } catch (error) {
    console.error('Failed to load components from fynapp-x1:', error);
    throw error;
  }
};

// Get a specific component by name
export const getComponent = async (name: keyof ComponentLibrary) => {
    const components = await preloadComponents();
    return components[name];
};

// Export a lazy loading wrapper for each component
export const createLazyComponent = (componentName: keyof ComponentLibrary) => {
    return React.lazy(() =>
        preloadComponents()
            .then(module => ({
                default: module[componentName]
            }))
    );
};
