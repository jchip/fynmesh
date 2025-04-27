/**
 *  entry point for bundling and distributing the kernel in IIFE format for loading
 *  in the browser
 */
import { fynMeshKernel } from './core';

// Initialize kernel runtime
fynMeshKernel.initRunTime({
  remoteModuleCache: {},
  inflightRemote: {},
  appsLoading: [],
  appsLoaded: {},
  middlewares: {}
});

// Attach the initialized kernel instance to globalThis
(globalThis as any).fynMeshKernel = fynMeshKernel;
