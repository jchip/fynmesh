import { FynMeshKernel, FederationEntry } from "@fynmesh/kernel";

/**
 * FynApp-6-React Configuration with React Context Middleware
 *
 * This demonstrates:
 * - Shared counter context (same as fynapp-1 and fynapp-2)
 * - Cross-app state management between React 19 apps
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
        // SHARED: Simple counter (shared with fynapp-1 and fynapp-2)
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
export function configure(kernel: FynMeshKernel, entry: FederationEntry) {
  console.log("Configuring fynapp-6-react with kernel:", kernel.version);
}
