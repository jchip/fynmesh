/**
 * Rollup needs at least one entry to get the build started. We use a virtual entry
 * to satisfy this requirement. The dummy entry is not used.
 */
export const fynappDummyEntryName = "fynapp-dummy-entry";

/** The filename of the FynApp module federation entry. */
export const fynappEntryFilename = "fynapp-entry.js";

/** The module federation share scope used by FynMesh and FynApps. */
export const fynmeshShareScope = "fynmesh";
