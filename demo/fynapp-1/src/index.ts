import { FynMeshKernel } from '@fynmesh/kernel';

/**
 * Sample FynApp 1
 *
 * This is a simple fynapp that demonstrates basic functionality:
 * - Initializes with the kernel
 * - Exposes a simple API
 * - Handles lifecycle events
 */
class FynApp1 {
    private kernel: FynMeshKernel;
    private name = 'fynapp-1';

    constructor(kernel: FynMeshKernel) {
        this.kernel = kernel;
    }

    /**
     * Initialize the fynapp
     */
    async init() {
        console.log(`${this.name}: Initializing...`);

        // Queue the fynapp for loading
        this.kernel.queueFynAppLoading({
            name: this.name,
            version: '1.0.0',
            packageName: this.name,
            bootstrap: './bootstrap',
            exposes: {
                './hello': './src/hello',
                './getInfo': './src/getInfo'
            }
        });

        // test test
        // @ts-ignore
        // const react = await import("esm-react", {
        //     with: {
        //         type: "fynapp-shared",
        //         fynapp: "fynapp-react-18",
        //         requiredVersion: "^18.2.0",
        //     },
        // });



        console.log(`${this.name}: Initialized successfully`);
    }
}

export default FynApp1;