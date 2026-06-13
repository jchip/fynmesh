/**
 * FynApp Registry Module
 * Encapsulates the tracking and lookup of loaded FynApps.
 */

import type { FynApp } from "../types";

export class FynAppRegistry {
  private appsLoaded: Record<string, FynApp>;

  constructor(appsLoaded?: Record<string, FynApp>) {
    this.appsLoaded = appsLoaded || {};
  }

  /**
   * Initialize or replace the underlying data object
   */
  initialize(appsLoaded: Record<string, FynApp>): void {
    this.appsLoaded = appsLoaded;
  }

  /**
   * Add a FynApp to the registry. Registers by exact name and name@version.
   */
  add(fynApp: FynApp): void {
    const versionedKey = `${fynApp.name}@${fynApp.version}`;
    this.appsLoaded[versionedKey] = fynApp;
    this.appsLoaded[fynApp.name] = fynApp;
  }

  /**
   * Get a FynApp by its lookup key (name or name@version)
   */
  get(key: string): FynApp | undefined {
    return this.appsLoaded[key];
  }

  /**
   * Check if a FynApp is already loaded by its lookup key (name or name@version)
   */
  has(key: string): boolean {
    return !!this.appsLoaded[key];
  }

  /**
   * Remove a FynApp from the registry completely
   */
  remove(fynApp: FynApp, lookupName?: string): void {
    const versionedKey = `${fynApp.name}@${fynApp.version}`;
    if (lookupName) delete this.appsLoaded[lookupName];
    delete this.appsLoaded[versionedKey];
    delete this.appsLoaded[fynApp.name];
  }
}
