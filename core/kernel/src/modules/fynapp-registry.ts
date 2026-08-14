/**
 * FynApp Registry Module
 * Encapsulates the tracking and lookup of loaded FynApps.
 */

import type { FynApp } from "../types";

export interface FynAppRegistry {
  /** Initialize or replace the underlying data object */
  initialize(apps: Record<string, FynApp>): void;
  /** Add a FynApp, registered under both `name` and `name@version`. */
  add(fynApp: FynApp): void;
  /** Get a FynApp by lookup key (name or name@version) */
  get(key: string): FynApp | undefined;
  /** Whether a FynApp is loaded under this lookup key */
  has(key: string): boolean;
  /** Remove a FynApp under all of its keys */
  remove(fynApp: FynApp, lookupName?: string): void;
}

/** Both keys a FynApp is registered under. */
const keysOf = (fynApp: FynApp) => [`${fynApp.name}@${fynApp.version}`, fynApp.name];

export const FynAppRegistry = function (initial?: Record<string, FynApp>): FynAppRegistry {
  let apps = initial || {};
  return {
    initialize(next) {
      apps = next;
    },
    add(fynApp) {
      for (const key of keysOf(fynApp)) apps[key] = fynApp;
    },
    get: (key) => apps[key],
    has: (key) => !!apps[key],
    remove(fynApp, lookupName) {
      if (lookupName) delete apps[lookupName];
      for (const key of keysOf(fynApp)) delete apps[key];
    },
  };
} as unknown as new (apps?: Record<string, FynApp>) => FynAppRegistry;
