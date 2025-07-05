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
 * Context provided to middleware during application
 */
export interface MiddlewareContext {
  /** Middleware configuration from useMiddleware call */
  config: any;
  /** Kernel instance */
  kernel: FynMeshKernel;
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
  /** Federation entry module (for new bootstrap system) */
  entry?: FederationEntry;
};

/**
 * Middleware info for registry and usage
 */
export interface MiddlewareInfo {
  name: string;
  provider: string;
  version?: string;
}

/**
 * Middleware usage object returned by useMiddleware
 */
export type MiddlewareUsage<ConfigT = any, UserT = unknown> = {
  __middlewareInfo: MiddlewareInfo;
  config: ConfigT;
  user: UserT;
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

/**
 * object that holds all parts of a middleware together
 */
export type FynAppMiddlewareMeta = {
  /**
   * fynApp that registered the middleware
   */
  fynApp: FynApp;
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
 * Middleware version map for tracking different versions of the same middleware
 */
export type FynAppMiddlewareVersionMap = Record<string, FynAppMiddlewareMeta>;

/**
 * Middleware registry structure using provider::middleware-name format
 */
export type MiddlewareRegistry = Record<string, FynAppMiddlewareVersionMap>;

/**
 * Run time data for FynMesh fynApp core loader
 */
export type FynMeshRuntimeData = {
  /** FynApps that have been loaded and initialized */
  appsLoaded: Record<string, FynApp>;
  /**
   * middlewares that the loaded fynapps registered
   * Key format: "provider::middleware-name"
   */
  middlewares: MiddlewareRegistry;
};

/**
 * Middleware lookup options
 */
export interface MiddlewareLookupOptions {
  /** Whether to perform fallback search across all providers */
  fallbackSearch?: boolean;
  /** Specific version to look for */
  version?: string;
}

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
   * Register a middleware implementation (called automatically during FynApp loading)
   */
  registerMiddleware(middleware: FynAppMiddleware, provider: string, fynAppVersion?: string): void;

  /**
   * Get middleware by name and provider
   * @param name - middleware name
   * @param provider - provider FynApp name (optional, triggers fallback search if not provided)
   * @param options - additional lookup options
   */
  getMiddleware<T = any>(
    name: string,
    provider?: string,
    options?: MiddlewareLookupOptions,
  ): T | undefined;

  /**
   * Check if middleware is available
   * @param name - middleware name
   * @param provider - provider FynApp name (optional, triggers fallback search if not provided)
   */
  hasMiddleware(name: string, provider?: string): boolean;

  /**
   * List all available middleware
   */
  listMiddleware(): MiddlewareInfo[];

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
   * Apply middlewares to a fynapp (called automatically during FynApp loading)
   *
   * @param fynApp
   */
  applyMiddlewares(fynApp: FynApp): Promise<void>;
}
