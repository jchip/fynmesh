// Import and re-export FederationEntry from federation-js
import type { FederationEntry } from "federation-js";
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
    options?: boolean | AddEventListenerOptions,
  ): void;
  once(
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
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
 * Middleware requirement declaration
 */
export interface MiddlewareRequirement {
  /** Name of the middleware */
  name: string;
  /** Optional version constraint */
  version?: string;
  /** Whether this middleware is required or optional */
  required?: boolean;
  /** Source FynApp that provides this middleware (optional) */
  provider?: string;
}

/**
 * API surface that middleware can expose to FynApps
 */
export interface MiddlewareAPI {
  /** Get middleware instance by name */
  get<T = any>(name: string): T | undefined;
  /** Check if middleware is available */
  has(name: string): boolean;
  /** Get all available middleware names */
  list(): string[];
}

/**
 * Context provided to middleware during application
 */
export interface MiddlewareContext {
  /** Middleware configuration from FynApp manifest */
  config: Record<string, any>;
  /** Kernel instance */
  kernel: FynMeshKernel;
  /** Other middleware APIs that this middleware can access */
  middleware: MiddlewareAPI;
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
  /** Middleware that this FynApp wants to use */
  middlewareRequirements?: MiddlewareRequirement[];
  /** Configuration for requested middleware */
  middlewareConfig?: Record<string, Record<string, any>>;
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
  /** Runtime middleware API access */
  middleware?: Record<string, any>;
};

/**
 * Enhanced middleware implementation interface
 */
export type FynAppMiddleware = {
  /** name of the middleware */
  name: string;
  /** Optional version for compatibility checking */
  version?: string;
  /** one time setup for the middleware */
  setup?(kernel: FynMeshKernel): Promise<void> | void;
  /** apply the middleware to a fynapp with context */
  apply?(fynApp: FynApp, context: MiddlewareContext): Promise<void> | void;
  /** Optional teardown when FynApp is unloaded */
  teardown?(fynApp: FynApp): Promise<void> | void;
};

export type FynAppMiddlewareConfig = {
  //
};

/**
 * Middleware info for registry
 */
export interface MiddlewareInfo {
  name: string;
  version?: string;
  provider: string;
  implementation: FynAppMiddleware;
}

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
   * Middleware registry and API
   */
  middleware: {
    /** Register a middleware implementation */
    register(middleware: FynAppMiddleware, provider?: string): void;
    /** Get middleware by name */
    get<T = any>(name: string): T | undefined;
    /** Check if middleware is available */
    has(name: string): boolean;
    /** List all available middleware */
    list(): MiddlewareInfo[];
    /** Create middleware context for FynApp */
    createContext(fynApp: FynApp): MiddlewareContext;
  };

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
