import { FynEventTarget } from "./event-target";
import { fynMeshShareScope } from "./share-scope";
import {
  FynAppInfo,
  FynMeshKernel,
  FynAppMiddleware,
  FynMeshRuntimeData,
  FynApp,
  MFRemoteContainer,
  Module,
} from "./types";
import { urlJoin } from "./util";

interface RunTimeData extends FynMeshRuntimeData {
  // Removed AMD-related properties
}

export interface FynMeshKernelCore extends FynMeshKernel {
  runTime: RunTimeData;
  shareScope: Record<string, any>;
}

/**
 * Implementation of FynMesh client side library
 */
export const fynMeshKernel: FynMeshKernelCore = {
  events: new FynEventTarget(),
  version: "1.0.0",
  shareScopeName: fynMeshShareScope,
  shareScope: Object.create(null),
  runTime: {
    remoteModuleCache: {},
    inflightRemote: {},
    appsLoading: [],
    appsLoaded: {},
    middlewares: {},
  },

  initRunTime(this: FynMeshKernelCore, data: FynMeshRuntimeData) {
    return (this.runTime = data);
  },

  cleanContainerName(name: string) {
    return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
  },

  queueFynAppLoading(this: FynMeshKernelCore, info: FynAppInfo) {
    this.runTime.appsLoading.push(info);
    console.debug(
      `%c FynMeshKernel queued fynapp '${info.name}' for bootstrap `,
      "background: #365ebf; color: white; display: block; font-size: 1.2em;"
    );
  },

  getRemoteContainer(this: FynMeshKernelCore, name: string): MFRemoteContainer {
    const cleanName = this.cleanContainerName(name);
    const Federation = (globalThis as any).Federation;

    if (!Federation) {
      console.error("Federation.js is not loaded. Make sure it's included before using FynMesh.");
      return null as any;
    }

    return Federation._mfGetContainer(cleanName);
  },



  /**
   * Load a remote fynapp through federation.js
   *
   * @param baseUrl - base URL to the fynapp assets
   * @param loadId - id for the load task
   */
  async loadFynApp(this: FynMeshKernelCore, baseUrl: string, loadId?: string) {
    loadId = loadId || baseUrl;
    const urlPath = urlJoin(baseUrl, 'fynapp-entry.js');

    try {
      // Use SystemJS to load the fynapp entry
      const fynapp = await (globalThis as any).Federation.import(urlPath);
      fynapp.init();
      const container = fynapp.container;
      if (container && container.$E["./config"]) {
        console.debug('fynMeshKernel loaded fynapp config', fynapp);
        const factory = await fynapp.get("./config");
        factory().configure(this, fynapp);
      }
      if (container && container.$E["./bootstrap"]) {
        console.debug('fynMeshKernel loaded fynapp bootstrap', fynapp);
        const factory = await fynapp.get("./bootstrap");
        factory().bootstrap(this, fynapp);
      }
      console.debug('fynMeshKernel loaded fynapp', fynapp);
    } catch (err) {
      console.error(`Failed to load remote fynapp from ${baseUrl}:`, err);
      throw err;
    }

    const { runTime } = this;
    const { appsLoading } = runTime;
    runTime.appsLoading = [];
    await this.bootstrapFynApp(appsLoading);
  },

  /**
   * bootstrap fynapps by importing their bootstrap module
   *
   * @param appsInfo - array of fynapps info
   */
  async bootstrapFynApp(this: FynMeshKernelCore, appsInfo: FynAppInfo[]) {
    if (appsInfo.length <= 0) {
      return;
    }

    const { runTime } = this;
    const appsLoaded = runTime.appsLoaded;

    const loadMiddlewares = async (fynApp: FynApp) => {
      if (!fynApp.middlewares) return;

      for (const capId in fynApp.middlewares) {
        const config = fynApp.middlewares[capId];
        const exportName = `__middleware${capId.replace(/^./, (x) => x.toUpperCase())}`;
        const middleware: FynAppMiddleware = fynApp.bootstrapModule?.[exportName];
        console.debug("loading middleware", capId, exportName, fynApp.bootstrapModule);

        if (middleware && middleware.setup) {
          await middleware.setup(this);
        }

        runTime.middlewares[`${fynApp.packageName}/${capId}`] = {
          fynApp,
          config,
          moduleName: "",
          exportName,
          implementation: middleware,
        };
      }
    };

    const bootstrapped = [] as FynApp[];

    for (let ix = 0; ix < appsInfo.length; ix++) {
      const appInfo = appsInfo[ix];
      if (!appsLoaded[appInfo.name]) {
        const fynApp: FynApp = Object.assign({}, appInfo);


        appsLoaded[fynApp.name] = fynApp;
        bootstrapped.push(fynApp);
      }
    }

    for (const fynApp of bootstrapped) {
      await loadMiddlewares(fynApp);
    }

    for (const fynApp of bootstrapped) {
      if (!fynApp.skipApplyMiddlewares) {
        await this.applyMiddlewares(fynApp);
      }
    }
  },

  async applyMiddlewares(this: FynMeshKernelCore, fynApp: FynApp) {
    const { runTime } = this;
    const { middlewares } = runTime;

    for (const capId in middlewares) {
      const middleware = middlewares[capId];
      if (middleware.implementation.apply) {
        await middleware.implementation.apply(fynApp);
      }
    }
  },

};
