import { vi } from "vitest";
import { FynMeshKernelCore } from "../../src/kernel-core";
import { TestBootstrapCoordinator } from "./test-bootstrap-coordinator";
import { TestMiddlewareExecutor } from "./test-middleware-executor";
import type {
  RegistryResolver,
  FynAppManifest,
  RegistryResolverResult
} from "../../src/types";

/**
 * Test implementation of the kernel for unit testing
 */
export class TestKernel extends FynMeshKernelCore {
  // Track calls to loadFynApp for testing
  public loadFynAppCalls: Array<{ baseUrl: string; loadId?: string }> = [];

  // Control test behavior
  public shouldFailLoad = false;
  public loadDelay = 0;

  constructor() {
    super();
    // Replace with test fixtures that expose protected methods
    this.bootstrapCoordinator = new TestBootstrapCoordinator(this.events);
    this.middlewareExecutor = new TestMiddlewareExecutor();
  }

  async loadFynApp(baseUrl: string, loadId?: string): Promise<import("../../src/types").FynApp | null> {
    this.loadFynAppCalls.push({ baseUrl, loadId });

    if (this.loadDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.loadDelay));
    }

    if (this.shouldFailLoad) {
      throw new Error(`Test: Failed to load FynApp from ${baseUrl}`);
    }

    // For testing, we don't actually load anything
    // Tests can manually call loadFynAppBasics and bootstrapFynApp
    return null;
  }

  // Expose protected/private methods for testing
  // Call methods directly on kernel which may delegate to modules internally
  testResolveAndFetch(name: string, range?: string) {
    return this.manifestResolver.resolveAndFetch(name, range);
  }

  testBuildGraph(requests: Array<{ name: string; range?: string }>) {
    return this.manifestResolver.buildGraph(requests);
  }

  testTopoBatches(graph: any) {
    return this.manifestResolver.topoBatches(graph);
  }

  testLoadExposeModule(fynApp: any, exposeName: string, loadMiddlewares?: boolean) {
    // Pass the middleware scanner to delegate to MiddlewareManager
    const scanner = (fa: any, en: string, em: any) =>
      this.middlewareManager.scanAndRegisterMiddleware(fa, en, em);
    return (this.moduleLoader as any).loadExposeModule(fynApp, exposeName, loadMiddlewares, scanner);
  }

  testBootstrapFynApp(fynApp: any) {
    return this.bootstrapFynApp(fynApp);
  }

  testAreBootstrapDependenciesSatisfied(fynApp: any) {
    // Cast to test fixture to access protected methods
    return (this.bootstrapCoordinator as TestBootstrapCoordinator).areBootstrapDependenciesSatisfied(fynApp);
  }

  testFindProviderForMiddleware(middlewareName: string, excludeFynApp: string) {
    // Cast to test fixture to access protected methods
    return (this.bootstrapCoordinator as TestBootstrapCoordinator).findProviderForMiddleware(middlewareName, excludeFynApp);
  }

  testCheckSingleMiddlewareReady(cc: any) {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testCheckSingleMiddlewareReady(cc);
  }

  testCheckMiddlewareReady(ccs: any[]) {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testCheckMiddlewareReady(ccs);
  }

  testCheckDeferCalls(status: string, ccs: any[]) {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testCheckDeferCalls(status, ccs);
  }

  testCallMiddlewares(ccs: any[]) {
    return this.middlewareExecutor.callMiddlewares(ccs);
  }

  testLoadFynAppBasics(entry: any) {
    // Pass the middleware scanner to delegate to MiddlewareManager
    const scanner = (fa: any, en: string, em: any) =>
      this.middlewareManager.scanAndRegisterMiddleware(fa, en, em);
    return (this.moduleLoader as any).loadFynAppBasics(entry, (this as any).runTime.appsLoaded, scanner);
  }

  testUseMiddlewareOnFynModule(fynModule: any, fynApp: any) {
    return (this.middlewareExecutor as any).useMiddlewareOnFynModule(fynModule, fynApp);
  }

  async testApplyAutoScopeMiddlewares(fynApp: any, fynModule?: any) {
    const autoApplyMiddlewares = this.middlewareManager.getAutoApplyMiddlewares();
    return this.middlewareExecutor.applyAutoScopeMiddlewares(
      fynApp,
      fynModule,
      this,
      autoApplyMiddlewares,
      () => this.moduleLoader.createFynModuleRuntime(fynApp),
      async (cc, share) => this.signalMiddlewareReady(cc, { share })
    );
  }

  testLoadMiddlewareFromDependency(packageName: string, middlewarePath: string) {
    // Pass the middleware scanner to delegate to MiddlewareManager
    const scanner = (fa: any, en: string, em: any) =>
      this.middlewareManager.scanAndRegisterMiddleware(fa, en, em);
    return this.moduleLoader.loadMiddlewareFromDependency(packageName, middlewarePath, this.runTime.appsLoaded, scanner);
  }

  testCleanContainerName(name: string) {
    return (this as any).cleanContainerName(name);
  }

  testBuildFynAppUrl(baseUrl: string, entryFile?: string) {
    return (this as any).buildFynAppUrl(baseUrl, entryFile);
  }

  testCreateFynModuleRuntime(fynApp: any) {
    return this.moduleLoader.createFynModuleRuntime(fynApp);
  }

  // Direct access to module properties (modules are now public)
  public get testDeferInvoke() {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testDeferInvoke;
  }

  public get testMiddlewareReady() {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testMiddlewareReady;
  }

  public getMiddlewareReady() {
    return (this.middlewareExecutor as TestMiddlewareExecutor).testMiddlewareReady;
  }

  public get testBootstrappingApp() {
    return this.bootstrapCoordinator.bootstrappingApp;
  }

  public set testBootstrappingApp(value: string | null) {
    this.bootstrapCoordinator.bootstrappingApp = value;
  }

  public get testDeferredBootstraps() {
    return this.bootstrapCoordinator.deferredBootstraps;
  }

  public get testFynAppBootstrapStatus() {
    return this.bootstrapCoordinator.fynAppBootstrapStatus;
  }

  public get testFynAppProviderModes() {
    return this.bootstrapCoordinator.fynAppProviderModes;
  }
}

