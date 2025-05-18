export type Module = Record<any, any>;

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
 * Interface representing a Module Federation remote container
 */
export interface MFRemoteContainer {
  /**
   * Initialize the container with a share scope
   * @param shareScope The share scope containing shared modules
   */
  init(shareScope: any): void | Promise<void>;

  /**
   * Get a module from the container
   * @param moduleName The name of the module to get
   */
  get(moduleName: string): Promise<any>;
}

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
 * Manifest for a fynapp
 */
export type FynappManifest = {
  /**
   * Name of the fynapp
   */
  name: string;
  /**
   * Version of the fynapp
   */
  version: string;
  /**
   * Entry point file for the fynapp
   */
  entry: string;
  /**
   * Modules exposed by the fynapp
   */
  exposes?: Record<string, string>;
  /**
   * Shared dependencies
   */
  shared?: Record<string, any>;
};

/**
 * Container for a fynapp
 */
export interface FynappContainer {
  /**
   * Initialize the container with a share scope
   */
  init(shareScope: any): Promise<void>;
  /**
   * Get a module from the container
   */
  get(moduleName: string): Promise<any>;
}

/**
 * Registry for fynapps
 */
export interface FynappRegistry {
  /**
   * Register a container
   */
  register(name: string, container: FynappContainer): void;
  /**
   * Get a container by name
   */
  get(name: string): FynappContainer | undefined;
  /**
   * Check if a container exists
   */
  has(name: string): boolean;
}

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
  mainModule?: Module;
  configModule?: Module;
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
  /** cache to save remote modules that have been loaded */
  remoteModuleCache: Record<string, unknown>;
  /** store inflight promises for loading remote modules */
  inflightRemote: Record<string, unknown>;
  /** a fynapp should add its info to this array when it's first fetched for initializing */
  appsLoading: FynAppInfo[];
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
   * Get the remote module federation container
   *
   * @remark Core doesn't implement this because it requires global (window) to
   *   hold the container.
   */
  getRemoteContainer(name: string): MFRemoteContainer;

  /**
   * Queue a fynapp for loading.
   *
   * - When a fynapp JS files is loaded, it should have code that automatically queue its info
   * for loading
   * @param info
   */
  queueFynAppLoading(info: FynAppInfo): void;

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
   * bootstrap fynapps by importing their bootstrap module
   *
   * @param fynAppInfo - array of fynapps info
   */
  bootstrapFynApp(fynAppInfo: FynAppInfo[]): Promise<void>;

  /**
   * Apply middlewares to a fynapp
   *
   * @param fynApp
   */
  applyMiddlewares(fynApp: FynApp): Promise<void>;

}

