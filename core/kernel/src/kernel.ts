import { FynappContainer, FynappManifest, FynappRegistry, KernelConfig, MFRemoteContainer } from './types';
import { urlJoin } from './util';

/**
 * Simple kernel implementation for loading and managing fynapps
 */
export class FynMeshKernel {
  private registry: FynappRegistry;
  private config: KernelConfig;
  private shareScope: Record<string, any> = {};
  // private events: FynAppEventTarget;
  /**
   * Create a new kernel instance
   * @param config Kernel configuration
   */
  constructor(config: KernelConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || '',
      debug: config.debug || false
    };

    // Initialize the registry
    this.registry = {
      register: (name: string, container: FynappContainer) => {
        this.log(`Registering fynapp: ${name}`);
        this._containers.set(name, container);
      },
      get: (name: string) => {
        return this._containers.get(name);
      },
      has: (name: string) => {
        return this._containers.has(name);
      }
    };

    // Initialize the share scope
    this.shareScope = { default: {} };

    this.log('Kernel created');
  }

  // Internal map of containers
  private _containers: Map<string, FynappContainer> = new Map();

  /**
   * Clean up a container name to ensure it's a valid identifier
   * - replace all chars @/-. with _, and then remove leading _
   *
   * @param name
   */
  private cleanContainerName(name: string): string {
    return name.replace(/[\@\-./]/g, "_").replace(/^_*/, "");
  }

  /**
   * Get the fynapp registry
   * @returns The fynapp registry
   */
  public getRegistry(): FynappRegistry {
    return this.registry;
  }

  /**
   * Log a message if debug mode is enabled
   * @param message Message to log
   * @param args Additional arguments
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[Kernel] ${message}`, ...args);
    }
  }
}
