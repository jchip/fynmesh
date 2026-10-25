/**
 * A host page: the script that runs after the kernel bundle has created the
 * global `fynMeshKernel` (see the README's "Basic Kernel Setup").
 */
import type { FynAppLoadEventDetail, RegistryResolverResult } from "@fynmesh/kernel";

const kernel = globalThis.fynMeshKernel;

// Map a FynApp name and semver range to its manifest. A real host asks its
// registry here; this one serves every FynApp from one CDN.
kernel.setRegistryResolver(async (name, range): Promise<RegistryResolverResult> => ({
  name,
  version: range ?? "latest",
  url: `https://cdn.example.com/${name}/dist/fynapp.manifest.json`,
  distBase: `https://cdn.example.com/${name}/dist/`,
}));

// Show load progress
kernel.events.on("FYNAPP_LOADED", (event) => {
  const { name, version, ok } = (event as CustomEvent<FynAppLoadEventDetail>).detail;
  console.log(`${name}@${version} ${ok ? "loaded" : "failed to load"}`);
});

async function start(): Promise<void> {
  // Two versions of the same app on one page, each picked by its range
  await kernel.loadFynAppsByName(
    [
      { name: "fynapp-1" },
      { name: "fynapp-x1", range: "^1.0.0" },
      { name: "fynapp-x1", range: "^2.0.0" },
    ],
    { concurrency: 4, preload: 1 },
  );

  for (const state of kernel.listFynAppStates()) {
    console.log(`${state.name}@${state.version}: ${state.status}`);
  }

  // Add-on APIs exist only when their bundle is loaded
  kernel.bus?.emit("host.ready", { at: Date.now() });
}

start().catch((err) => console.error("FynApp batch could not be planned:", err));
