// Import and re-export FederationEntry from federation-js
import type { FederationEntry } from 'federation-js';
export type { FederationEntry };

// Declare the global fynMeshKernel
declare global {
  var fynMeshKernel: FynMeshKernel;
}

/**
 * Event target type for the kernel
 */
export type FynAppEventTarget = EventTarget & {
  on(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  once(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
};

/**
 * Configuration for the FynMesh kernel
 */
export type KernelConfig = {
  /**
   * Base URL for loading fynapps
   */
  baseUrl?: string;
  /**
   * Whether to enable debug mode
   */
  debug?: boolean;
};

/**
 *
 */
export type FynAppInfo = {
  /** name of the fynapp */
  name: string;
  /** version of the fynapp */
  version: string;
  /* npm package name of the fynapp */
  packageName?: string;
  /**
   * name of the config module - this is a module that must be self sufficient without external dependencies, meant to
   * execute before the rest of the fynapp is loaded.  Its typically used to do configuration before the rest of the fynapp is loaded.
   */
  config?: string;
  /** name of the main module */
  main?: string;
  /** free form object containing build related information */
  buildInfo?: Record<string, unknown>;
  /** modules that the fynapp exposed */
  exposes?: Record<string, string>;
  /** middlewares that the fynapp implemented */
  middlewares?: Record<string, FynAppMiddleware>;
  /** Federation entry module (for new bootstrap system) */
  entry?: FederationEntry;
};

export type MiddlewareUsage = {
  __middlewareInfo: {
    pkg: string;
    middleware: string;
  };
  user: unknown;
};

/**
 * object that contains implementations of a fynapp
 */
export type FynApp = FynAppInfo & {
  mainModule?: any;
  configModule?: any;
  /** Set to true to tell the kernel to skip applying middlewares */
  skipApplyMiddlewares?: boolean;
};

/**
 * middleware implementation
 */
export type FynAppMiddleware = {
  /** name of the middleware */
  name: string;
  /** one time setup for the middleware */
  setup?(kernel: FynMeshKernel
  ): Promise<void>;
  /** apply the middleware to a fynapp */
  apply?(fynApp: FynApp): Promise<void>;
};

export type FynAppMiddlewareConfig = {
  //
};

/**
 * object that holds all parts of a middleware together
 */
export type FynAppMiddlewareMeta = {
  /**
   * fynApp that registered the middleware
   */
  fynApp: FynApp;
  /**
   * config for the middleware
   */
  config: FynAppMiddlewareConfig;
  /**
   * name of the module that implemented the middleware
   */
  moduleName: string;
  /**
   * The export name of the middleware definition from the module
   */
  exportName: string;
  /**
   * The middleware implementation
   */
  implementation: FynAppMiddleware;
};

/**
 * Run time data for FynMesh fynApp core loader
 */
export type FynMeshRuntimeData = {
  /** FynApps that have been loaded and initialized */
  appsLoaded: Record<string, FynApp>;
  /**
   * middlewares that the loaded fynapps registered
   */
  middlewares: Record<string, FynAppMiddlewareMeta>;
};

/**
 * FynMesh client side library types
 */
export interface FynMeshKernel {
  /** emitter of kernel events */
  events: FynAppEventTarget;
  /** kernel version */
  version: string;
  /**
   * Initialize the Kernel run time data
   *
   * @remark this allows user startup code to do it according to
   * the target platform (browser or node.js)
   *
   */
  initRunTime(data: FynMeshRuntimeData): FynMeshRuntimeData;

  /** federation module share scope name */
  shareScopeName: string;



  /**
   * Clean up a container name to ensure it's a valid identifier
   * - this is needed so we can use npm package name as container name directly
   * - replace all chars @/-. with _, and then remove leading _
   *
   * @param name
   */
  cleanContainerName(name: string): string;

  /**
   * Load a remote fynapp
   *
   * @param baseUrl - base URL to the fynapp assets
   * @param loadId - id for the load task
   */
  loadFynApp(baseUrl: string, loadId?: string): Promise<void>;

  /**
   * Bootstrap fynapps - handles both federation entries and legacy app info
   * For federation entries: init → config → middlewares → main
   * For legacy apps: import main module → load middlewares → apply middlewares
   *
   * @param fynAppInfo - array of fynapps info to bootstrap
   */
  bootstrapFynApp(fynAppInfo: FynAppInfo[]): Promise<void>;

  /**
   * Apply middlewares to a fynapp
   *
   * @param fynApp
   */
  applyMiddlewares(fynApp: FynApp): Promise<void>;


}

