/**
 * FynApp Configuration and Middleware Requirements
 * This module exports configuration that tells the kernel what middleware this FynApp needs
 */

export default {
  // Declare what middleware this FynApp wants to use
  middlewareRequirements: [
    {
      name: "react-context",
      version: "^1.0.0",
      required: true,
      provider: "fynapp-react-middleware",
    },
  ],

  // Configuration for the middleware we're using
  middlewareConfig: {
    "react-context": {
      contexts: {
        // SHARED: Simple counter (shared between fynapp-1 and fynapp-2)
        counter: {
          shared: true,
          initialState: {
            count: 0,
          },
          actions: {
            increment: {
              validator: () => true,
              reducer: (state: any) => ({
                ...state,
                count: state.count + 1,
              }),
            },
            reset: {
              validator: () => true,
              reducer: (state: any) => ({
                ...state,
                count: 0,
              }),
            },
          },
          persistence: {
            type: "localStorage",
            key: "fynmesh-shared-counter",
          },
        },
      },
    },
  },
};

/**
 * Optional configure function that the kernel can call during config phase
 */
export function configure(kernel: any, fynAppEntry: any) {
  console.log("Configuring fynapp-1-b with kernel:", kernel.version);
}
