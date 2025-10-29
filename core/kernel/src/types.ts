// Import and re-export FederationEntry from federation-js
import type { FederationEntry } from "federation-js";

export type FynAppEntry = FederationEntry & {
  setup?: () => Promise<void>;
};

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
 *
 */
export type FynAppInfo = {
  /** name of the fynapp */
  name: string;
  /** version of the fynapp */
  version: string;
  /* npm package name of the fynapp */
  packageName: string;
  /** Federation entry module (for new bootstrap system) */
  entry: FynAppEntry;
};

/**
 * Middleware info for registry and usage
 */
export interface MiddlewareInfo {
  /** name of the middleware */
  name: string;
  /** provider of the middleware */
  provider: string;
  /** version of the middleware */
  version?: string;
}

export interface MiddlewareUseMeta<ConfigT> {
  info: MiddlewareInfo;
  config: ConfigT;
}

export type FynModuleRuntime = {
  fynApp: FynApp;
  middlewareContext: Map<string, Record<string, any>>;
  [key: string]: any;
};

/**
 * Execution result type definitions for strongly typed FynModule results
 */
export interface FynModuleExecutionResult {
  type: 'component-factory' | 'rendered-content' | 'self-managed' | 'no-render';
  metadata?: {
    framework: string;
    version: string;
    capabilities: string[];
  };
}

export interface ComponentFactoryResult extends FynModuleExecutionResult {
  type: 'component-factory';
  componentFactory: (React: any) => {
    component: any; // React.ComponentType<ComponentProps> but avoiding React namespace
    props?: Record<string, any>;
  };
}

export interface RenderedContentResult extends FynModuleExecutionResult {
  type: 'rendered-content';
  content: HTMLElement | string;
}

export interface SelfManagedResult extends FynModuleExecutionResult {
  type: 'self-managed';
  target: HTMLElement;
  cleanup?: () => void;
}

export interface NoRenderResult extends FynModuleExecutionResult {
  type: 'no-render';
  message?: string;
}

// Union type for all possible results
export type FynModuleResult = 
  | ComponentFactoryResult 
  | RenderedContentResult 
  | SelfManagedResult 
  | NoRenderResult;

// Component props interface
export interface ComponentProps {
  fynAppName: string;
  runtime: FynModuleRuntime;
  [key: string]: any;
}

/**
 * Standardized interface for FynMesh modules (formerly MiddlewareUserCode)
 */
export interface FynModule {
  __middlewareMeta?: MiddlewareUseMeta<unknown>[];
  /** Tell middleware what you need - called first to determine readiness */
  initialize?(runtime: FynModuleRuntime): Promise<{ status: string; mode?: string }> | { status: string; mode?: string };
  /** Do your actual work - called when middleware is ready */
  execute(runtime: FynModuleRuntime): Promise<FynModuleResult | void> | FynModuleResult | void;
  [key: string]: any;
}

/**
 * Expose object for a fynapp that represents a module exposed by federation
 */
export type FynAppExpose = {
  /**
   * optional name of the exposed module, if desire to use something else in addition to the name
   * used for the federation expose config
   */
  __name?: string;
  /** main export of the exposed module */
  main?: FynModule;
  /** other exports from the exposed module */
  [key: string]: any;
};

/**
 * object that contains implementations of a fynapp
 */
export type FynApp = FynAppInfo & {
  config?: any;
  exposes: Record<string, FynAppExpose>;
  /** Set to true to tell the kernel to skip applying middlewares */
  skipApplyMiddlewares?: boolean;
  /** Middleware-specific data storage for this FynApp */
  middlewareContext: Map<string, Record<string, any>>;
};

export type FynAppMiddlewareCallContext = {
  meta: MiddlewareUseMeta<unknown>;
  fynMod: FynModule;
  fynApp: FynApp;
  reg: FynAppMiddlewareReg;
  runtime: FynModuleRuntime;
  kernel: FynMeshKernel;
  status: string;
};

/**
 * Enhanced middleware implementation interface
 */
export type FynAppMiddleware = {
  /** name of the middleware */
  name: string;
  /** Controls automatic application. Explicit useMiddleware() calls always work regardless of autoApplyScope */
  autoApplyScope?: ("all" | "fynapp" | "middleware")[];
  /** Optional filter function to determine if this middleware should apply to a specific FynApp */
  shouldApply?(fynApp: FynApp): boolean;
  /** one time setup for the middleware */
  setup?(context: FynAppMiddlewareCallContext): Promise<{ status: string; share?: any } | void>;
  /** apply the middleware to a fynapp with context */
  apply?(context: FynAppMiddlewareCallContext): Promise<void> | void;
  
  /** NEW: Execution override capabilities */
  canOverrideExecution?(fynApp: FynApp, fynModule: FynModule): boolean;
  overrideInitialize?(context: FynAppMiddlewareCallContext): Promise<{ status: string; mode?: string }>;
  overrideExecute?(context: FynAppMiddlewareCallContext): Promise<void>;
};

