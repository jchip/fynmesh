import { vi } from "vitest";
import { FynMeshKernelCore } from "../../src/kernel-core";
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
  
  async loadFynApp(baseUrl: string, loadId?: string): Promise<void> {
    this.loadFynAppCalls.push({ baseUrl, loadId });
    
    if (this.loadDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.loadDelay));
    }
    
    if (this.shouldFailLoad) {
      throw new Error(`Test: Failed to load FynApp from ${baseUrl}`);
    }
    
    // For testing, we don't actually load anything
    // Tests can manually call loadFynAppBasics and bootstrapFynApp
  }
  
  // Expose protected methods for testing
  testResolveAndFetch(name: string, range?: string) {
    return (this as any).resolveAndFetch(name, range);
  }

  testBuildGraph(requests: Array<{ name: string; range?: string }>) {
    return (this as any).buildGraph(requests);
  }

  testTopoBatches(graph: any) {
    return (this as any).topoBatches(graph);
  }

  testLoadExposeModule(fynApp: any, exposeName: string, loadMiddlewares?: boolean) {
    return (this as any).loadExposeModule(fynApp, exposeName, loadMiddlewares);
  }

  testBootstrapFynApp(fynApp: any) {
    return (this as any).bootstrapFynApp(fynApp);
  }

  testAreBootstrapDependenciesSatisfied(fynApp: any) {
    return (this as any).areBootstrapDependenciesSatisfied(fynApp);
  }

  testFindProviderForMiddleware(middlewareName: string, excludeFynApp: string) {
    return (this as any).findProviderForMiddleware(middlewareName, excludeFynApp);
  }

  testCheckSingleMiddlewareReady(cc: any) {
    return (this as any).checkSingleMiddlewareReady(cc);
  }

  testCheckMiddlewareReady(ccs: any[]) {
    return (this as any).checkMiddlewareReady(ccs);
  }

  testCheckDeferCalls(status: string, ccs: any[]) {
    return (this as any).checkDeferCalls(status, ccs);
  }

  testCallMiddlewares(ccs: any[]) {
    return (this as any).callMiddlewares(ccs);
  }

  testLoadFynAppBasics(entry: any) {
    return (this as any).loadFynAppBasics(entry);
  }

  testUseMiddlewareOnFynModule(fynModule: any, fynApp: any) {
    return (this as any).useMiddlewareOnFynModule(fynModule, fynApp);
  }

  testLoadMiddlewareFromDependency(packageName: string, middlewarePath: string) {
    return (this as any).loadMiddlewareFromDependency(packageName, middlewarePath);
  }

  testCleanContainerName(name: string) {
    return (this as any).cleanContainerName(name);
  }

  testBuildFynAppUrl(baseUrl: string, entryFile?: string) {
    return (this as any).buildFynAppUrl(baseUrl, entryFile);
  }

  testCreateFynModuleRuntime(fynApp: any) {
    return (this as any).createFynModuleRuntime(fynApp);
  }
  
  // Getters for protected properties
  public get testDeferInvoke() {
    return this.deferInvoke;
  }
  
  public get testMiddlewareReady() {
    return this.middlewareReady;
  }
  
  public get testBootstrappingApp() {
    return this.bootstrappingApp;
  }
  
  public set testBootstrappingApp(value: string | null) {
    this.bootstrappingApp = value;
  }
  
  public get testDeferredBootstraps() {
    return this.deferredBootstraps;
  }
  
  public get testFynAppBootstrapStatus() {
    return this.fynAppBootstrapStatus;
  }
  
  public get testFynAppProviderModes() {
    return this.fynAppProviderModes;
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
