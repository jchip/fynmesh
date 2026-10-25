/**
 * Middleware add-on: registration, auto-apply, explicit `useMiddleware`
 * coordination, execution overrides, and the shared-state registries.
 */

import type {
  FynApp,
  FynAppMiddlewareCallContext,
  FynAppMiddlewareReg,
  FynMeshKernel,
  KernelAddon,
  KernelHooks,
  MiddlewareKernel,
} from "../types";
import { MiddlewareManager } from "../modules/middleware-manager";
import { MiddlewareExecutor } from "../modules/middleware-executor";
import { MiddlewareStateRegistry } from "../middleware-state-registry";
import { ModuleLoadError, KernelErrorCode, type Result, ok, err } from "../errors";
import { MIDDLEWARE_EXPOSE_PREFIX, findExecutionOverride, executeMiddlewareOverride } from "../util";

/**
 * The add-on's working parts, kept on the kernel so tests can inspect or swap
 * them. Only this bundle reads them, so their names need not survive mangling.
 */
type MiddlewareParts = {
  mwMgr: MiddlewareManager;
  middlewareExecutor: MiddlewareExecutor;
  loadMiddlewareFromDependency(
    packageName: string,
    middlewarePath: string,
  ): Promise<Result<void, ModuleLoadError>>;
};

