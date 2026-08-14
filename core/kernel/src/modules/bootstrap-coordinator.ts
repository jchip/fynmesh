/**
 * Bootstrap Coordination Module
 * Handles FynApp bootstrap serialization and dependency coordination
 */

import type { FynApp, KernelTelemetry } from "../types";
import type { FynEventTarget } from "../event-target";
import { noOpTelemetry, captureEvent } from "../kernel-telemetry";

/** Default bootstrap timeout: 30 seconds */
const DEFAULT_BOOTSTRAP_TIMEOUT = 30000;

type Deferred = {
  fynApp: FynApp;
  resolve: () => void;
  timeoutId?: ReturnType<typeof setTimeout>;
};

export interface BootstrapCoordinator {
  /** Name of the app currently holding the bootstrap lock, or null. */
  bootstrappingApp: string | null;
  deferredBootstraps: Deferred[];
  fynAppBootstrapStatus: Map<string, "bootstrapped">;
  fynAppProviderModes: Map<string, Map<string, "provider" | "consumer">>;
  events: FynEventTarget;
  setTimeout(timeout: number): void;
  canBootstrap(fynApp: FynApp): boolean;
  acquireBootstrapLock(fynAppName: string): boolean;
  releaseBootstrapLock(): void;
  deferBootstrap(fynApp: FynApp): Promise<void>;
  registerProviderMode(
    fynAppName: string,
    middlewareName: string,
    mode: "provider" | "consumer",
  ): void;
  areBootstrapDependenciesSatisfied(fynApp: FynApp): boolean;
  findProviderForMiddleware(middlewareName: string, excludeFynApp: string): string | null;
  clear(): void;
}

/**
 * Built as a closure over its state rather than a class — see the note on
 * `ManifestResolver`.
 *
 * The collections are declared once and handed out on the returned object, so
 * internal code reaches them through a one-character closure variable while
 * external readers still see the same live Map/Array. Only `bootstrappingApp`
 * and `timeout` are reassigned primitives, so those get accessors — the
 * telemetry tests set `bootstrappingApp` directly to simulate a busy lock.
 */
