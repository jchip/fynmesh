// The kernel declares the global `fynMeshKernel`; importing it brings that in
import type {} from "@fynmesh/kernel";

// Type declarations for modules without types
declare module "@jchip/redbird" {
    const redbird: any;
    export default redbird;
}

