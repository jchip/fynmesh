// Service Worker for FynMesh Demo Server
// This version unregisters itself and clears all caches

const SW_VERSION = "UNREGISTER";

console.log("[Service Worker] Unregister version loaded - cleaning up...");

// Immediately unregister on install
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Installing unregister version");
  self.skipWaiting();
});

// Clear all caches and unregister on activate
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activating unregister version - clearing caches");

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log("[Service Worker] Deleting cache:", cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        console.log("[Service Worker] All caches cleared");
        return self.clients.claim();
      })
      .then(() => {
        // Unregister this service worker
        return self.registration.unregister();
      })
      .then(() => {
        console.log("[Service Worker] Successfully unregistered");
      })
  );
});

// Don't intercept any requests - pass through to network
self.addEventListener("fetch", (event) => {
  // Do nothing - let requests go directly to network
});