export const BootstrapCoordinator = function (
  events: FynEventTarget,
  timeoutMs?: number,
  telemetry?: KernelTelemetry,
): BootstrapCoordinator {
  const tel = telemetry ?? noOpTelemetry;
  const deferredBootstraps: Deferred[] = [];
  const fynAppBootstrapStatus = new Map<string, "bootstrapped">();
  const fynAppProviderModes = new Map<string, Map<string, "provider" | "consumer">>();
  let bootstrappingApp: string | null = null;
  let timeout = timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT;

  /** Find which FynApp is the provider for a given middleware */
  const findProviderForMiddleware = (
    middlewareName: string,
    excludeFynApp: string,
  ): string | null => {
    for (const [fynAppName, modes] of fynAppProviderModes.entries()) {
      if (fynAppName === excludeFynApp) continue;
      if (modes.get(middlewareName) === "provider") {
        return fynAppName;
      }
    }
    return null;
  };

  /** Check if a FynApp's bootstrap dependencies are satisfied */
  const areBootstrapDependenciesSatisfied = (fynApp: FynApp): boolean => {
    // Get this FynApp's provider/consumer modes for each middleware
    let modes = fynAppProviderModes.get(fynApp.name);
    if (!modes) {
      // No provider/consumer info, dependencies are satisfied
      return true;
    }

    // Check each middleware this FynApp uses
    for (const [middlewareName, mode] of modes.entries()) {
      if (mode === "consumer") {
        // This FynApp is a consumer - find the provider
        const providerName = findProviderForMiddleware(middlewareName, fynApp.name);

        if (providerName && !fynAppBootstrapStatus.has(providerName)) {
          // Provider exists but hasn't bootstrapped yet
          console.debug(
            `⏳ ${fynApp.name} waiting for provider ${providerName} to bootstrap (mw: ${middlewareName})`,
          );
          return false;
        }
      }
    }

    // All dependencies satisfied
    return true;
  };

  /** Release bootstrap lock and resume the next eligible deferred bootstrap. */
  const finishBootstrapAndResumeNext = (): void => {
    // Clear the currently bootstrapping app
    bootstrappingApp = null;

    // Find the FIRST deferred bootstrap whose dependencies are now satisfied
    const nextIndex = deferredBootstraps.findIndex((d) =>
      areBootstrapDependenciesSatisfied(d.fynApp),
    );

    // Resume the ready FynApp and remove from queue
    if (nextIndex >= 0) {
      const next = deferredBootstraps.splice(nextIndex, 1)[0];
      console.debug(`🔄 Resuming deferred bootstrap for ${next.fynApp.name} (dependencies satisfied)`);
      captureEvent(tel, "resumed", { app: next.fynApp.name });
      next.resolve();
    } else if (deferredBootstraps.length > 0) {
      console.debug(`⏸️ ${deferredBootstraps.length} deferred bootstrap(s) still waiting for dependencies`);
    }
  };

  // Listen for bootstrap completion events
  events.on("FYNAPP_BOOTSTRAPPED", (event: Event) => {
    const { name } = (event as CustomEvent).detail;
    console.debug(`✅ FynApp ${name} bootstrap complete, checking deferred bootstraps`);
    captureEvent(tel, "completed", { app: name });
    fynAppBootstrapStatus.set(name, "bootstrapped");
    finishBootstrapAndResumeNext();
  });

  // Also advance deferred queue on failures so the kernel doesn't stall.
  // Intentionally does not mark the app as bootstrapped; it only releases the
  // lock and advances apps whose dependencies are already satisfied.
  events.on("FYNAPP_BOOTSTRAP_FAILED", (event: Event) => {
    const { name, error } = (event as CustomEvent).detail;
    console.debug(`❌ FynApp ${name} bootstrap failed, checking deferred bootstraps`);
    // Only attach an error object when the event actually carries one; fabricating
    // one here would record a misleading coordinator-local stack and message.
    if (error) {
      tel.capErr("failed", { app: name }, error);
    } else {
      tel.capture({ type: "error", name: "failed", data: { app: name } });
    }
    finishBootstrapAndResumeNext();
  });

  return {
    events,
    deferredBootstraps,
    fynAppBootstrapStatus,
    fynAppProviderModes,
    areBootstrapDependenciesSatisfied,
    findProviderForMiddleware,

    get bootstrappingApp() {
      return bootstrappingApp;
    },
    set bootstrappingApp(value: string | null) {
      bootstrappingApp = value;
    },

    setTimeout(value) {
      timeout = value;
    },

    canBootstrap: (fynApp) =>
      bootstrappingApp === null && areBootstrapDependenciesSatisfied(fynApp),

    acquireBootstrapLock(fynAppName) {
      if (bootstrappingApp !== null) {
        return false;
      }
      bootstrappingApp = fynAppName;
      console.debug(`🔒 ${fynAppName} acquired bootstrap lock`);
      captureEvent(tel, "lock.acquired", { app: fynAppName });
      return true;
    },

    releaseBootstrapLock() {
      bootstrappingApp = null;
    },

    /**
     * Defer a bootstrap until dependencies are ready.
     * If timeout is reached, the FynApp is skipped with an error.
     */
    deferBootstrap(fynApp) {
      const reason =
        bootstrappingApp !== null
          ? `${bootstrappingApp} is currently bootstrapping`
          : `waiting for provider dependencies`;

      console.debug(`⏸️ Deferring bootstrap of ${fynApp.name} (${reason})`);
      captureEvent(tel, "deferred", { app: fynApp.name, reason });

      return new Promise<void>((resolve) => {
        const deferred: Deferred = {
          fynApp,
          resolve: () => {
            // Clear timeout when resolved normally
            if (deferred.timeoutId) {
              clearTimeout(deferred.timeoutId);
            }
            resolve();
          },
        };

        // Set up timeout - party goes on even if this FynApp times out
        deferred.timeoutId = setTimeout(() => {
          // Remove from deferred queue
          const idx = deferredBootstraps.indexOf(deferred);
          if (idx >= 0) {
            deferredBootstraps.splice(idx, 1);
          }

          const message = `Bootstrap timeout (${timeout}ms): ${fynApp.name} timed out waiting for ${reason}`;

          // Log timeout error but don't reject - allow promise to resolve.
          // This prevents blocking the entire bootstrap process.
          console.error(`⏰ ${message}. Skipping this FynApp - the party goes on!`);

          // Capture timeout error for tel
          tel.capErr(
            "timeout",
            { app: fynApp.name, timeout, reason },
            new Error(message),
          );

          // Emit timeout event for observability
          events.dispatchEvent(
            new CustomEvent("FYNAPP_BOOTSTRAP_TIMEOUT", {
              detail: { name: fynApp.name, version: fynApp.version, reason, timeout },
            }),
          );

          // Resolve instead of reject - party goes on!
          // The FynApp just won't be bootstrapped.
          resolve();
        }, timeout);

        deferredBootstraps.push(deferred);
      });
    },

    registerProviderMode(fynAppName, middlewareName, mode) {
      let modes = fynAppProviderModes.get(fynAppName);
      if (!modes) {
        modes = new Map();
        fynAppProviderModes.set(fynAppName, modes);
      }
      modes.set(middlewareName, mode);
      console.debug(`📝 ${fynAppName} registered as ${mode} for middleware ${middlewareName}`);
    },

    clear() {
      bootstrappingApp = null;
      // Clear any pending timeouts
      for (const deferred of deferredBootstraps) {
        if (deferred.timeoutId) {
          clearTimeout(deferred.timeoutId);
        }
      }
      // Emptied in place rather than replaced: the array is also handed out on
      // this object, so callers holding it must see the clear.
      deferredBootstraps.length = 0;
      fynAppBootstrapStatus.clear();
      fynAppProviderModes.clear();
    },
  };
} as unknown as new (
  events: FynEventTarget,
  timeout?: number,
  tel?: KernelTelemetry,
) => BootstrapCoordinator;
