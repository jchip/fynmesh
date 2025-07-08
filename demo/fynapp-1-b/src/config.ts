/**
 * FynApp Configuration and Middleware Setup
 * This module exports configuration for middleware (automatically detected by kernel)
 */

export default {
  // Configuration for the middleware (automatically detected and applied)
  // Note: Middleware is automatically applied by the kernel when detected
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