export type FynAppMiddlewareReg = {
  /** key used to register the middleware with the kernel */
  regKey: string;
  /** full key used to register the middleware with the kernel */
  fullKey: string;
  /** fynapp that hosts the middleware */
  hostFynApp: FynApp;
  /**
   * name of the exposed module that exported the middleware
   */
  exposeName: string;
  /**
   * name of the exported middleware
   */
  exportName: string;

  middleware: FynAppMiddleware;
};

/**
 * Middleware version map for tracking different versions of the same middleware
 */
export type FynAppMiddlewareVersionMap = Record<string, FynAppMiddlewareReg>;

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
  /** Auto-applying middleware categorized by scope */
  autoApplyMiddlewares?: {
    fynapp: FynAppMiddlewareReg[];
    middleware: FynAppMiddlewareReg[];
  };
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
 * Minimal per-app manifest used at runtime
 */
export interface FynAppRequireEdge {
  name: string;
  range?: string;
  optional?: boolean;
}

export interface FynAppManifest {
  name: string;
  version: string;
  exposes?: Record<string, {
    path: string;
    chunk: string;
  }>;
  "provide-shared"?: Record<string, {
    singleton?: boolean;
    requiredVersion?: string;
  }>;
  requires?: FynAppRequireEdge[];
  middlewares?: {
    uses?: Array<{ provider: string; name: string; range?: string; role?: string }>;
    provides?: Array<{ name: string }>;
  };
  "import-exposed"?: Record<string, Record<string, {
    requireVersion?: string;
    sites?: string[];
    type?: string;
    exposeModule?: string;
    middlewareName?: string;
  }>>;
  "shared-providers"?: Record<string, {
    requireVersion: string;
    provides: string[];
  }>;
}

/**
 * Resolver and resolver result for turning {name, range} into a concrete manifest URL
 */
export interface RegistryResolverResult {
  name: string;
  version: string;
  manifestUrl: string;
  distBase?: string;
}

export type RegistryResolver = (
  name: string,
  range?: string,
) => Promise<RegistryResolverResult>;

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
  registerMiddleware(meta: FynAppMiddlewareReg): void;

  /**
   * Get middleware by name and provider
   * @param name - middleware name
   * @param provider - provider FynApp name (optional, triggers fallback search if not provided)
   */
  getMiddleware(name: string, provider?: string): FynAppMiddlewareReg;

  /**
   * Clean up a container name to ensure it's a valid identifier
   * - this is needed so we can use npm package name as container name directly
   * - replace all chars @/-. with _, and then remove leading _
   *
   * @param name
   */
  cleanContainerName(name: string): string;

  /**
   * Load the basics of a fynapp federation entry into a FynApp object
   * - This only does loading, no execution of anything occurs here
   * Basics are:
   * - Initialize the entry
   * - Load config
   * - Load main module
   *     - Load middlewares from main module
   *
   * @param fynAppEntry - fynapp entry
   * @returns fynapp object
   */
  loadFynAppBasics(fynAppEntry: FynAppEntry): Promise<FynApp>;

  /**
   * Load a remote fynapp
   *
   * @param baseUrl - base URL to the fynapp assets
   * @param loadId - id for the load task
   */
  loadFynApp(baseUrl: string, loadId?: string): Promise<void>;

  /**
   * Bootstrap a fynapp
   *
   * @param fynApp - fynapp to bootstrap
   */
  bootstrapFynApp(fynApp: FynApp): Promise<void>;

  /**
   * Send an event to the kernel
   * @param event - event to send
   */
  emitAsync(event: CustomEvent): Promise<boolean>;

  /**
   * Programmatic API for middlewares to signal readiness to the kernel without emitting DOM events.
   * - Optionally pass a share object to be provided to waiting consumers via cc.runtime.share
   */
  signalMiddlewareReady(
    cc: FynAppMiddlewareCallContext,
    detail?: { name?: string; status?: string; share?: any }
  ): Promise<void>;

  /**
   * Set a resolver that maps {name, range} to a concrete manifest URL (and optional dist base)
   */
  setRegistryResolver(resolver: RegistryResolver): void;

  /**
   * Load one or more FynApps by name/range using manifests and a dependency graph
   */
  loadFynAppsByName(
    requests: Array<{ name: string; range?: string }>,
    options?: { concurrency?: number }
  ): Promise<void>;
}

export interface MiddlewareHandlerContext {
  config?: any;
  fynApp?: FynApp;
  kernel?: FynMeshKernel;
  initResult?: any;
  [key: string]: any;
}

export interface Middleware {
  // New control methods
  handleInitialize?(context: MiddlewareHandlerContext): Promise<any>;
  handleMain?(context: MiddlewareHandlerContext): Promise<void>;
}
