import { FynMeshKernel } from '@fynmesh/kernel';

/**
 * Sample FynApp 2 using React 18
 *
 * This is a simple fynapp that demonstrates basic functionality:
 * - Initializes with the kernel
 * - Exposes a simple API
 * - Handles lifecycle events
 */
class FynApp2React18 {
    private kernel: FynMeshKernel;
    private name = 'fynapp-2-react18';

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

        console.log(`${this.name}: Initialized successfully`);
    }
}

export default FynApp2React18;