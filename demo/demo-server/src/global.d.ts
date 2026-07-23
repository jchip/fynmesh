import { FynMeshKernel } from "@fynmesh/kernel";

declare global {
    var fynMeshKernel: FynMeshKernel;
}

// Type declarations for modules without types
declare module "@jchip/redbird" {
    const redbird: any;
    export default redbird;
}

declare module "chalker" {
    const ck: any;
    export default ck;
}