function install(kernel: FynMeshKernel, hooks: KernelHooks): void {
  const k = kernel as MiddlewareKernel & MiddlewareParts;
  k.mwMgr = new MiddlewareManager(hooks.tel.scope("middleware"));
  k.middlewareExecutor = new MiddlewareExecutor(hooks.tel.scope("executor"));
  // Adopt runtime data set before the add-on was installed
  k.mwMgr.initializeFromRuntime(hooks.rt());

  const globalRegistry = new MiddlewareStateRegistry();
  const regionRegistries = new Map<string, MiddlewareStateRegistry>();

  const autoApply = () => k.mwMgr.getAutoApply();
  const signalReady = async (cc: FynAppMiddlewareCallContext, share?: any) =>
    k.signalMiddlewareReady(cc, { share });

  k.registerMiddleware = (mwReg: FynAppMiddlewareReg): void => {
    k.mwMgr.registerMiddleware(mwReg);
    const exported = k.mwMgr.exportToRuntime();
    const rt = hooks.rt();
    rt.middlewares = exported.middlewares;
    rt.autoApply = exported.autoApply;
  };

  k.getMiddleware = (name, provider, opts) => k.mwMgr.getMiddleware(name, provider, opts);

  k.getMiddlewareRegistry = (scope) => {
    if (scope === "global") {
      return globalRegistry;
    }
    let registry = regionRegistries.get(scope.region);
    if (!registry) {
      registry = globalRegistry.createScope();
      regionRegistries.set(scope.region, registry);
    }
    return registry;
  };

  k.signalMiddlewareReady = async (cc, detail = {}) => {
    await k.emitAsync(
      new CustomEvent("MIDDLEWARE_READY", {
        detail: {
          name: detail.name || cc.reg.mw.name,
          status: detail.status || "ready",
          share: detail.share,
          cc,
        },
      }),
    );
  };

  /** Resume the deferred middleware calls a ready middleware unblocks. */
  k.events.on("MIDDLEWARE_READY", async (event: Event) => {
    const { name, status, cc, share } = (event as CustomEvent).detail;
    const { resumes } = k.middlewareExecutor.processReadyMiddleware(cc.reg.fullKey, share || {});

    for (const resume of resumes) {
      await k.middlewareExecutor.callMiddlewares(resume.callContexts, {
        signalReady,
        providerModeRegistrar: hooks.providerMode,
        autoApply: hooks.rt().autoApply,
        skipFynUnit: resume.resumeMode === "middleware_only" ? true : undefined,
      });
    }

    console.debug(
      `✅ Middleware ${name} status: ${status} regKey: ${cc.reg.regKey} now: ${Date.now()}`,
    );
  });

  /**
   * Load a middleware a dependency FynApp exposes. The path format is
   * `exposeModule/middlewareName`, e.g. "middleware/design-tokens/design-tokens".
   */
  const loadMiddlewareFromDependency = (k.loadMiddlewareFromDependency = async (
    packageName: string,
    middlewarePath: string,
  ): Promise<Result<void, ModuleLoadError>> => {
    console.debug(`📦 Loading middleware from dependency: ${packageName}/${middlewarePath}`);

    const dependencyApp = hooks.findApp(packageName);
    if (!dependencyApp) {
      const error = new ModuleLoadError(
        KernelErrorCode.DEPENDENCY_NOT_FOUND,
        `Dependency package ${packageName} not found in runtime`,
        { fynAppName: packageName, exposeName: middlewarePath },
      );
      hooks.tel.scope("loader").capErr(
        "dependency.not_found",
        { package: packageName, path: middlewarePath },
        error,
      );
      console.debug(`❌ ${error.message}`);
      return err(error);
    }

    const lastSlashIndex = middlewarePath.lastIndexOf("/");
    const exposeModule = lastSlashIndex > 0 ? middlewarePath.substring(0, lastSlashIndex) : middlewarePath;
    const result = await hooks.loadExpose(dependencyApp, `./${exposeModule}`);
    return result.success ? ok(undefined) : err(result.error);
  });

  hooks.init.push((data) => k.mwMgr.initializeFromRuntime(data));

  hooks.exposeLoaded.push((fynApp, exposeName, exposedModule) => {
    k.mwMgr.scanAndRegisterMiddleware(fynApp, exposeName, exposedModule);
  });

  /**
   * Proactively load middleware from dependencies.
   *
   * `__FYNAPP_MANIFEST__` is the FynApp's manifest, embedded in its entry file
   * by the build and assigned onto the container -- read directly here, not as
   * an expose module. Same content as `dist/fynapp.manifest.json`; see
   * notes/BUILD-ARTIFACTS.md.
   *
   * This read is the one place in the kernel with NO fallback. If the embedded
   * manifest is absent, `importExposed` is undefined and nothing is loaded in
   * silence: the provider FynApps still load (buildGraph walks
   * `import-exposed` too, and that path can fall back to fetching the JSON),
   * but their middleware is never pulled out and registered. The failure then
   * surfaces at a consumer, far from here, as middleware that does not exist.
   */
  hooks.basicsLoaded.push(async (fynApp: FynApp) => {
    const manifest = (fynApp.entry.container as any).__FYNAPP_MANIFEST__ || null;
    const importExposed = manifest?.["import-exposed"];
    if (!importExposed || typeof importExposed !== "object") {
      return;
    }

    console.debug("📦 Loading middleware dependencies for", fynApp.name);

    // Collect errors for reporting but continue loading other dependencies
    const loadErrors: ModuleLoadError[] = [];

    for (const [packageName, modules] of Object.entries(importExposed)) {
      if (!modules || typeof modules !== "object") continue;
      for (const [modulePath, moduleInfo] of Object.entries(modules as Record<string, any>)) {
        // Only middleware type dependencies; the key is the expose path, e.g. "middleware/design-tokens"
        if (moduleInfo && typeof moduleInfo === "object" && moduleInfo.type === "middleware") {
          console.debug(`📦 Proactively loading mw: ${packageName}/${modulePath}`);
          const result = await loadMiddlewareFromDependency(packageName, modulePath);
          if (!result.success) {
            loadErrors.push(result.error);
          }
        }
      }
    }

    // Log collected errors but don't fail - middleware deps may be optional
    if (loadErrors.length > 0) {
      console.debug(
        `⚠️ ${loadErrors.length} middleware dependency load error(s) for ${fynApp.name}:`,
        loadErrors.map((e) => e.message),
      );
    }
  });

  /** Load every middleware module the FynApp exposes. */
  hooks.beforeMain.push(async (fynApp) => {
    for (const exposeName of Object.keys(fynApp.entry.container.$E)) {
      if (exposeName.startsWith(MIDDLEWARE_EXPOSE_PREFIX)) {
        await hooks.loadExpose(fynApp, exposeName);
      }
    }
  });

  hooks.runUnit.push(async (fynApp, fynUnit) => {
    const createRuntime = () => hooks.runtimeFor(fynApp);

    const middlewareErrors = await k.middlewareExecutor.applyAutoScopeMiddlewares(
      fynApp,
      fynUnit,
      k,
      autoApply(),
      createRuntime,
      signalReady,
    );

    // Log middleware errors but don't fail bootstrap - middleware issues shouldn't break the app
    if (middlewareErrors.length > 0) {
      console.warn(
        `⚠️ ${middlewareErrors.length} middleware error(s) during bootstrap of ${fynApp.name}:`,
        middlewareErrors.map((e) => e.toDetailedString()),
      );
    }

    // Path A: explicit middleware meta - full middleware coordination.
    // A non-empty check, so an empty array still runs the unit (FYM-99).
    if (fynUnit.__middlewareMeta && fynUnit.__middlewareMeta.length > 0) {
      await k.middlewareExecutor.useMiddlewareOnFynUnit(
        fynUnit,
        fynApp,
        k,
        createRuntime,
        k.getMiddleware,
        async (packageName, middlewarePath) => {
          await loadMiddlewareFromDependency(packageName, middlewarePath);
        },
        autoApply(),
      );
      return true;
    }

    // Path B: an auto-apply middleware may override execution; otherwise the
    // kernel runs the unit itself
    const executionOverride = findExecutionOverride(fynApp, fynUnit, autoApply());
    if (executionOverride) {
      await executeMiddlewareOverride(executionOverride, fynUnit, fynApp, createRuntime(), k);
      return true;
    }
    return false;
  });
}

export const middlewareAddon: KernelAddon = { name: "middleware", install };