/**
 * Create a test kernel with default configuration
 */
export function createTestKernel(options?: {
  registryResolver?: RegistryResolver;
  shouldFailLoad?: boolean;
  loadDelay?: number;
}): TestKernel {
  const kernel = new TestKernel();

  // Initialize runtime
  kernel.initRunTime({
    appsLoaded: {},
    middlewares: {},
  });

  // Set up default test registry resolver
  const defaultResolver: RegistryResolver = vi.fn().mockImplementation(
    async (name: string, range?: string): Promise<RegistryResolverResult> => ({
      name,
      version: range || "1.0.0",
      manifestUrl: `/test/${name}/manifest.json`,
      distBase: `/test/${name}/dist/`,
    })
  );

  kernel.setRegistryResolver(options?.registryResolver || defaultResolver);

  if (options?.shouldFailLoad !== undefined) {
    kernel.shouldFailLoad = options.shouldFailLoad;
  }

  if (options?.loadDelay !== undefined) {
    kernel.loadDelay = options.loadDelay;
  }

  return kernel;
}

/**
 * Create a mock manifest for testing
 */
export function createMockManifest(overrides?: Partial<FynAppManifest>): FynAppManifest {
  return {
    name: "test-app",
    version: "1.0.0",
    requires: [],
    ...overrides,
  };
}

/**
 * Create a mock manifest with dependencies
 */
export function createMockManifestWithDeps(
  name: string,
  version: string,
  deps: Array<{ name: string; range?: string }>
): FynAppManifest {
  return {
    name,
    version,
    requires: deps.map(d => ({ name: d.name, range: d.range })),
  };
}
