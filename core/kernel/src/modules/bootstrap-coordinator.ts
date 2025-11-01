/**
 * Bootstrap Coordination Module
 * Handles FynApp bootstrap serialization and dependency coordination
 */

import type { FynApp } from "../types";
import type { FynEventTarget } from "../event-target";

export interface BootstrapDependencies {
  bootstrappingApp: string | null;
  deferredBootstraps: Array<{ fynApp: FynApp; resolve: () => void }>;
  fynAppBootstrapStatus: Map<string, "bootstrapped">;
  fynAppProviderModes: Map<string, Map<string, "provider" | "consumer">>;
}

export class BootstrapCoordinator {
  public bootstrappingApp: string | null = null;
  public deferredBootstraps: Array<{ fynApp: FynApp; resolve: () => void }> = [];
  public fynAppBootstrapStatus: Map<string, "bootstrapped"> = new Map();
  public fynAppProviderModes: Map<string, Map<string, "provider" | "consumer">> = new Map();
  public events: FynEventTarget;

  constructor(events: FynEventTarget) {
    this.events = events;
    
    // Listen for bootstrap completion events
    this.events.on("FYNAPP_BOOTSTRAPPED", (event: Event) => {
      this.handleFynAppBootstrapped(event as CustomEvent);
    });
  }

  /**
   * Get current bootstrap state
   */
  getBootstrapState(): BootstrapDependencies {
    return {
      bootstrappingApp: this.bootstrappingApp,
      deferredBootstraps: [...this.deferredBootstraps],
      fynAppBootstrapStatus: new Map(this.fynAppBootstrapStatus),
      fynAppProviderModes: new Map(this.fynAppProviderModes),
    };
  }

  /**
   * Check if a FynApp can bootstrap
   */
  canBootstrap(fynApp: FynApp): boolean {
    return this.bootstrappingApp === null && 
           this.areBootstrapDependenciesSatisfied(fynApp);
  }

  /**
   * Acquire bootstrap lock
   */
  acquireBootstrapLock(fynAppName: string): boolean {
    if (this.bootstrappingApp !== null) {
      return false;
    }
    this.bootstrappingApp = fynAppName;
    console.debug(`🔒 ${fynAppName} acquired bootstrap lock`);
    return true;
  }

  /**
   * Release bootstrap lock
   */
  releaseBootstrapLock(): void {
    this.bootstrappingApp = null;
  }

  /**
   * Defer a bootstrap until dependencies are ready
   */
  deferBootstrap(fynApp: FynApp): Promise<void> {
    const reason = this.bootstrappingApp !== null
      ? `${this.bootstrappingApp} is currently bootstrapping`
      : `waiting for provider dependencies`;

    console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);

    return new Promise<void>((resolve) => {
      this.deferredBootstraps.push({ fynApp, resolve });
    });
  }

  /**
   * Mark a FynApp as bootstrapped
   */
  markBootstrapped(fynAppName: string): void {
    this.fynAppBootstrapStatus.set(fynAppName, "bootstrapped");
  }

  /**
   * Register provider/consumer mode for a FynApp
   */
  registerProviderMode(
    fynAppName: string, 
    middlewareName: string, 
    mode: "provider" | "consumer"
  ): void {
    if (!this.fynAppProviderModes.has(fynAppName)) {
      this.fynAppProviderModes.set(fynAppName, new Map());
    }
    const modes = this.fynAppProviderModes.get(fynAppName)!;
    modes.set(middlewareName, mode);
    console.debug(`📝 ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
  }

  /**
   * Handle FynApp bootstrap completion event
   * Resume any deferred bootstraps that have their dependencies satisfied
   */
  private async handleFynAppBootstrapped(event: CustomEvent): Promise<void> {
    const { name } = event.detail;

    console.debug(`✅ FynApp ${name} bootstrap complete, checking deferred bootstraps`);

    // Mark this FynApp as bootstrapped
    this.markBootstrapped(name);

    // Clear the currently bootstrapping app
    this.releaseBootstrapLock();

    // Find the FIRST deferred bootstrap whose dependencies are now satisfied
    let nextIndex = -1;
    for (let i = 0; i < this.deferredBootstraps.length; i++) {
      const deferred = this.deferredBootstraps[i];
      if (this.areBootstrapDependenciesSatisfied(deferred.fynApp)) {
        nextIndex = i;
        break;
      }
    }

    // Resume the ready FynApp and remove from queue
    if (nextIndex >= 0) {
      const next = this.deferredBootstraps.splice(nextIndex, 1)[0];
      console.debug(`🔄 Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
      next.resolve();
    } else if (this.deferredBootstraps.length > 0) {
      console.debug(
        `⏸️ ${this.deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`
      );
    }
  }

  /**
   * Check if a FynApp's bootstrap dependencies are satisfied
   */
  protected areBootstrapDependenciesSatisfied(fynApp: FynApp): boolean {
    // Get this FynApp's provider/consumer modes for each middleware
    const modes = this.fynAppProviderModes.get(fynApp.name);
    if (!modes) {
      // No provider/consumer info, dependencies are satisfied
      return true;
    }

    // Check each middleware this FynApp uses
    for (const [middlewareName, mode] of modes.entries()) {
      if (mode === "consumer") {
        // This FynApp is a consumer - find the provider
        const providerName = this.findProviderForMiddleware(middlewareName, fynApp.name);

        if (providerName && !this.fynAppBootstrapStatus.has(providerName)) {
          // Provider exists but hasn't bootstrapped yet
          console.debug(
            `⏳ ${fynApp.name} waiting for provider ${providerName} to bootstrap (middleware: ${middlewareName})`
          );
          return false;
        }
      }
    }

    // All dependencies satisfied
    return true;
  }

  /**
   * Find which FynApp is the provider for a given middleware
   */
  protected findProviderForMiddleware(middlewareName: string, excludeFynApp: string): string | null {
    for (const [fynAppName, modes] of this.fynAppProviderModes.entries()) {
      if (fynAppName === excludeFynApp) continue;

      const mode = modes.get(middlewareName);
      if (mode === "provider") {
        return fynAppName;
      }
    }
    return null;
  }

  /**
   * Clear all bootstrap state
   */
  clear(): void {
    this.bootstrappingApp = null;
    this.deferredBootstraps = [];
    this.fynAppBootstrapStatus.clear();
    this.fynAppProviderModes.clear();
  }
}
